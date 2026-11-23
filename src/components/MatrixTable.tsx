import React, { useState } from 'react';
import {
  Search,
  Pencil,
  Check,
  X,
  RotateCw,
  Trash2,
  BookMarked,
  Sparkles,
  FileSpreadsheet,
  FileCode2,
  AlignJustify,
  Maximize2,
} from 'lucide-react';
import type {
  DimensionConfig,
  ExtractedDimension,
  PaperRow,
  ProvenanceTarget,
} from '../types/matrix';

interface MatrixTableProps {
  papers: PaperRow[];
  dimensions: DimensionConfig[];
  onOpenProvenance: (target: ProvenanceTarget) => void;
  onUpdateCellSummary: (paperId: string, dimKey: string, newSummary: string) => void;
  onReextractPaper: (paperId: string) => void;
  onRemovePaper: (paperId: string) => void;
  onExportExcel: () => void;
  onOpenMarkdown: () => void;
  onOpenSynthesis: () => void;
}

function getDimension(paper: PaperRow, key: string): ExtractedDimension | undefined {
  const ext = paper.extraction;
  if (!ext) return undefined;
  if (
    key === 'research_question' ||
    key === 'methodology' ||
    key === 'datasets' ||
    key === 'conclusions' ||
    key === 'limitations'
  ) {
    return ext[key];
  }
  const cd = ext.custom_dimensions?.find((c) => c.key === key);
  if (!cd) return undefined;
  return { summary: cd.summary, keywords: cd.keywords, citations: cd.citations };
}

