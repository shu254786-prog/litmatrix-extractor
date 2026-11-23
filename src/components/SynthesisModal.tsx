import React, { useState } from 'react';
import { X, Sparkles, Copy, Check, Loader2 } from 'lucide-react';

interface SynthesisModalProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  content: string;
  paperCount: number;
  onGenerate: () => void;
  onClose: () => void;
}

export const SynthesisModal: React.FC<SynthesisModalProps> = ({
  open,
  loading,
  error,
  content,
  paperCount,
  onGenerate,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]">
      <div className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                AI 横向对比综述草稿（基于 {paperCount} 篇矩阵）
              </h2>
              <p className="text-xs text-slate-500">
                自动梳理研究脉络、方法流派优劣、数据集共识与共性局限性
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭综述窗口"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              <p className="mt-3 text-xs font-medium">
                Gemini 正在综合对比 {paperCount} 篇文献矩阵并撰写 Related Work 草稿...
              </p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
              {error}
            </div>
          ) : content ? (
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
              {content}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-500">
              点击下方按钮开始生成横向综述对比。
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3.5">
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {content ? '重新生成' : '立即生成'}
          </button>
          <div className="flex items-center gap-2">
            {content && (
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    复制全文
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
