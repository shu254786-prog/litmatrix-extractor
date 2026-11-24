import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpenCheck,
  Settings,
  KeyRound,
  CheckCircle2,
  Download,
  Upload,
  Smartphone,
  Database,
} from 'lucide-react';
import {
  CORE_DIMENSIONS,
  type ExtractionSettings,
  type PaperRow,
  type ProvenanceTarget,
} from './types/matrix';
import { DEMO_PAPERS } from './data/demoPapers';
import { getPdfPageCount } from './utils/pdfHelper';
import { downloadTextFile, exportMatrixToExcel } from './utils/exporters';
import { DropzonePanel } from './components/DropzonePanel';
import { MatrixTable } from './components/MatrixTable';
import { ProvenanceDrawer } from './components/ProvenanceDrawer';
import { SettingsModal } from './components/SettingsModal';
import { MarkdownPreviewModal } from './components/MarkdownPreviewModal';
import { SynthesisModal } from './components/SynthesisModal';
import { CloudSyncDrawer, type CloudJobSummary } from './components/CloudSyncDrawer';

const SETTINGS_STORAGE_KEY = 'litmatrix_settings_v1';
const WEB_TOKEN_STORAGE_KEY = 'litmatrix_web_token_v1';

const DEFAULT_SETTINGS: ExtractionSettings = {
  provider: 'gemini',
  apiKey: '',
  customBaseUrl: '',
  model: 'gemini-4-hydrogen',
  language: 'zh',
  concurrency: 3,
  thinkingLevel: 'low',
  customDimensions: [],
};