export const MatrixTable: React.FC<MatrixTableProps> = ({
  papers,
  dimensions,
  onOpenProvenance,
  onUpdateCellSummary,
  onReextractPaper,
  onRemovePaper,
  onExportExcel,
  onOpenMarkdown,
  onOpenSynthesis,
}) => {
  const [query, setQuery] = useState('');
  const [compact, setCompact] = useState(false);
  const [editingCell, setEditingCell] = useState<{
    paperId: string;
    dimKey: string;
    value: string;
  } | null>(null);

  const completedPapers = papers.filter((p) => p.status === 'done' && p.extraction);
  const filteredPapers = completedPapers.filter((p) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    const ext = p.extraction!;
    const haystack = [
      ext.title,
      ext.authors,
      ext.year,
      ext.venue,
      p.fileName,
      ...dimensions.map((d) => {
        const dim = getDimension(p, d.key);
        return `${dim?.summary || ''} ${(dim?.keywords || []).join(' ')}`;
      }),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });

  if (completedPapers.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-6 py-16 text-center">
        <BookMarked className="mx-auto h-10 w-10 text-slate-300" />
        <h3 className="mt-3 text-base font-semibold text-slate-800">
          暂无已提取的文献综述矩阵
        </h3>
        <p className="mx-auto mt-1.5 max-w-lg text-xs leading-relaxed text-slate-500">
          在上方批量拖入您的论文 PDF，点击「开始提取」即可自动生成{' '}
          <span className="font-medium text-slate-700">
            研究问题 / 方法 / 数据集 / 结论 / 局限性
          </span>{' '}
          对比表；也可以点击「加载示例矩阵」立即体验页码溯源与导出功能。
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索论文标题、方法、数据集、关键词..."
              className="w-64 rounded-lg border border-slate-200 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <span className="text-xs text-slate-500">
            显示 <strong className="text-slate-800">{filteredPapers.length}</strong> /{' '}
            {completedPapers.length} 篇
          </span>
          <button
            type="button"
            onClick={() => setCompact((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            title="切换行高密度"
          >
            {compact ? (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                舒适视图
              </>
            ) : (
              <>
                <AlignJustify className="h-3.5 w-3.5" />
                紧凑视图
              </>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenSynthesis}
            disabled={completedPapers.length < 2}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-45"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI 生成横向综述段落
          </button>

          <button
            type="button"
            onClick={onOpenMarkdown}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <FileCode2 className="h-3.5 w-3.5 text-slate-600" />
            Markdown 表格
          </button>

          <button
            type="button"
            onClick={onExportExcel}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            导出 Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Scrollable Table Container */}
      <div className="max-h-[68vh] overflow-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-20 bg-slate-900 text-slate-100">
            <tr>
              <th className="sticky left-0 z-30 min-w-[200px] max-w-[235px] border-r border-slate-700 bg-slate-900 px-3.5 py-3 font-semibold">
                论文信息 (Paper)
              </th>
              {dimensions.map((dim) => (
                <th
                  key={dim.key}
                  className="min-w-[195px] max-w-[280px] border-r border-slate-700/80 px-3.5 py-3 font-semibold last:border-r-0"
                >
                  <div>{dim.label}</div>
                  <div className="mt-0.5 text-[10px] font-normal text-slate-400">
                    {dim.description}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {filteredPapers.map((paper, rowIdx) => {
              const ext = paper.extraction!;
              const rowBg = rowIdx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white';

              return (
                <tr key={paper.id} className={`${rowBg} hover:bg-indigo-50/20`}>
                  {/* Sticky Paper Metadata Column */}
                  <td
                    className={`sticky left-0 z-10 border-r border-slate-200 px-4 align-top ${
                      compact ? 'py-2.5' : 'py-4'
                    } ${rowIdx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}`}
                  >
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-[13px] leading-snug font-semibold text-slate-900">
                          {ext.title}
                        </h4>
                        {paper.isDemo && (
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            示例
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] font-medium text-slate-600">
                        {ext.authors} ·{' '}
                        <span className="font-mono text-indigo-700">{ext.year}</span> ·{' '}
                        <span>{ext.venue}</span>
                      </div>

                      <div className="font-mono truncate text-[10px] text-slate-400" title={paper.fileName}>
                        {paper.fileName} ({paper.pageCount || ext.total_pages_detected}p)
                      </div>

                      <div className="mt-1 flex items-center gap-1.5">
                        {!paper.isDemo && (
                          <button
                            type="button"
                            onClick={() => onReextractPaper(paper.id)}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                            title="重新提取该篇论文"
                          >
                            <RotateCw className="h-2.5 w-2.5" />
                            重抽
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemovePaper(paper.id)}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                          title="从矩阵移除"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                          移除
                        </button>
                        {paper.durationMs && (
                          <span className="ml-auto font-mono text-[10px] text-slate-400">
                            {(paper.durationMs / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Dimension Cells */}
                  {dimensions.map((dim) => {
                    const data = getDimension(paper, dim.key);
                    const isEditing =
                      editingCell?.paperId === paper.id &&
                      editingCell?.dimKey === dim.key;

                    return (
                      <td
                        key={dim.key}
                        className={`group border-r border-slate-200/80 px-4 align-top last:border-r-0 ${
                          compact ? 'py-2.5' : 'py-4'
                        }`}
                      >
                        {!data ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {/* Keywords */}
                            {data.keywords?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {data.keywords.map((kw, i) => (
                                  <span
                                    key={i}
                                    className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
                                  >
                                    {kw}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Summary or Inline Editor */}
                            {isEditing ? (
                              <div className="flex flex-col gap-1.5">
                                <textarea
                                  rows={4}
                                  value={editingCell.value}
                                  onChange={(e) =>
                                    setEditingCell({
                                      ...editingCell,
                                      value: e.target.value,
                                    })
                                  }
                                  className="w-full rounded-lg border border-indigo-400 bg-white p-2 text-xs leading-relaxed text-slate-800 focus:outline-none"
                                />
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingCell(null)}
                                    className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
                                  >
                                    <X className="h-3 w-3" />
                                    取消
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onUpdateCellSummary(
                                        paper.id,
                                        dim.key,
                                        editingCell.value
                                      );
                                      setEditingCell(null);
                                    }}
                                    className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-indigo-700"
                                  >
                                    <Check className="h-3 w-3" />
                                    保存
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="relative">
                                <p
                                  className={`leading-relaxed text-slate-700 ${
                                    compact ? 'line-clamp-3' : ''
                                  }`}
                                >
                                  {data.summary}
                                </p>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingCell({
                                      paperId: paper.id,
                                      dimKey: dim.key,
                                      value: data.summary,
                                    })
                                  }
                                  className="absolute -top-1 -right-1 hidden rounded bg-white/90 p-1 text-slate-400 shadow-xs ring-1 ring-slate-200 group-hover:inline-flex hover:text-indigo-600"
                                  title="微调单元格文本"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </div>
                            )}

                            {/* Page Provenance Badges */}
                            {data.citations?.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                {data.citations.map((cit, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() =>
                                      onOpenProvenance({
                                        paperId: paper.id,
                                        fileName: paper.fileName,
                                        paperTitle: ext.title,
                                        dimensionLabel: dim.label,
                                        citation: cit,
                                      })
                                    }
                                    title={`[${cit.section || '正文'}] “${cit.quote}” — 点击查看 PDF 第 ${cit.pdf_page} 页溯源`}
                                    className="font-mono inline-flex items-center gap-1 rounded-md border border-amber-300/80 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 transition hover:border-amber-400 hover:bg-amber-100"
                                  >
                                    <span>P.{cit.pdf_page}</span>
                                    {cit.section && (
                                      <span className="max-w-[95px] truncate font-sans font-normal text-amber-700/90">
                                        · {cit.section}
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
