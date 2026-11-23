import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import { extractPaperMatrix, synthesizeLiteratureReview } from './geminiExtractor.js';
import { buildExcelBuffer, buildMarkdownText } from './exportBuilder.js';
import {
  addPdfToJob,
  createDemoJob,
  createJob,
  getJob,
  serializeJob,
  startJobQueue,
} from './jobStore.js';
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

// Optional WeChat msgSecCheck helper (enabled when WECHAT_APPID & WECHAT_APPSECRET are configured)
let cachedWxToken: { token: string; expiresAt: number } | null = null;
async function checkWeChatTextSafety(content: string): Promise<boolean> {
  const appId = process.env.WECHAT_APPID?.trim();
  const appSecret = process.env.WECHAT_APPSECRET?.trim();
  if (!appId || !appSecret || !content.trim()) return true;

  try {
    if (!cachedWxToken || Date.now() >= cachedWxToken.expiresAt) {
      const tokenResp = await fetch(
        `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(
          appId
        )}&secret=${encodeURIComponent(appSecret)}`
      );
      const tokenData = (await tokenResp.json()) as {
        access_token?: string;
        expires_in?: number;
      };
      if (tokenData.access_token) {
        cachedWxToken = {
          token: tokenData.access_token,
          expiresAt: Date.now() + ((tokenData.expires_in || 7200) - 300) * 1000,
        };
      }
    }
    if (!cachedWxToken?.token) return true;

    const checkResp = await fetch(
      `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${encodeURIComponent(
        cachedWxToken.token
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.slice(0, 2000) }),
      }
    );
    const checkData = (await checkResp.json()) as { errcode?: number };
    return checkData.errcode === 0;
  } catch {
    return true;
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasServerApiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
    wechatSafetyEnabled: Boolean(
      process.env.WECHAT_APPID?.trim() && process.env.WECHAT_APPSECRET?.trim()
    ),
  });
});

// ---- Web Synchronous Single-PDF Endpoint ----
app.post('/api/extract', upload.single('pdf'), async (req, res) => {
  try {
    const apiKey = resolveApiKey(req);
    if (!apiKey) {
      res.status(400).json({
        error:
          '缺少 Google AI Studio API Key。请在右上角「API 设置」中输入，或在服务端 .env 中配置 GEMINI_API_KEY。',
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

// ---- Mini Program Async Batch Job Endpoints (avoids 60s wx.request timeout) ----
app.post('/api/jobs', async (req, res) => {
  try {
    const apiKey = resolveApiKey(req);
    const {
      model = 'gemini-4-hydrogen',
      language = 'zh',
      thinkingLevel = 'low',
      concurrency = 3,
      customDimensions = [],
    } = req.body || {};

    if (Array.isArray(customDimensions) && customDimensions.length > 0) {
      const textToCheck = customDimensions
        .map((d: DimensionConfig) => `${d.label} ${d.description}`)
        .join(' ');
      const safe = await checkWeChatTextSafety(textToCheck);
      if (!safe) {
        res.status(400).json({ error: '自定义维度包含违规词汇，请修改后重试。' });
        return;
      }
    }

    const job = createJob({
      apiKey,
      model,
      language,
      thinkingLevel,
      concurrency,
      customDimensions,
    });

    res.json({ job: serializeJob(job) });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : '创建任务失败' });
  }
});

app.post('/api/jobs/demo', (_req, res) => {
  const job = createDemoJob();
  res.json({ job: serializeJob(job) });
});

app.post('/api/jobs/:jobId/upload', upload.single('pdf'), (req, res) => {
  const job = getJob(String(req.params.jobId));
  if (!job) {
    res.status(404).json({ error: '任务不存在或已过期' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: '未收到 PDF 文件' });
    return;
  }

  const fileName = req.body.fileName || req.file.originalname || 'paper.pdf';
  const paper = addPdfToJob(job, fileName, req.file.buffer);
  const autoStart = req.body.autoStart === 'true' || req.body.autoStart === true;

  const key = resolveApiKey(req) || job.apiKey;
  if (autoStart && key) {
    startJobQueue(job, key);
  }

  res.json({
    paper: { ...paper, pdfBuffer: undefined },
    job: serializeJob(job),
  });
});

app.post('/api/jobs/:jobId/start', (req, res) => {
  const job = getJob(String(req.params.jobId));
  if (!job) {
    res.status(404).json({ error: '任务不存在或已过期' });
    return;
  }
  const apiKey = resolveApiKey(req) || job.apiKey;
  if (!apiKey) {
    res.status(400).json({
      error: '缺少 Google AI Studio API Key，请在小程序设置中填写或配置服务端 GEMINI_API_KEY。',
    });
    return;
  }

  // Re-queue failed papers if retry=true
  if (req.body?.retry) {
    for (const p of job.papers) {
      if (p.status === 'error' && p.pdfBuffer) {
        p.status = 'queued';
        p.error = undefined;
      }
    }
  }

  startJobQueue(job, apiKey);
  res.json({ job: serializeJob(job) });
});

app.get('/api/jobs/:jobId', (req, res) => {
  const job = getJob(String(req.params.jobId));
  if (!job) {
    res.status(404).json({ error: '任务不存在或已过期' });
    return;
  }
  res.json({ job: serializeJob(job) });
});

app.get('/api/jobs/:jobId/export/xlsx', async (req, res) => {
  try {
    const job = getJob(String(req.params.jobId));
    if (!job) {
      res.status(404).json({ error: '任务不存在或已过期' });
      return;
    }
    const completed = job.papers.filter((p) => p.status === 'done' && p.extraction);
    if (completed.length === 0) {
      res.status(400).json({ error: '暂无已完成的论文可供导出' });
      return;
    }

    const buffer = await buildExcelBuffer(job.papers, job.dimensions);
    const filename = encodeURIComponent(`文献综述对比矩阵_${job.id.slice(-6)}.xlsx`);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.send(buffer);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Excel 导出失败' });
  }
});

app.get('/api/jobs/:jobId/export/markdown', (req, res) => {
  const job = getJob(String(req.params.jobId));
  if (!job) {
    res.status(404).json({ error: '任务不存在或已过期' });
    return;
  }
  const includeAppendix = req.query.appendix !== '0';
  const markdown = buildMarkdownText(job.papers, job.dimensions, includeAppendix);
  if (!markdown) {
    res.status(400).json({ error: '暂无已完成的论文可供导出' });
    return;
  }

  if (req.query.download === '1') {
    const filename = encodeURIComponent(`文献综述对比矩阵_${job.id.slice(-6)}.md`);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.send(markdown);
    return;
  }

  res.json({ markdown });
});

app.post('/api/jobs/:jobId/synthesize', async (req, res) => {
  try {
    const job = getJob(String(req.params.jobId));
    if (!job) {
      res.status(404).json({ error: '任务不存在或已过期' });
      return;
    }
    const apiKey = resolveApiKey(req) || job.apiKey;
    if (!apiKey) {
      res.status(400).json({ error: '缺少 Google AI Studio API Key。' });
      return;
    }
    const completed = job.papers.filter((p) => p.status === 'done' && p.extraction);
    if (completed.length < 2) {
      res.status(400).json({ error: '请至少先完成 2 篇论文的提取。' });
      return;
    }

    const synthesis = await synthesizeLiteratureReview({
      apiKey,
      model: job.model,
      language: job.language,
      papers: completed.map((p) => {
        const e = p.extraction!;
        return {
          title: e.title,
          authors: e.authors,
          year: e.year,
          research_question: e.research_question.summary,
          methodology: e.methodology.summary,
          datasets: e.datasets.summary,
          conclusions: e.conclusions.summary,
          limitations: e.limitations.summary,
        };
      }),
    });

    res.json({ synthesis });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : '生成综述失败' });
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
