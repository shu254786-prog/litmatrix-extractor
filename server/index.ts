import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import { extractPaperMatrix, synthesizeLiteratureReview } from './geminiExtractor.js';
import type { DimensionConfig, GeminiModelId, OutputLanguage } from '../src/types/matrix.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max per PDF (Gemini PDF limit)
  },
});

function resolveApiKey(req: express.Request): string {
  const headerKey = req.header('x-gemini-api-key')?.trim();
  const envKey = process.env.GEMINI_API_KEY?.trim();
  return headerKey || envKey || '';
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasServerApiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
  });
});

app.post('/api/extract', upload.single('pdf'), async (req, res) => {
  try {
    const apiKey = resolveApiKey(req);
    if (!apiKey) {
      res.status(400).json({
        error: '缺少 Google AI Studio API Key。请在右上角「API 设置」中输入，或在服务端 .env 中配置 GEMINI_API_KEY。',
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: '未收到 PDF 文件。' });
      return;
    }

    const originalName = req.body.fileName || req.file.originalname || 'paper.pdf';
    const model = (req.body.model || 'gemini-4-hydrogen') as GeminiModelId;
    const language = (req.body.language || 'zh') as OutputLanguage;
    const thinkingLevel = (req.body.thinkingLevel || 'low') as
      | 'minimal'
      | 'low'
      | 'medium'
      | 'high';
    const totalPagesHint = req.body.totalPages ? Number(req.body.totalPages) : undefined;

    let customDimensions: DimensionConfig[] = [];
    if (req.body.customDimensions) {
      try {
        customDimensions = JSON.parse(req.body.customDimensions);
      } catch {
        customDimensions = [];
      }
    }

    const startedAt = Date.now();
    const extraction = await extractPaperMatrix({
      apiKey,
      pdfBuffer: req.file.buffer,
      fileName: originalName,
      totalPagesHint,
      model,
      language,
      thinkingLevel,
      customDimensions,
    });

    res.json({
      extraction,
      durationMs: Date.now() - startedAt,
      modelUsed: model,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'PDF 提取失败';
    console.error('[extract error]', err);
    res.status(500).json({ error: message });
  }
});

app.post('/api/synthesize', async (req, res) => {
  try {
    const apiKey = resolveApiKey(req);
    if (!apiKey) {
      res.status(400).json({ error: '缺少 Google AI Studio API Key。' });
      return;
    }

    const { papers, model = 'gemini-4-hydrogen', language = 'zh' } = req.body;
    if (!Array.isArray(papers) || papers.length === 0) {
      res.status(400).json({ error: '请至少先完成一篇论文的矩阵提取。' });
      return;
    }

    const synthesis = await synthesizeLiteratureReview({
      apiKey,
      model,
      language,
      papers,
    });

    res.json({ synthesis });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '生成综述小结失败';
    console.error('[synthesize error]', err);
    res.status(500).json({ error: message });
  }
});

// Serve production static bundle when built and running with --prod or NODE_ENV=production
const distDir = path.resolve(__dirname, '../dist');
const serveStatic =
  process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
if (serveStatic && fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`LitMatrix API server running at http://localhost:${port}`);
});
