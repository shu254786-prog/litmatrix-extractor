import React, { useRef, useState } from 'react';
import {
  FileText,
  UploadCloud,
  Sparkles,
  Play,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
} from 'lucide-react';
import type { PaperRow } from '../types/matrix';

interface DropzonePanelProps {
  papers: PaperRow[];
  isRunning: boolean;
  hasApiKey: boolean;
  onFilesAdded: (files: File[]) => void;
  onStartExtraction: () => void;
  onRetryFailed: () => void;
  onLoadDemo: () => void;
  onClearAll: () => void;
  onRemovePaper: (id: string) => void;
  onOpenSettings: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const DropzonePanel: React.FC<DropzonePanelProps> = ({
  papers,
  isRunning,
  hasApiKey,
  onFilesAdded,
  onStartExtraction,
  onRetryFailed,
  onLoadDemo,
  onClearAll,
  onRemovePaper,
  onOpenSettings,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const queuedCount = papers.filter((p) => p.status === 'queued').length;
  const extractingCount = papers.filter((p) => p.status === 'extracting').length;
  const doneCount = papers.filter((p) => p.status === 'done').length;
  const errorCount = papers.filter((p) => p.status === 'error').length;
  const progressPct =
    papers.length > 0 ? Math.round((doneCount / papers.length) * 100) : 0;

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length > 0) {
      onFilesAdded(files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length > 0) {
      onFilesAdded(files);
    }
    e.target.value = '';
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-center">
        {/* Dropzone Box */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`lg:col-span-7 flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed px-5 py-4 transition-all ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/70'
              : 'border-slate-300 bg-slate-50/60 hover:border-indigo-400 hover:bg-indigo-50/30'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">
                批量拖入论文 PDF（支持一次拖入 20+ 篇）
              </p>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                单篇最大 50MB
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              点击选择或拖拽 PDF 到此，自动提取「研究问题 / 方法 / 数据集 / 结论 / 局限性」并附带 1-indexed 页码溯源
            </p>
          </div>
        </div>

        {/* Queue Actions & Status */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-xs font-medium text-slate-600">
              <span>总计 {papers.length} 篇</span>
              <span className="text-emerald-600">完成 {doneCount}</span>
              {extractingCount > 0 && (
                <span className="text-indigo-600">提取中 {extractingCount}</span>
              )}
              {queuedCount > 0 && (
                <span className="text-amber-600">待处理 {queuedCount}</span>
              )}
              {errorCount > 0 && (
                <span className="text-rose-600">失败 {errorCount}</span>
              )}
            </div>
            {papers.length > 0 && (
              <span className="font-mono text-xs font-semibold text-slate-700">
                {progressPct}%
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {queuedCount > 0 && (
              <button
                type="button"
                onClick={hasApiKey ? onStartExtraction : onOpenSettings}
                disabled={isRunning && extractingCount > 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    正在并发提取...
                  </>
                ) : hasApiKey ? (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    开始提取 ({queuedCount} 篇)
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    配置 API Key 后提取
                  </>
                )}
              </button>
            )}

            {errorCount > 0 && (
              <button
                type="button"
                onClick={onRetryFailed}
                disabled={isRunning}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重试失败 ({errorCount})
              </button>
            )}

            <button
              type="button"
              onClick={onLoadDemo}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              加载示例矩阵
            </button>

            {papers.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                disabled={isRunning}
                className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-200/70 hover:text-rose-600 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                清空
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Compact File Queue Strip */}
      {papers.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {papers.map((p) => (
            <div
              key={p.id}
              title={p.error || p.fileName}
              className={`inline-flex max-w-[270px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
                p.status === 'done'
                  ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800'
                  : p.status === 'extracting'
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                  : p.status === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              {p.status === 'done' && (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              )}
              {p.status === 'extracting' && (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-indigo-600" />
              )}
              {p.status === 'queued' && (
                <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              )}
              {p.status === 'error' && (
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
              )}
              <FileText className="h-3 w-3 shrink-0 opacity-60" />
              <span className="truncate font-medium">{p.fileName}</span>
              <span className="shrink-0 font-mono text-[10px] opacity-70">
                {p.pageCount > 0 ? `${p.pageCount}p` : formatBytes(p.fileSize)}
              </span>
              {p.status !== 'extracting' && (
                <button
                  type="button"
                  onClick={() => onRemovePaper(p.id)}
                  className="ml-0.5 rounded p-0.5 opacity-60 hover:bg-black/5 hover:opacity-100"
                  aria-label="移除"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
