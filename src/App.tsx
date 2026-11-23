import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpenCheck,
  Settings,
  KeyRound,
  CheckCircle2,
  Download,
  Upload,
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

const SETTINGS_STORAGE_KEY = 'litmatrix_settings_v1';
const PAPERS_STORAGE_KEY = 'litmatrix_papers_v1';

const DEFAULT_SETTINGS: ExtractionSettings = {
  apiKey: '',
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
      // ignore storage errors
    }
    return DEFAULT_SETTINGS;
  });

  const [papers, setPapers] = useState<PaperRow[]>(() => {
    try {
      const raw = localStorage.getItem(PAPERS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PaperRow[];
        // Reset interrupted extracting rows to queued on reload
        return parsed.map((p) =>
          p.status === 'extracting' ? { ...p, status: 'queued' } : p
        );
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [hasServerApiKey, setHasServerApiKey] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [markdownOpen, setMarkdownOpen] = useState(false);
  const [provenanceTarget, setProvenanceTarget] = useState<ProvenanceTarget | null>(null);

  const [synthesisOpen, setSynthesisOpen] = useState(false);
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [synthesisText, setSynthesisText] = useState('');

  // Store local File objects in memory for PDF rendering + extraction
  const fileMapRef = useRef<Map<string, File>>(new Map());
  const importJsonRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setHasServerApiKey(Boolean(d?.hasServerApiKey)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  useEffect(() => {
    try {
      // Only persist completed / demo rows (queued local files without File blob cannot be extracted after refresh)
      const persistable = papers.filter((p) => p.status === 'done');
      localStorage.setItem(PAPERS_STORAGE_KEY, JSON.stringify(persistable));
    } catch {
      // ignore
    }
  }, [papers]);

  const allDimensions = useMemo(
    () => [...CORE_DIMENSIONS, ...settings.customDimensions],
    [settings.customDimensions]
  );

  const hasApiKey = Boolean(settings.apiKey.trim() || hasServerApiKey);

  const handleFilesAdded = useCallback(async (files: File[]) => {
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
      setPapers((prev) => [...prev, ...newRows]);
    }
  }, [papers]);

  const extractSinglePaper = useCallback(
    async (paper: PaperRow) => {
      const file = fileMapRef.current.get(paper.id);
      if (!file) {
        setPapers((prev) =>
          prev.map((p) =>
            p.id === paper.id
              ? { ...p, status: 'error', error: '找不到本地 PDF 文件，请重新拖入' }
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
        formData.append('fileName', file.name);
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

        const headers: Record<string, string> = {};
        if (settings.apiKey.trim()) {
          headers['x-gemini-api-key'] = settings.apiKey.trim();
        }

        const resp = await fetch('/api/extract', {
          method: 'POST',
          headers,
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
                  status: 'done',
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
    [settings]
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
      const queue = [...targets];
      const workerCount = Math.min(settings.concurrency, queue.length);

      const workers = Array.from({ length: workerCount }, async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) break;
          await extractSinglePaper(next);
        }
      });

      await Promise.all(workers);
      setIsRunning(false);
    },
    [isRunning, hasApiKey, papers, settings.concurrency, extractSinglePaper]
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
    if (!fileMapRef.current.has(paperId)) {
      alert('该记录的本地 PDF 文件已不在当前内存中，请重新拖入该 PDF。');
      return;
    }
    runQueue([paperId]);
  };

  const handleLoadDemo = () => {
    setPapers((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const additions = DEMO_PAPERS.filter((d) => !existingIds.has(d.id));
      return [...prev, ...additions];
    });
  };

  const handleClearAll = () => {
    if (isRunning) return;
    fileMapRef.current.clear();
    setPapers([]);
    setProvenanceTarget(null);
  };

  const handleRemovePaper = (id: string) => {
    fileMapRef.current.delete(id);
    setPapers((prev) => prev.filter((p) => p.id !== id));
    if (provenanceTarget?.paperId === id) {
      setProvenanceTarget(null);
    }
  };

  const handleUpdateCellSummary = (
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
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (settings.apiKey.trim()) {
        headers['x-gemini-api-key'] = settings.apiKey.trim();
      }

      const resp = await fetch('/api/synthesize', {
        method: 'POST',
        headers,
        body: JSON.stringify({
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
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-slate-900">
                  LitMatrix · 文献综述矩阵提取器
                </h1>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-200/70">
                  AI Studio · {settings.model}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                批量解析 20+ 篇 PDF · 抽取「研究问题 / 方法 / 数据集 / 结论 / 局限性」· 精确页码溯源
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* JSON Backup / Restore */}
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
              导入记录
            </button>
            {completedCount > 0 && (
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                title="备份当前矩阵 JSON"
              >
                <Download className="h-3.5 w-3.5" />
                备份 JSON
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
                  AI Studio 已就绪
                </>
              ) : (
                <>
                  <KeyRound className="h-3.5 w-3.5 text-amber-600" />
                  填入 AI Studio Key
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
        onClose={() => setProvenanceTarget(null)}
      />

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        hasServerApiKey={hasServerApiKey}
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