export function App() {
  const [settings, setSettings] = useState<ExtractionSettings>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS;
  });

  const [authToken, setAuthToken] = useState<string>(() => {
    try {
      return localStorage.getItem(WEB_TOKEN_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [syncCode, setSyncCode] = useState('');
  const [userName, setUserName] = useState('桌面工作台');

  const [activeJobId, setActiveJobId] = useState('');
  const [activeJobTitle, setActiveJobTitle] = useState('当前工作台');
  const [cloudJobs, setCloudJobs] = useState<CloudJobSummary[]>([]);
  const [cloudDrawerOpen, setCloudDrawerOpen] = useState(false);
  const [cloudLoading, setCloudLoading] = useState(false);

  const [papers, setPapers] = useState<PaperRow[]>([]);
  const [providersConfigured, setProvidersConfigured] = useState<{
    gemini: boolean;
    deepseek: boolean;
    qwen: boolean;
  }>({ gemini: false, deepseek: false, qwen: false });
  const [isRunning, setIsRunning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [markdownOpen, setMarkdownOpen] = useState(false);
  const [provenanceTarget, setProvenanceTarget] = useState<ProvenanceTarget | null>(null);

  const [synthesisOpen, setSynthesisOpen] = useState(false);
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [synthesisText, setSynthesisText] = useState('');

  const fileMapRef = useRef<Map<string, File>>(new Map());
  const importJsonRef = useRef<HTMLInputElement | null>(null);

  const getAuthHeaders = useCallback(
    (extra: Record<string, string> = {}) => {
      const headers: Record<string, string> = { ...extra };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      if (settings.apiKey.trim()) {
        headers['x-llm-api-key'] = settings.apiKey.trim();
        headers['x-gemini-api-key'] = settings.apiKey.trim();
      }
      return headers;
    },
    [authToken, settings.apiKey]
  );

  const fetchCloudJobs = useCallback(
    async (tokenOverride?: string, autoSelectFirst = false) => {
      setCloudLoading(true);
      try {
        const tok = tokenOverride ?? authToken;
        const headers: Record<string, string> = {};
        if (tok) headers['Authorization'] = `Bearer ${tok}`;
        const resp = await fetch('/api/jobs', { headers });
        if (!resp.ok) return;
        const data = await resp.json();
        const list = (data.jobs || []) as CloudJobSummary[];
        setCloudJobs(list);

        if (autoSelectFirst && list.length > 0) {
          setActiveJobId(list[0].id);
          setActiveJobTitle(list[0].title);
          setPapers(list[0].papers || []);
        }
      } catch {
        // ignore offline errors
      } finally {
        setCloudLoading(false);
      }
    },
    [authToken]
  );

  // Initialize web session + check health + load persisted SQLite batches
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => {
        if (d?.providersConfigured) {
          setProvidersConfigured(d.providersConfigured);
        } else {
          setProvidersConfigured({
            gemini: Boolean(d?.hasServerApiKey),
            deepseek: false,
            qwen: false,
          });
        }
      })
      .catch(() => {});

    (async () => {
      try {
        const storedToken = localStorage.getItem(WEB_TOKEN_STORAGE_KEY) || '';
        const resp = await fetch('/api/auth/web-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: storedToken }),
        });
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.token) {
          setAuthToken(data.token);
          localStorage.setItem(WEB_TOKEN_STORAGE_KEY, data.token);
        }
        if (data.user) {
          setSyncCode(data.user.syncCode || '');
          setUserName(data.user.nickName || '桌面工作台');
        }
        await fetchCloudJobs(data.token, true);
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  const allDimensions = useMemo(
    () => [...CORE_DIMENSIONS, ...settings.customDimensions],
    [settings.customDimensions]
  );

  const hasEnvKeyForCurrentProvider =
    settings.provider === 'gemini'
      ? providersConfigured.gemini
      : settings.provider === 'deepseek'
      ? providersConfigured.deepseek
      : settings.provider === 'qwen'
      ? providersConfigured.qwen
      : false;
  const hasApiKey = Boolean(settings.apiKey.trim() || hasEnvKeyForCurrentProvider);

  const handleFilesAdded = useCallback(
    async (files: File[]) => {
      const newRows: PaperRow[] = [];

      for (const file of files) {
        const duplicate = papers.some(
          (p) => p.fileName === file.name && p.fileSize === file.size
        );
        if (duplicate) continue;

        const id = `paper_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        fileMapRef.current.set(id, file);
        const pageCount = await getPdfPageCount(file);

        newRows.push({
          id,
          fileName: file.name,
          fileSize: file.size,
          pageCount,
          status: 'queued',
        });
      }

      if (newRows.length > 0) {
        // If current batch is a demo batch, start a clean active workspace for real PDFs
        if (activeJobId.startsWith('demo_')) {
          setActiveJobId('');
          setActiveJobTitle(`桌面批量提取 (${newRows.length} 篇)`);
          setPapers(newRows);
        } else {
          setPapers((prev) => [...prev, ...newRows]);
        }
      }
    },
    [papers, activeJobId]
  );

  const ensureActiveCloudJob = useCallback(
    async (paperCountHint: number): Promise<string> => {
      if (activeJobId && !activeJobId.startsWith('demo_')) {
        return activeJobId;
      }
      const resp = await fetch('/api/jobs', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          title: `PC 批量矩阵 (${paperCountHint}篇) · ${new Date().toLocaleTimeString(
            'zh-CN',
            { hour: '2-digit', minute: '2-digit', hour12: false }
          )}`,
          provider: settings.provider,
          customBaseUrl: settings.customBaseUrl,
          model: settings.model,
          language: settings.language,
          thinkingLevel: settings.thinkingLevel,
          concurrency: settings.concurrency,
          customDimensions: settings.customDimensions,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.job?.id) {
        throw new Error(data?.error || '创建云端矩阵批次失败');
      }
      setActiveJobId(data.job.id);
      setActiveJobTitle(data.job.title);
      return data.job.id as string;
    },
    [activeJobId, getAuthHeaders, settings]
  );

  const extractSinglePaper = useCallback(
    async (paper: PaperRow, jobId: string) => {
      let file = fileMapRef.current.get(paper.id);

      // Support re-extracting a paper whose PDF is already persisted on the server
      if (!file && paper.hasPdf) {
        try {
          const pdfResp = await fetch(`/api/papers/${paper.id}/pdf`);
          if (pdfResp.ok) {
            const blob = await pdfResp.blob();
            file = new File([blob], paper.fileName, { type: 'application/pdf' });
            fileMapRef.current.set(paper.id, file);
          }
        } catch {
          // ignore
        }
      }

      if (!file) {
        setPapers((prev) =>
          prev.map((p) =>
            p.id === paper.id
              ? { ...p, status: 'error', error: '找不到本地或云端 PDF 文件，请重新拖入' }
              : p
          )
        );
        return;
      }

      setPapers((prev) =>
        prev.map((p) =>
          p.id === paper.id ? { ...p, status: 'extracting', error: undefined } : p
        )
      );

      try {
        const formData = new FormData();
        formData.append('pdf', file);
        formData.append('jobId', jobId);
        formData.append('existingPaperId', paper.id);
        formData.append('fileName', file.name);
        formData.append('provider', settings.provider);
        formData.append('customBaseUrl', settings.customBaseUrl || '');
        formData.append('model', settings.model);
        formData.append('language', settings.language);
        formData.append('thinkingLevel', settings.thinkingLevel);
        if (paper.pageCount > 0) {
          formData.append('totalPages', String(paper.pageCount));
        }
        if (settings.customDimensions.length > 0) {
          formData.append(
            'customDimensions',
            JSON.stringify(settings.customDimensions)
          );
        }

        const resp = await fetch('/api/extract', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        });

        const payload = await resp.json();
        if (!resp.ok) {
          throw new Error(payload?.error || `HTTP ${resp.status}`);
        }

        setPapers((prev) =>
          prev.map((p) =>
            p.id === paper.id
              ? {
                  ...p,
                  id: payload.paper?.id || paper.id,
                  status: 'done',
                  hasPdf: true,
                  extraction: payload.extraction,
                  durationMs: payload.durationMs,
                  modelUsed: payload.modelUsed,
                }
              : p
          )
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : '提取失败';
        setPapers((prev) =>
          prev.map((p) =>
            p.id === paper.id ? { ...p, status: 'error', error: message } : p
          )
        );
      }
    },
    [settings, getAuthHeaders]
  );

  const runQueue = useCallback(
    async (targetIds?: string[]) => {
      if (isRunning) return;
      if (!hasApiKey) {
        setSettingsOpen(true);
        return;
      }

      const targets = papers.filter((p) =>
        targetIds ? targetIds.includes(p.id) : p.status === 'queued'
      );
      if (targets.length === 0) return;

      setIsRunning(true);
      try {
        const jobId = await ensureActiveCloudJob(papers.length);
        const queue = [...targets];
        const workerCount = Math.min(settings.concurrency, queue.length);

        const workers = Array.from({ length: workerCount }, async () => {
          while (queue.length > 0) {
            const next = queue.shift();
            if (!next) break;
            await extractSinglePaper(next, jobId);
          }
        });

        await Promise.all(workers);
        await fetchCloudJobs();
      } catch (err) {
        alert(err instanceof Error ? err.message : '批量队列启动失败');
      } finally {
        setIsRunning(false);
      }
    },
    [
      isRunning,
      hasApiKey,
      papers,
      settings.concurrency,
      ensureActiveCloudJob,
      extractSinglePaper,
      fetchCloudJobs,
    ]
  );

  const handleRetryFailed = () => {
    const failedIds = papers.filter((p) => p.status === 'error').map((p) => p.id);
    if (failedIds.length === 0) return;
    setPapers((prev) =>
      prev.map((p) =>
        failedIds.includes(p.id) ? { ...p, status: 'queued', error: undefined } : p
      )
    );
    setTimeout(() => runQueue(failedIds), 50);
  };

  const handleReextractPaper = (paperId: string) => {
    if (isRunning) return;
    const target = papers.find((p) => p.id === paperId);
    if (!fileMapRef.current.has(paperId) && !target?.hasPdf) {
      alert('该记录无原始 PDF 文件，请重新拖入该 PDF。');
      return;
    }
    runQueue([paperId]);
  };

  const handleLoadDemo = async () => {
    try {
      const resp = await fetch('/api/jobs/demo', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.job) {
          setActiveJobId(data.job.id);
          setActiveJobTitle(data.job.title);
          setPapers(data.job.papers || []);
          fetchCloudJobs();
          return;
        }
      }
    } catch {
      // Fallback to offline demo
    }
    setPapers(DEMO_PAPERS);
  };

  const handleClearAll = () => {
    if (isRunning) return;
    fileMapRef.current.clear();
    setActiveJobId('');
    setActiveJobTitle('新建工作台');
    setPapers([]);
    setProvenanceTarget(null);
  };

  const handleRemovePaper = async (id: string) => {
    fileMapRef.current.delete(id);
    setPapers((prev) => prev.filter((p) => p.id !== id));
    if (provenanceTarget?.paperId === id) {
      setProvenanceTarget(null);
    }
    if (activeJobId) {
      await fetch(`/api/jobs/${activeJobId}/papers/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }).catch(() => {});
      fetchCloudJobs();
    }
  };

  const handleUpdateCellSummary = async (
    paperId: string,
    dimKey: string,
    newSummary: string
  ) => {
    setPapers((prev) =>
      prev.map((p) => {
        if (p.id !== paperId || !p.extraction) return p;
        const ext = { ...p.extraction };
        if (
          dimKey === 'research_question' ||
          dimKey === 'methodology' ||
          dimKey === 'datasets' ||
          dimKey === 'conclusions' ||
          dimKey === 'limitations'
        ) {
          ext[dimKey] = { ...ext[dimKey], summary: newSummary };
        } else if (ext.custom_dimensions) {
          ext.custom_dimensions = ext.custom_dimensions.map((cd) =>
            cd.key === dimKey ? { ...cd, summary: newSummary } : cd
          );
        }
        return { ...p, extraction: ext };
      })
    );

    if (activeJobId) {
      await fetch(`/api/jobs/${activeJobId}/papers/${paperId}`, {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ dimKey, summary: newSummary }),
      }).catch(() => {});
    }
  };

  const handleSelectCloudJob = (job: CloudJobSummary) => {
    setActiveJobId(job.id);
    setActiveJobTitle(job.title);
    setPapers(job.papers || []);
    setCloudDrawerOpen(false);
  };

  const handleCreateNewJob = async () => {
    fileMapRef.current.clear();
    setActiveJobId('');
    setActiveJobTitle('新建工作台');
    setPapers([]);
    setCloudDrawerOpen(false);
  };

  const handleRenameJob = async (jobId: string, title: string) => {
    const resp = await fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title }),
    });
    if (resp.ok) {
      if (jobId === activeJobId) setActiveJobTitle(title);
      fetchCloudJobs();
    }
  };

  const handleDeleteCloudJob = async (jobId: string) => {
    await fetch(`/api/jobs/${jobId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (jobId === activeJobId) {
      setActiveJobId('');
      setActiveJobTitle('新建工作台');
      setPapers([]);
    }
    fetchCloudJobs();
  };

  const handleBindSyncCode = async (targetCode: string) => {
    const resp = await fetch('/api/auth/pair', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ syncCode: targetCode }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data?.error || '绑定失败');
    }
    if (data.token) {
      setAuthToken(data.token);
      localStorage.setItem(WEB_TOKEN_STORAGE_KEY, data.token);
    }
    if (data.user) {
      setSyncCode(data.user.syncCode || '');
      setUserName(data.user.nickName || '已跨端绑定用户');
    }
    await fetchCloudJobs(data.token, true);
  };

  const handleGenerateSynthesis = async () => {
    if (!hasApiKey) {
      setSettingsOpen(true);
      return;
    }
    const completed = papers.filter((p) => p.status === 'done' && p.extraction);
    if (completed.length < 2) return;

    setSynthesisOpen(true);
    setSynthesisLoading(true);
    setSynthesisError(null);

    try {
      const resp = await fetch('/api/synthesize', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          provider: settings.provider,
          customBaseUrl: settings.customBaseUrl,
          model: settings.model,
          language: settings.language,
          papers: completed.map((p) => {
            const e = p.extraction!;
            return {
              title: e.title,
              authors: e.authors,
              year: e.year,
              research_question: e.research_question.summary,
              methodology: e.methodology.summary,
              datasets: e.datasets.summary,
              conclusions: e.conclusions.summary,
              limitations: e.limitations.summary,
            };
          }),
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || `HTTP ${resp.status}`);
      }
      setSynthesisText(data.synthesis || '');
    } catch (err) {
      setSynthesisError(err instanceof Error ? err.message : '生成综述失败');
    } finally {
      setSynthesisLoading(false);
    }
  };

  const handleExportJson = () => {
    const completed = papers.filter((p) => p.status === 'done');
    const dateTag = new Date().toISOString().slice(0, 10);
    downloadTextFile(
      JSON.stringify(completed, null, 2),
      `litmatrix_backup_${dateTag}.json`,
      'application/json;charset=utf-8'
    );
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text) as PaperRow[];
      if (Array.isArray(imported)) {
        setPapers((prev) => {
          const existing = new Set(prev.map((p) => p.id));
          return [...prev, ...imported.filter((item) => !existing.has(item.id))];
        });
      }
    } catch {
      alert('JSON 格式无效');
    }
    e.target.value = '';
  };

  const completedCount = papers.filter((p) => p.status === 'done').length;
  const activeTargetPaper = provenanceTarget
    ? papers.find((p) => p.id === provenanceTarget.paperId)
    : undefined;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-slate-900 text-white shadow-xs">
              <BookOpenCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-slate-900">
                  LitMatrix · 文献综述矩阵提取器
                </h1>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-200/70">
                  {settings.provider} · {settings.model}
                </span>
                {activeJobId && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
                    <Database className="h-2.5 w-2.5" />
                    已同步：{activeJobTitle}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                电脑批量拖入 20+ 篇 PDF · SQLite 持久化 · 手机微信小程序实时互通查看与转发
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Cloud Sync & WeChat Handoff Button */}
            <button
              type="button"
              onClick={() => {
                fetchCloudJobs();
                setCloudDrawerOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/90 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>微信互通 · 云端库 ({cloudJobs.length})</span>
              {syncCode && (
                <span className="font-mono rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {syncCode}
                </span>
              )}
            </button>

            <input
              ref={importJsonRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportJson}
            />
            <button
              type="button"
              onClick={() => importJsonRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              title="导入此前保存的矩阵 JSON"
            >
              <Upload className="h-3.5 w-3.5" />
              导入
            </button>
            {completedCount > 0 && (
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                title="备份当前矩阵 JSON"
              >
                <Download className="h-3.5 w-3.5" />
                备份
              </button>
            )}

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                hasApiKey
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              {hasApiKey ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  {settings.provider.toUpperCase()} 已就绪
                </>
              ) : (
                <>
                  <KeyRound className="h-3.5 w-3.5 text-amber-600" />
                  配置模型 Key
                </>
              )}
              <Settings className="ml-0.5 h-3.5 w-3.5 opacity-70" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 sm:px-6">
        <DropzonePanel
          papers={papers}
          isRunning={isRunning}
          hasApiKey={hasApiKey}
          onFilesAdded={handleFilesAdded}
          onStartExtraction={() => runQueue()}
          onRetryFailed={handleRetryFailed}
          onLoadDemo={handleLoadDemo}
          onClearAll={handleClearAll}
          onRemovePaper={handleRemovePaper}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <MatrixTable
          papers={papers}
          dimensions={allDimensions}
          onOpenProvenance={(target) => setProvenanceTarget(target)}
          onUpdateCellSummary={handleUpdateCellSummary}
          onReextractPaper={handleReextractPaper}
          onRemovePaper={handleRemovePaper}
          onExportExcel={() => exportMatrixToExcel(papers, allDimensions)}
          onOpenMarkdown={() => setMarkdownOpen(true)}
          onOpenSynthesis={handleGenerateSynthesis}
        />
      </main>

      {/* Modals & Drawers */}
      <ProvenanceDrawer
        target={provenanceTarget}
        pdfFile={
          provenanceTarget ? fileMapRef.current.get(provenanceTarget.paperId) : undefined
        }
        pdfUrl={
          provenanceTarget && activeTargetPaper?.hasPdf
            ? `/api/papers/${provenanceTarget.paperId}/pdf`
            : undefined
        }
        onClose={() => setProvenanceTarget(null)}
      />

      <CloudSyncDrawer
        open={cloudDrawerOpen}
        syncCode={syncCode}
        userName={userName}
        activeJobId={activeJobId}
        jobs={cloudJobs}
        loading={cloudLoading}
        onClose={() => setCloudDrawerOpen(false)}
        onRefresh={() => fetchCloudJobs()}
        onSelectJob={handleSelectCloudJob}
        onCreateNewJob={handleCreateNewJob}
        onRenameJob={handleRenameJob}
        onDeleteJob={handleDeleteCloudJob}
        onBindSyncCode={handleBindSyncCode}
      />

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        providersConfigured={providersConfigured}
        onSave={(next) => setSettings(next)}
        onClose={() => setSettingsOpen(false)}
      />

      <MarkdownPreviewModal
        open={markdownOpen}
        papers={papers}
        dimensions={allDimensions}
        onClose={() => setMarkdownOpen(false)}
      />

      <SynthesisModal
        open={synthesisOpen}
        loading={synthesisLoading}
        error={synthesisError}
        content={synthesisText}
        paperCount={completedCount}
        onGenerate={handleGenerateSynthesis}
        onClose={() => setSynthesisOpen(false)}
      />
    </div>
  );
}

export default App;
