import ExcelJS from 'exceljs';
import type { DimensionConfig, ExtractedDimension, PaperRow } from '../types/matrix';

function getDimensionData(
  paper: PaperRow,
  dimKey: string
): ExtractedDimension | undefined {
  const ext = paper.extraction;
  if (!ext) return undefined;
  if (
    dimKey === 'research_question' ||
    dimKey === 'methodology' ||
    dimKey === 'datasets' ||
    dimKey === 'conclusions' ||
    dimKey === 'limitations'
  ) {
    return ext[dimKey];
  }
  const custom = ext.custom_dimensions?.find((c) => c.key === dimKey);
  if (!custom) return undefined;
  return {
    summary: custom.summary,
    keywords: custom.keywords,
    citations: custom.citations,
  };
}

function formatCitationsTag(dim?: ExtractedDimension): string {
  if (!dim || !dim.citations || dim.citations.length === 0) return '';
  const pages = Array.from(new Set(dim.citations.map((c) => `P.${c.pdf_page}`)));
  return `[溯源: ${pages.join(', ')}]`;
}

export function buildMarkdownMatrix(
  papers: PaperRow[],
  dimensions: DimensionConfig[],
  includeProvenanceAppendix = true
): string {
  const completed = papers.filter((p) => p.status === 'done' && p.extraction);
  if (completed.length === 0) return '';

  const escapeCell = (s: string) =>
    s.replace(/\|/g, '\\|').replace(/\r?\n+/g, '<br/>').trim();

  const headers = ['论文 (作者/年份)', ...dimensions.map((d) => d.label)];
  const headerRow = `| ${headers.join(' | ')} |`;
  const sepRow = `| ${headers.map(() => '---').join(' | ')} |`;

  const bodyRows = completed.map((paper) => {
    const ext = paper.extraction!;
    const metaCell = escapeCell(
      `**${ext.title}**<br/>${ext.authors} (${ext.year}) · ${ext.venue}<br/>\`${paper.fileName}\``
    );

    const dimCells = dimensions.map((dim) => {
      const data = getDimensionData(paper, dim.key);
      if (!data) return '—';
      const kw = data.keywords?.length ? `**关键词**: ${data.keywords.join(', ')}<br/>` : '';
      const citeTag = formatCitationsTag(data);
      return escapeCell(`${kw}${data.summary} ${citeTag}`);
    });

    return `| ${[metaCell, ...dimCells].join(' | ')} |`;
  });

  const parts = [
    `# 文献综述对比矩阵（共 ${completed.length} 篇）`,
    '',
    `> 生成时间：${new Date().toLocaleString('zh-CN')} · 由 Gemini AI Studio 文献综述矩阵提取器自动抽取`,
    '',
    headerRow,
    sepRow,
    ...bodyRows,
  ];

  if (includeProvenanceAppendix) {
    parts.push('', '---', '', '## 页码溯源与原文摘录附录 (Page Provenance)', '');
    completed.forEach((paper, idx) => {
      const ext = paper.extraction!;
      parts.push(`### ${idx + 1}. ${ext.title} (${ext.authors}, ${ext.year})`);
      parts.push(`- **PDF 文件**: \`${paper.fileName}\` (共 ${paper.pageCount || ext.total_pages_detected} 页)`);
      dimensions.forEach((dim) => {
        const data = getDimensionData(paper, dim.key);
        if (!data?.citations?.length) return;
        data.citations.forEach((c) => {
          parts.push(
            `- **[${dim.label}] PDF P.${c.pdf_page}** (${c.section || '正文'}): "${c.quote}"`
          );
        });
      });
      parts.push('');
    });
  }

  return parts.join('\n');
}

export function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportMatrixToExcel(
  papers: PaperRow[],
  dimensions: DimensionConfig[]
) {
  const completed = papers.filter((p) => p.status === 'done' && p.extraction);
  if (completed.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LitMatrix · Gemini AI Studio';
  workbook.created = new Date();

  // Sheet 1: Literature Review Comparison Matrix
  const matrixSheet = workbook.addWorksheet('文献综述对比矩阵', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
  });

  const columns: Partial<ExcelJS.Column>[] = [
    { header: '论文标题与基本信息', key: 'paper_info', width: 34 },
    { header: '作者 / 年份 / 会议期刊', key: 'meta', width: 24 },
    ...dimensions.map((d) => ({
      header: d.label,
      key: d.key,
      width: 42,
    })),
  ];
  matrixSheet.columns = columns;

  const headerRow = matrixSheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF334155' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } },
    };
  });

  completed.forEach((paper, idx) => {
    const ext = paper.extraction!;
    const rowData: Record<string, string> = {
      paper_info: `${ext.title}\n\n文件: ${paper.fileName}\n页数: ${paper.pageCount || ext.total_pages_detected} 页`,
      meta: `${ext.authors}\n年份: ${ext.year}\n来源: ${ext.venue}`,
    };

    dimensions.forEach((dim) => {
      const data = getDimensionData(paper, dim.key);
      if (!data) {
        rowData[dim.key] = '—';
        return;
      }
      const kwLine = data.keywords?.length ? `【关键词】${data.keywords.join(' · ')}\n` : '';
      const citeLine = formatCitationsTag(data);
      rowData[dim.key] = `${kwLine}${data.summary}\n\n${citeLine}`.trim();
    });

    const row = matrixSheet.addRow(rowData);
    row.height = 115;
    const isEven = idx % 2 === 1;
    row.eachCell((cell, colNumber) => {
      cell.font = {
        size: 10,
        bold: colNumber === 1,
        color: { argb: 'FF0F172A' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFF8FAFC' : 'FFFFFFFF' },
      };
      cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  // Sheet 2: Page Provenance Audit Log
  const provSheet = workbook.addWorksheet('页码溯源与原文摘录', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  provSheet.columns = [
    { header: '论文标题', key: 'title', width: 34 },
    { header: 'PDF 文件名', key: 'fileName', width: 28 },
    { header: '提取维度', key: 'dimension', width: 16 },
    { header: 'PDF 页码', key: 'page', width: 12 },
    { header: '所在章节', key: 'section', width: 24 },
    { header: '原文摘录 (Verbatim Quote)', key: 'quote', width: 64 },
  ];

  const provHeader = provSheet.getRow(1);
  provHeader.height = 28;
  provHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF312E81' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  completed.forEach((paper) => {
    const ext = paper.extraction!;
    dimensions.forEach((dim) => {
      const data = getDimensionData(paper, dim.key);
      if (!data?.citations?.length) return;
      data.citations.forEach((c) => {
        const r = provSheet.addRow({
          title: ext.title,
          fileName: paper.fileName,
          dimension: dim.label,
          page: `P.${c.pdf_page}`,
          section: c.section || '—',
          quote: c.quote,
        });
        r.eachCell((cell, colNumber) => {
          cell.font = { size: 10, bold: colNumber === 4 };
          cell.alignment = {
            vertical: 'top',
            horizontal: colNumber === 4 ? 'center' : 'left',
            wrapText: true,
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
        });
      });
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const dateTag = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `文献综述对比矩阵_${dateTag}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
