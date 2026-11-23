import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface ParsedPdfPage {
  pageNumber: number;
  text: string;
  lines: string[];
}

export interface ParsedPdfDocument {
  numPages: number;
  metadataTitle?: string;
  metadataAuthor?: string;
  pages: ParsedPdfPage[];
}

export async function getPdfPageCount(file: File): Promise<number> {
  try {
    const buffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    const count = pdf.numPages;
    await loadingTask.destroy();
    return count;
  } catch {
    return 0;
  }
}

/**
 * Group pdf.js text items by vertical line position so multi-column & wrapped lines
 * keep clean sentence boundaries for both Offline NLP and LLM page-indexed prompts.
 */
function reconstructPageLines(
  items: Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>
): string[] {
  const lines: string[] = [];
  let currentLine = '';
  let lastY: number | null = null;

  for (const item of items) {
    const str = item.str ?? '';
    if (!str) {
      if (item.hasEOL && currentLine.trim()) {
        lines.push(currentLine.trim());
        currentLine = '';
      }
      continue;
    }

    const y = Array.isArray(item.transform) ? Math.round(item.transform[5]) : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = str;
    } else {
      const needsSpace =
        currentLine.length > 0 &&
        !/[\s\-/(\[“‘\u4e00-\u9fa5]$/.test(currentLine) &&
        !/^[\s.,;:!?)\]”’\u4e00-\u9fa5]/.test(str);
      currentLine += (needsSpace ? ' ' : '') + str;
    }

    if (item.hasEOL) {
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = '';
      lastY = null;
    } else {
      lastY = y;
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export async function extractPdfPagesText(file: File): Promise<ParsedPdfDocument> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  try {
    const numPages = pdf.numPages;
    let metadataTitle: string | undefined;
    let metadataAuthor: string | undefined;

    try {
      const meta = await pdf.getMetadata();
      const info = meta?.info as Record<string, unknown> | undefined;
      if (typeof info?.Title === 'string' && info.Title.trim().length > 3) {
        metadataTitle = info.Title.trim();
      }
      if (typeof info?.Author === 'string' && info.Author.trim().length > 1) {
        metadataAuthor = info.Author.trim();
      }
    } catch {
      // ignore metadata failure
    }

    const pages: ParsedPdfPage[] = [];
    for (let pageNo = 1; pageNo <= numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const textContent = await page.getTextContent();
      const items = textContent.items as Array<{
        str?: string;
        transform?: number[];
        hasEOL?: boolean;
      }>;
      const lines = reconstructPageLines(items);
      const text = lines.join('\n');
      pages.push({ pageNumber: pageNo, text, lines });
    }

    return {
      numPages,
      metadataTitle,
      metadataAuthor,
      pages,
    };
  } finally {
    await loadingTask.destroy();
  }
}

export interface HighlightRect {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

export async function renderPdfPageToCanvas(params: {
  file: File;
  pageNumber: number;
  canvas: HTMLCanvasElement;
  scale?: number;
  highlightQuote?: string;
}): Promise<{ numPages: number; highlights: HighlightRect[]; pageText: string }> {
  const { file, pageNumber, canvas, scale = 1.45, highlightQuote } = params;
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  try {
    const numPages = pdf.numPages;
    const safePage = Math.max(1, Math.min(numPages, pageNumber));
    const page = await pdf.getPage(safePage);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale });

    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { numPages, highlights: [], pageText: '' };
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const textContent = await page.getTextContent();
    const items = textContent.items as Array<{
      str: string;
      transform: number[];
      width: number;
      height: number;
    }>;

    const pageText = items.map((it) => it.str).join(' ');
    const highlights: HighlightRect[] = [];

    if (highlightQuote && highlightQuote.trim().length > 3) {
      // Support both English multi-word tokens and Chinese 2-4 char chunks
      const rawTokens = highlightQuote
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 3);

      const cjkMatches = highlightQuote.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
      const distinctTokens = Array.from(new Set([...rawTokens, ...cjkMatches])).slice(0, 12);

      for (const item of items) {
        const text = item.str?.trim();
        if (!text || text.length < 2) continue;
        const lower = text.toLowerCase();
        const matched = distinctTokens.some((tok) => lower.includes(tok));
        if (!matched) continue;

        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(tx[2], tx[3]) || 12;
        const x = tx[4];
        const y = tx[5] - fontHeight;
        const w = (item.width || 20) * scale;
        const h = fontHeight * 1.2;

        highlights.push({
          leftPct: Math.max(0, (x / viewport.width) * 100),
          topPct: Math.max(0, (y / viewport.height) * 100),
          widthPct: Math.min(100, (w / viewport.width) * 100),
          heightPct: Math.min(100, (h / viewport.height) * 100),
        });
      }
    }

    return { numPages, highlights, pageText };
  } finally {
    await loadingTask.destroy();
  }
}
