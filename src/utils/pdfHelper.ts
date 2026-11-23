import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

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

    // Extract text items for provenance quote highlighting
    const textContent = await page.getTextContent();
    const items = textContent.items as Array<{
      str: string;
      transform: number[];
      width: number;
      height: number;
    }>;

    const pageText = items.map((it) => it.str).join(' ');
    const highlights: HighlightRect[] = [];

    if (highlightQuote && highlightQuote.trim().length > 4) {
      const tokens = highlightQuote
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 4);

      const distinctTokens = Array.from(new Set(tokens)).slice(0, 10);

      for (const item of items) {
        const text = item.str?.trim();
        if (!text || text.length < 3) continue;
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
