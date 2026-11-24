import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { DATA_DIR } from './db.js';

export const PAGE_CACHE_DIR = path.join(DATA_DIR, 'page_cache');
fs.mkdirSync(PAGE_CACHE_DIR, { recursive: true });

export async function extractPageTaggedText(
  pdfBuffer: Buffer,
  maxChars = 160000
): Promise<{ numPages: number; taggedText: string }> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;

  try {
    const numPages = pdf.numPages;
    const chunks: string[] = [];
    let totalLen = 0;

    for (let p = 1; p <= numPages; p += 1) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const pageStr = (tc.items as Array<{ str?: string }>)
        .map((it) => it.str || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      const block = `\n=== [PDF PAGE ${p}] ===\n${pageStr}`;
      if (totalLen + block.length > maxChars) {
        chunks.push(block.slice(0, Math.max(0, maxChars - totalLen)));
        chunks.push(`\n... [Truncated after page ${p} of ${numPages} due to context budget] ...`);
        break;
      }
      chunks.push(block);
      totalLen += block.length;
    }

    return { numPages, taggedText: chunks.join('\n') };
  } finally {
    await loadingTask.destroy();
  }
}

export async function renderPdfPageToPngBuffer(params: {
  pdfPath: string;
  paperId: string;
  pageNumber: number;
  scale?: number;
  highlightQuote?: string;
}): Promise<{ pngBuffer: Buffer; numPages: number; safePage: number }> {
  const { pdfPath, paperId, pageNumber, scale = 2.0, highlightQuote } = params;
  const quoteHash = highlightQuote
    ? crypto.createHash('md5').update(highlightQuote).digest('hex').slice(0, 8)
    : 'none';
  const cacheFile = path.join(
    PAGE_CACHE_DIR,
    `${paperId}_p${pageNumber}_s${scale}_${quoteHash}.png`
  );

  const rawBytes = await fsp.readFile(pdfPath);
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(rawBytes),
    useSystemFonts: true,
    disableFontFace: true,
  });

  const pdf = await loadingTask.promise;

  try {
    const numPages = pdf.numPages;
    const safePage = Math.max(1, Math.min(numPages, Math.round(pageNumber || 1)));

    if (fs.existsSync(cacheFile)) {
      const cached = await fsp.readFile(cacheFile);
      return { pngBuffer: cached, numPages, safePage };
    }

    const page = await pdf.getPage(safePage);
    const viewport = page.getViewport({ scale });

    const width = Math.max(1, Math.ceil(viewport.width));
    const height = Math.max(1, Math.ceil(viewport.height));
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fill crisp white paper background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise;

    // Overlay amber highlight boxes over words matching the verbatim quote
    if (highlightQuote && highlightQuote.trim().length > 4) {
      const textContent = await page.getTextContent();
      const items = textContent.items as Array<{
        str?: string;
        transform: number[];
        width: number;
      }>;

      const tokens = highlightQuote
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 4);
      const distinctTokens = Array.from(new Set(tokens)).slice(0, 10);

      ctx.save();
      ctx.fillStyle = 'rgba(255, 196, 0, 0.34)';
      ctx.strokeStyle = 'rgba(234, 148, 0, 0.65)';
      ctx.lineWidth = 1.5;

      for (const item of items) {
        const text = item.str?.trim();
        if (!text || text.length < 3) continue;
        const lower = text.toLowerCase();
        if (!distinctTokens.some((tok) => lower.includes(tok))) continue;

        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(tx[2], tx[3]) || 12 * scale;
        const x = tx[4];
        const y = tx[5] - fontHeight;
        const w = (item.width || 24) * scale;
        const h = fontHeight * 1.22;

        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
      ctx.restore();
    }

    const pngBuffer = canvas.toBuffer('image/png');
    await fsp.writeFile(cacheFile, pngBuffer).catch(() => {});
    return { pngBuffer, numPages, safePage };
  } finally {
    await loadingTask.destroy();
  }
}
