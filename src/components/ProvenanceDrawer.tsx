import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Quote,
  BookOpen,
  FileWarning,
  Loader2,
} from 'lucide-react';
import type { ProvenanceTarget } from '../types/matrix';
import { renderPdfPageToCanvas, type HighlightRect } from '../utils/pdfHelper';

interface ProvenanceDrawerProps {
  target: ProvenanceTarget | null;
  pdfFile?: File;
  onClose: () => void;
}

export const ProvenanceDrawer: React.FC<ProvenanceDrawerProps> = ({
  target,
  pdfFile,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [scale, setScale] = useState(1.35);
  const [loading, setLoading] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<HighlightRect[]>([]);

  useEffect(() => {
    if (target) {
      setCurrentPage(target.citation.pdf_page || 1);
      setRenderError(null);
    }
  }, [target]);

  useEffect(() => {
    if (!target || !pdfFile || !canvasRef.current) {
      setHighlights([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setRenderError(null);

    renderPdfPageToCanvas({
      file: pdfFile,
      pageNumber: currentPage,
      canvas: canvasRef.current,
      scale,
      highlightQuote:
        currentPage === target.citation.pdf_page ? target.citation.quote : undefined,
    })
      .then((res) => {
        if (cancelled) return;
        setTotalPages(res.numPages);
        setHighlights(res.highlights);
      })
      .catch((err) => {
        if (cancelled) return;
        setRenderError(err instanceof Error ? err.message : 'PDF 渲染失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [target, pdfFile, currentPage, scale]);

  if (!target) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]">
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                <BookOpen className="h-3.5 w-3.5" />
                页码溯源 · {target.dimensionLabel}
              </span>
              <span className="font-mono rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                PDF P.{target.citation.pdf_page}
              </span>
            </div>
            <h3 className="mt-1.5 truncate text-sm font-semibold text-slate-900">
              {target.paperTitle}
            </h3>
            <p className="truncate font-mono text-[11px] text-slate-500">
              {target.fileName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭溯源抽屉"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Quote Evidence Banner */}
        <div className="border-b border-amber-200/80 bg-amber-50/70 px-5 py-3.5">
          <div className="flex items-center justify-between text-xs font-medium text-amber-900">
            <span className="inline-flex items-center gap-1.5">
              <Quote className="h-3.5 w-3.5 text-amber-600" />
              原文定位摘录（章节：{target.citation.section || '正文'}）
            </span>
            {highlights.length > 0 && (
              <span className="rounded bg-amber-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                已在下方高亮 {highlights.length} 处匹配词段
              </span>
            )}
          </div>
          <blockquote className="mt-1.5 border-l-2 border-amber-400 pl-3 text-xs leading-relaxed text-slate-800 italic">
            “{target.citation.quote}”
          </blockquote>
        </div>

        {/* PDF Toolbar */}
        {pdfFile && (
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || loading}
                className="rounded-md border border-slate-200 bg-white p-1 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 font-mono text-xs font-medium text-slate-700">
                第 {currentPage} / {totalPages} 页
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || loading}
                className="rounded-md border border-slate-200 bg-white p-1 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {currentPage !== target.citation.pdf_page && (
                <button
                  type="button"
                  onClick={() => setCurrentPage(target.citation.pdf_page)}
                  className="ml-2 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-200"
                >
                  回到溯源页 P.{target.citation.pdf_page}
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(0.75, +(s - 0.15).toFixed(2)))}
                className="rounded-md border border-slate-200 bg-white p-1 text-slate-700 hover:bg-slate-100"
                title="缩小"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="w-12 text-center font-mono text-xs text-slate-600">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(2.4, +(s + 0.15).toFixed(2)))}
                className="rounded-md border border-slate-200 bg-white p-1 text-slate-700 hover:bg-slate-100"
                title="放大"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* PDF Viewport */}
        <div className="relative flex-1 overflow-auto bg-slate-200/70 p-4">
          {!pdfFile ? (
            <div className="mx-auto mt-10 max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-xs">
              <FileWarning className="mx-auto h-9 w-9 text-amber-500" />
              <h4 className="mt-3 text-sm font-semibold text-slate-900">
                当前条目为示例数据或刷新后恢复的记录
              </h4>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                本地 PDF 二进制文件仅保存在当前会话内存中。拖入您的真实论文 PDF 提取后，点击任意{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5">P.页码</code>{' '}
                即可在此直接渲染对应页面并高亮原文摘录。
              </p>
            </div>
          ) : renderError ? (
            <div className="mx-auto mt-10 max-w-md rounded-xl border border-rose-200 bg-white p-6 text-center">
              <p className="text-sm font-medium text-rose-700">{renderError}</p>
            </div>
          ) : (
            <div className="relative mx-auto w-fit shadow-lg">
              {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                </div>
              )}
              <canvas ref={canvasRef} className="block rounded-sm bg-white" />
              {/* Highlight overlay layer */}
              <div className="pointer-events-none absolute inset-0">
                {highlights.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      left: `${h.leftPct}%`,
                      top: `${h.topPct}%`,
                      width: `${h.widthPct}%`,
                      height: `${h.heightPct}%`,
                    }}
                    className="absolute rounded-[2px] bg-amber-300/45 ring-1 ring-amber-400/60"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
