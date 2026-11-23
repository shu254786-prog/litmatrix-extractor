import React, { useState } from 'react';
import { X, Key, Plus, Trash2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import type { DimensionConfig, ExtractionSettings, GeminiModelId } from '../types/matrix';

interface SettingsModalProps {
  open: boolean;
  settings: ExtractionSettings;
  hasServerApiKey: boolean;
  onSave: (next: ExtractionSettings) => void;
  onClose: () => void;
}

const MODELS: Array<{ id: GeminiModelId; label: string; desc: string }> = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen (推荐默认)',
    desc: '1M 上下文 · 多模态 PDF 抽取速度与准确度最佳平衡',
  },
  {
    id: 'gemini-4-argon',
    label: 'Gemini 4 Argon',
    desc: '1M 上下文 · 强化深度推理，适合公式密集/复杂论文',
  },
  {
    id: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon',
    desc: '1M 上下文 · 旗舰最强推理模型，适合超高难度文献综述',
  },
  {
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    desc: '1M 上下文 · 极速低成本，适合 20+ 篇大批量初筛',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  settings,
  hasServerApiKey,
  onSave,
  onClose,
}) => {
  const [draft, setDraft] = useState<ExtractionSettings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDesc, setNewDesc] = useState('');

  if (!open) return null;

  const addCustomDimension = () => {
    const label = newLabel.trim();
    if (!label) return;
    const key = `custom_${Date.now()}`;
    const nextDim: DimensionConfig = {
      key,
      label,
      description: newDesc.trim() || `提取论文中的「${label}」相关信息并附带页码溯源`,
      isCore: false,
    };
    setDraft((d) => ({
      ...d,
      customDimensions: [...d.customDimensions, nextDim],
    }));
    setNewLabel('');
    setNewDesc('');
  };

  const removeCustomDimension = (key: string) => {
    setDraft((d) => ({
      ...d,
      customDimensions: d.customDimensions.filter((c) => c.key !== key),
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              AI Studio 模型与提取设置
            </h2>
            <p className="text-xs text-slate-500">
              配置 Google AI Studio API Key、并发线程及自定义对比矩阵列
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭设置窗口"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 text-xs">
          {/* API Key */}
          <div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 font-semibold text-slate-800">
                <Key className="h-3.5 w-3.5 text-indigo-600" />
                Google AI Studio API Key
              </label>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-medium text-indigo-600 hover:underline"
              >
                前往 AI Studio 获取 Key ↗
              </a>
            </div>
            {hasServerApiKey && !draft.apiKey && (
              <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                服务端环境变量 GEMINI_API_KEY 已配置，可直接开始提取（也可在此覆盖）。
              </div>
            )}
            <div className="relative mt-1.5">
              <input
                type={showKey ? 'text' : 'password'}
                value={draft.apiKey}
                onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                placeholder="AIzaSy...（仅保存在本地浏览器 localStorage）"
                className="font-mono w-full rounded-lg border border-slate-300 px-3 py-2 pr-9 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <label className="block font-semibold text-slate-800">Gemini 模型选择</label>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {MODELS.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition ${
                    draft.model === m.id
                      ? 'border-indigo-500 bg-indigo-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    checked={draft.model === m.id}
                    onChange={() => setDraft({ ...draft, model: m.id })}
                    className="mt-0.5 accent-indigo-600"
                  />
                  <div>
                    <div className="font-semibold text-slate-900">{m.label}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{m.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Language, Concurrency, Thinking */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block font-semibold text-slate-800">总结输出语言</label>
              <select
                value={draft.language}
                onChange={(e) =>
                  setDraft({ ...draft, language: e.target.value as 'zh' | 'en' })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800"
              >
                <option value="zh">中文（保留英文术语）</option>
                <option value="en">English</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-800">批量并发数</label>
              <select
                value={draft.concurrency}
                onChange={(e) =>
                  setDraft({ ...draft, concurrency: Number(e.target.value) })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800"
              >
                <option value={1}>1 篇并行（最稳）</option>
                <option value={2}>2 篇并行</option>
                <option value={3}>3 篇并行（推荐）</option>
                <option value={4}>4 篇并行</option>
                <option value={5}>5 篇并行（极速）</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-800">思考深度</label>
              <select
                value={draft.thinkingLevel}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    thinkingLevel: e.target.value as
                      | 'minimal'
                      | 'low'
                      | 'medium'
                      | 'high',
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800"
              >
                <option value="minimal">Minimal（最快）</option>
                <option value="low">Low（推荐）</option>
                <option value="medium">Medium（精细）</option>
                <option value="high">High（最深度）</option>
              </select>
            </div>
          </div>

          {/* Custom Extra Dimensions */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <label className="block font-semibold text-slate-800">
              附加自定义提取列（可选）
            </label>
            <p className="mt-0.5 text-[11px] text-slate-500">
              默认固定提取 5 个核心列（研究问题 / 方法 / 数据集 / 结论 / 局限性），您还可以追加自定义列（如「开源代码链接」「基线对比」「消融实验」）。
            </p>

            {draft.customDimensions.length > 0 && (
              <div className="mt-3 space-y-2">
                {draft.customDimensions.map((cd) => (
                  <div
                    key={cd.key}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <div>
                      <span className="font-semibold text-slate-800">{cd.label}</span>
                      <span className="ml-2 text-[11px] text-slate-500">
                        {cd.description}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCustomDimension(cd.key)}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="列名（如：代码与复现性）"
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:w-40"
              />
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="提取要求描述（可选）"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={addCustomDimension}
                className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
              >
                <Plus className="h-3.5 w-3.5" />
                添加列
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
};
