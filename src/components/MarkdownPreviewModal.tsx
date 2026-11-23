import React, { useMemo, useState } from 'react';
import { X, Copy, Check, Download } from 'lucide-react';
import type { DimensionConfig, PaperRow } from '../types/matrix';
import { buildMarkdownMatrix, downloadTextFile } from '../utils/exporters';

interface MarkdownPreviewModalProps {
  open: boolean;
  papers: PaperRow[];
  dimensions: DimensionConfig[];
  onClose: () => void;
}

export const MarkdownPreviewModal: React.FC<MarkdownPreviewModalProps> = ({
  open,
  papers,
  dimensions,
  onClose,
}) => {
  const [includeAppendix, setIncludeAppendix] = useState(true);
  const [copied, setCopied] = useState(false);

  const markdown = useMemo(
    () => (open ? buildMarkdownMatrix(papers, dimensions, includeAppendix) : ''),
    [open, papers, dimensions, includeAppendix]
  );

  if (!open) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const dateTag = new Date().toISOString().slice(0, 10);
    downloadTextFile(
      markdown,
      `文献综述对比矩阵_${dateTag}.md`,
      'text/markdown;charset=utf-8'
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Markdown 文献对比矩阵导出
            </h2>
            <p className="text-xs text-slate-500">
              可直接粘贴到 Notion、Obsidian、GitHub 或学术笔记中
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭 Markdown 预览"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-2.5 text-xs">
          <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-700">
            <input
              type="checkbox"
              checked={includeAppendix}
              onChange={(e) => setIncludeAppendix(e.target.checked)}
              className="accent-indigo-600"
            />
            附带「页码溯源与原文摘录附录」
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  复制 Markdown
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 font-semibold text-white hover:bg-indigo-700"
            >
              <Download className="h-3.5 w-3.5" />
              下载 .md 文件
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-950 p-5">
          <pre className="font-mono whitespace-pre-wrap text-xs leading-relaxed text-slate-200">
            {markdown}
          </pre>
        </div>
      </div>
    </div>
  );
};
