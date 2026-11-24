import React, { useState } from 'react';
import {
  X,
  Smartphone,
  Copy,
  Check,
  RefreshCw,
  FolderPlus,
  Trash2,
  Link2,
  Database,
  Pencil,
} from 'lucide-react';
import type { PaperRow } from '../types/matrix';

export interface CloudJobSummary {
  id: string;
  title: string;
  status: 'idle' | 'running' | 'completed';
  model: string;
  updatedAt: number;
  papers: PaperRow[];
}

interface CloudSyncDrawerProps {
  open: boolean;
  syncCode: string;
  userName: string;
  activeJobId: string;
  jobs: CloudJobSummary[];
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSelectJob: (job: CloudJobSummary) => void;
  onCreateNewJob: () => void;
  onRenameJob: (jobId: string, title: string) => void;
  onDeleteJob: (jobId: string) => void;
  onBindSyncCode: (targetCode: string) => Promise<void>;
}

function formatSyncCode(code: string): string {
  if (!code || code.length !== 6) return code || '------';
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export const CloudSyncDrawer: React.FC<CloudSyncDrawerProps> = ({
  open,
  syncCode,
  userName,
  activeJobId,
  jobs,
  loading,
  onClose,
  onRefresh,
  onSelectJob,
  onCreateNewJob,
  onRenameJob,
  onDeleteJob,
  onBindSyncCode,
}) => {
  const [copied, setCopied] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [binding, setBinding] = useState(false);
  const [bindMessage, setBindMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [editingJob, setEditingJob] = useState<{ id: string; title: string } | null>(
    null
  );

  if (!open) return null;

  const handleCopyCode = async () => {
    if (!syncCode) return;
    await navigator.clipboard.writeText(syncCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleBind = async () => {
    const clean = inputCode.replace(/\D/g, '');
    if (clean.length !== 6) {
      setBindMessage({ ok: false, text: '请输入另一端的 6 位数字互通码' });
      return;
    }
    setBinding(true);
    setBindMessage(null);
    try {
      await onBindSyncCode(clean);
      setInputCode('');
      setBindMessage({
        ok: true,
        text: '跨端绑定成功！电脑网页与微信小程序现已共享同一文献库。',
      });
    } catch (err) {
      setBindMessage({
        ok: false,
        text: err instanceof Error ? err.message : '绑定失败',
      });
    } finally {
      setBinding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px]">
      <div className="flex h-full w-full max-w-md flex-col bg-slate-50 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              <Smartphone className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                云端文献库 · 微信小程序互通
              </h2>
              <p className="text-[11px] text-slate-500">
                SQLite 持久化存储 · 当前身份：{userName || '桌面工作台'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭云端文献库"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Apple Handoff Style Continuity Card */}
          <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-600 to-indigo-700 p-4 text-white shadow-sm">
            <div className="flex items-center justify-between text-xs opacity-90">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Link2 className="h-3.5 w-3.5" />
                本机跨端互通码 (Handoff)
              </span>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px]">
                双向实时同步
              </span>
            </div>

            <div className="mt-2.5 flex items-center justify-between">
              <span className="font-mono text-2xl font-bold tracking-widest">
                {formatSyncCode(syncCode)}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1 rounded-lg bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-xs transition hover:bg-white/30"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    复制互通码
                  </>
                )}
              </button>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-blue-100">
              打开微信小程序「我的 → 电脑网页端跨端互通」输入上方 6 位码，电脑拖入的 20 篇 PDF 矩阵将自动同步到手机微信查看与转发。
            </p>

            {/* Reverse Bind Box */}
            <div className="mt-3 flex gap-2 border-t border-white/15 pt-3">
              <input
                type="text"
                maxLength={7}
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="或输入小程序上的 6 位互通码"
                className="font-mono flex-1 rounded-lg bg-white/95 px-2.5 py-1.5 text-xs text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleBind}
                disabled={binding}
                className="shrink-0 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
              >
                {binding ? '绑定中...' : '绑定'}
              </button>
            </div>

            {bindMessage && (
              <div
                className={`mt-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${
                  bindMessage.ok
                    ? 'bg-emerald-400/20 text-emerald-50'
                    : 'bg-rose-500/30 text-rose-50'
                }`}
              >
                {bindMessage.text}
              </div>
            )}
          </div>

          {/* Saved Batches List Header */}
          <div className="flex items-center justify-between pt-1">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Database className="h-3.5 w-3.5 text-indigo-600" />
              云端矩阵批次 ({jobs.length})
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </button>
              <button
                type="button"
                onClick={onCreateNewJob}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                新建批次
              </button>
            </div>
          </div>

          {/* Saved Batches Cards */}
          {jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">
              暂无已保存的云端矩阵批次。拖入 PDF 提取或加载示例矩阵后会自动持久化保存于此。
            </div>
          ) : (
            <div className="space-y-2.5">
              {jobs.map((job) => {
                const isActive = job.id === activeJobId;
                const doneCount = job.papers.filter((p) => p.status === 'done').length;
                const isEditing = editingJob?.id === job.id;

                return (
                  <div
                    key={job.id}
                    onClick={() => {
                      if (!isEditing) onSelectJob(job);
                    }}
                    className={`cursor-pointer rounded-xl border p-3.5 transition ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500/30'
                        : 'border-slate-200 bg-white hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      {isEditing ? (
                        <div
                          className="flex flex-1 items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={editingJob.title}
                            onChange={(e) =>
                              setEditingJob({ id: job.id, title: e.target.value })
                            }
                            className="flex-1 rounded border border-indigo-400 bg-white px-2 py-1 text-xs font-semibold text-slate-900 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              onRenameJob(job.id, editingJob.title);
                              setEditingJob(null);
                            }}
                            className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white"
                          >
                            保存
                          </button>
                        </div>
                      ) : (
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-bold text-slate-900">
                              {job.title}
                            </span>
                            {isActive && (
                              <span className="shrink-0 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                当前打开
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">
                            完成 {doneCount}/{job.papers.length} 篇 ·{' '}
                            {new Date(job.updatedAt).toLocaleString('zh-CN', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      )}

                      {!isEditing && (
                        <div
                          className="flex shrink-0 items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setEditingJob({ id: job.id, title: job.title })
                            }
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="重命名批次"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteJob(job.id)}
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            title="删除批次"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
