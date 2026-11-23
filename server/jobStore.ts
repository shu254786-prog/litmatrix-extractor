import { extractPaperMatrix } from './geminiExtractor.js';
import type {
  DimensionConfig,
  GeminiModelId,
  OutputLanguage,
  PaperRow,
} from '../src/types/matrix.js';
import { CORE_DIMENSIONS } from '../src/types/matrix.js';
import { DEMO_PAPERS } from '../src/data/demoPapers.js';

export interface JobPaperInternal extends PaperRow {
  pdfBuffer?: Buffer;
}

export interface ExtractionJob {
  id: string;
  ownerId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  status: 'idle' | 'running' | 'completed';
  model: GeminiModelId;
  language: OutputLanguage;
  thinkingLevel: 'minimal' | 'low' | 'medium' | 'high';
  concurrency: number;
  dimensions: DimensionConfig[];
  customDimensions: DimensionConfig[];
  papers: JobPaperInternal[];
  apiKey: string;
}

const JOB_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const jobs = new Map<string, ExtractionJob>();

function cleanupExpiredJobs() {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.updatedAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}

export function createJob(params: {
  ownerId?: string;
  title?: string;
  apiKey: string;
  model?: GeminiModelId;
  language?: OutputLanguage;
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  concurrency?: number;
  customDimensions?: DimensionConfig[];
}): ExtractionJob {
  cleanupExpiredJobs();
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const customDimensions = params.customDimensions ?? [];
  const job: ExtractionJob = {
    id,
    ownerId: params.ownerId || 'anonymous',
    title: params.title || `文献矩阵 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'idle',
    model: params.model || 'gemini-4-hydrogen',
    language: params.language || 'zh',
    thinkingLevel: params.thinkingLevel || 'low',
    concurrency: Math.max(1, Math.min(5, params.concurrency || 3)),
    customDimensions,
    dimensions: [...CORE_DIMENSIONS, ...customDimensions],
    papers: [],
    apiKey: params.apiKey,
  };
  jobs.set(id, job);
  return job;
}

export function createDemoJob(ownerId = 'anonymous'): ExtractionJob {
  cleanupExpiredJobs();
  const id = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const job: ExtractionJob = {
    id,
    ownerId,
    title: '经典 LLM 论文综述示例矩阵 (4 篇)',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'completed',
    model: 'gemini-4-hydrogen',
    language: 'zh',
    thinkingLevel: 'low',
    concurrency: 3,
    customDimensions: [],
    dimensions: [...CORE_DIMENSIONS],
    papers: DEMO_PAPERS.map((p) => ({ ...p })),
    apiKey: '',
  };
  jobs.set(id, job);
  return job;
}

export function getJob(jobId: string): ExtractionJob | undefined {
  return jobs.get(jobId);
}

export function listJobs(ownerId?: string) {
  cleanupExpiredJobs();
  const all = Array.from(jobs.values())
    .filter((j) => !ownerId || j.ownerId === ownerId || j.ownerId === 'anonymous')
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return all.map((j) => serializeJob(j));
}

export function deleteJob(jobId: string): boolean {
  return jobs.delete(jobId);
}

export function updatePaperSummaryInJob(
  job: ExtractionJob,
  paperId: string,
  dimKey: string,
  summary: string
): boolean {
  const paper = job.papers.find((p) => p.id === paperId);
  if (!paper || !paper.extraction) return false;

  if (
    dimKey === 'research_question' ||
    dimKey === 'methodology' ||
    dimKey === 'datasets' ||
    dimKey === 'conclusions' ||
    dimKey === 'limitations'
  ) {
    paper.extraction[dimKey] = { ...paper.extraction[dimKey], summary };
    job.updatedAt = Date.now();
    return true;
  }

  const cd = paper.extraction.custom_dimensions?.find((c) => c.key === dimKey);
  if (cd) {
    cd.summary = summary;
    job.updatedAt = Date.now();
    return true;
  }
  return false;
}

export function serializeJob(job: ExtractionJob) {
  return {
    id: job.id,
    ownerId: job.ownerId,
    title: job.title,
    status: job.status,
    model: job.model,
    language: job.language,
    dimensions: job.dimensions,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    papers: job.papers.map(({ pdfBuffer: _buf, ...rest }) => rest),
  };
}

export function addPdfToJob(
  job: ExtractionJob,
  fileName: string,
  pdfBuffer: Buffer
): JobPaperInternal {
  const existing = job.papers.find(
    (p) => p.fileName === fileName && p.fileSize === pdfBuffer.byteLength
  );
  if (existing) return existing;

  const paper: JobPaperInternal = {
    id: `paper_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    fileName,
    fileSize: pdfBuffer.byteLength,
    pageCount: 0,
    status: 'queued',
    pdfBuffer,
  };
  job.papers.push(paper);
  job.updatedAt = Date.now();
  return paper;
}

export function startJobQueue(job: ExtractionJob, apiKeyOverride?: string) {
  if (apiKeyOverride) {
    job.apiKey = apiKeyOverride;
  }
  if (job.status === 'running') return;

  const queued = job.papers.filter((p) => p.status === 'queued');
  if (queued.length === 0) {
    job.status = 'completed';
    return;
  }

  job.status = 'running';
  job.updatedAt = Date.now();

  const workerCount = Math.min(job.concurrency, queued.length);
  const queue = [...queued];

  const runWorker = async () => {
    while (queue.length > 0) {
      const paper = queue.shift();
      if (!paper) break;
      if (!paper.pdfBuffer) {
        paper.status = 'error';
        paper.error = 'PDF 缓存已释放，请重新上传';
        continue;
      }

      paper.status = 'extracting';
      paper.error = undefined;
      job.updatedAt = Date.now();

      const started = Date.now();
      try {
        const extraction = await extractPaperMatrix({
          apiKey: job.apiKey,
          pdfBuffer: paper.pdfBuffer,
          fileName: paper.fileName,
          model: job.model,
          language: job.language,
          thinkingLevel: job.thinkingLevel,
          customDimensions: job.customDimensions,
        });
        paper.status = 'done';
        paper.extraction = extraction;
        paper.pageCount = extraction.total_pages_detected || 0;
        paper.durationMs = Date.now() - started;
        paper.modelUsed = job.model;
        paper.pdfBuffer = undefined;
      } catch (err) {
        paper.status = 'error';
        paper.error = err instanceof Error ? err.message : '抽取失败';
      }
      job.updatedAt = Date.now();
    }
  };

  Promise.all(Array.from({ length: workerCount }, () => runWorker())).then(() => {
    const stillQueued = job.papers.some((p) => p.status === 'queued');
    job.status = stillQueued ? 'idle' : 'completed';
    job.updatedAt = Date.now();
  });
}
