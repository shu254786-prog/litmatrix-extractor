import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { db, PDF_DIR } from './db.js';
import { extractPaperMatrix } from './geminiExtractor.js';
import type {
  DimensionConfig,
  GeminiModelId,
  OutputLanguage,
  PaperExtractionResult,
  PaperRow,
} from '../src/types/matrix.js';
import { CORE_DIMENSIONS } from '../src/types/matrix.js';
import { DEMO_PAPERS } from '../src/data/demoPapers.js';

export interface SerializedJob {
  id: string;
  ownerId: string;
  title: string;
  status: 'idle' | 'running' | 'completed';
  model: GeminiModelId;
  language: OutputLanguage;
  thinkingLevel: 'minimal' | 'low' | 'medium' | 'high';
  concurrency: number;
  dimensions: DimensionConfig[];
  customDimensions: DimensionConfig[];
  createdAt: number;
  updatedAt: number;
  papers: PaperRow[];
}

// Track active running job IDs + runtime API keys in memory
const runningJobs = new Set<string>();
const jobRuntimeKeys = new Map<string, string>();

function mapPaperRow(row: Record<string, unknown>): PaperRow {
  const pdfPath = row.pdf_path ? String(row.pdf_path) : '';
  const hasPdf = Boolean(pdfPath && fs.existsSync(pdfPath));
  let extraction: PaperExtractionResult | undefined;
  if (row.extraction_json) {
    try {
      extraction = JSON.parse(String(row.extraction_json));
    } catch {
      extraction = undefined;
    }
  }
  return {
    id: String(row.id),
    fileName: String(row.file_name),
    fileSize: Number(row.file_size || 0),
    pageCount: Number(row.page_count || 0),
    status: row.status as PaperRow['status'],
    error: row.error ? String(row.error) : undefined,
    durationMs: row.duration_ms ? Number(row.duration_ms) : undefined,
    modelUsed: row.model_used ? String(row.model_used) : undefined,
    isDemo: Boolean(row.is_demo),
    hasPdf,
    extraction,
  };
}

function mapJobRow(jobRow: Record<string, unknown>): SerializedJob {
  const jobId = String(jobRow.id);
  const paperRows = db
    .prepare('SELECT * FROM papers WHERE job_id = ? ORDER BY sort_order ASC, rowid ASC')
    .all(jobId) as Array<Record<string, unknown>>;

  let dimensions: DimensionConfig[] = [...CORE_DIMENSIONS];
  let customDimensions: DimensionConfig[] = [];
  try {
    dimensions = JSON.parse(String(jobRow.dimensions_json));
  } catch {
    // default
  }
  try {
    customDimensions = JSON.parse(String(jobRow.custom_dimensions_json));
  } catch {
    // default
  }

  return {
    id: jobId,
    ownerId: String(jobRow.owner_id),
    title: String(jobRow.title),
    status: jobRow.status as SerializedJob['status'],
    model: jobRow.model as GeminiModelId,
    language: jobRow.language as OutputLanguage,
    thinkingLevel: (jobRow.thinking_level || 'low') as SerializedJob['thinkingLevel'],
    concurrency: Number(jobRow.concurrency || 3),
    dimensions,
    customDimensions,
    createdAt: Number(jobRow.created_at),
    updatedAt: Number(jobRow.updated_at),
    papers: paperRows.map(mapPaperRow),
  };
}

export function createJob(params: {
  ownerId?: string;
  title?: string;
  apiKey?: string;
  model?: GeminiModelId;
  language?: OutputLanguage;
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  concurrency?: number;
  customDimensions?: DimensionConfig[];
}): SerializedJob {
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const customDimensions = params.customDimensions ?? [];
  const dimensions = [...CORE_DIMENSIONS, ...customDimensions];
  const title =
    params.title?.trim() ||
    `文献矩阵 ${new Date().toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`;

  db.prepare(
    `INSERT INTO jobs (
      id, owner_id, title, status, model, language, thinking_level, concurrency,
      dimensions_json, custom_dimensions_json, created_at, updated_at
    ) VALUES (?, ?, ?, 'idle', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.ownerId || 'anonymous',
    title,
    params.model || 'gemini-4-hydrogen',
    params.language || 'zh',
    params.thinkingLevel || 'low',
    Math.max(1, Math.min(5, params.concurrency || 3)),
    JSON.stringify(dimensions),
    JSON.stringify(customDimensions),
    now,
    now
  );

  if (params.apiKey) {
    jobRuntimeKeys.set(id, params.apiKey);
  }

  return getJob(id)!;
}

export function createDemoJob(ownerId = 'anonymous'): SerializedJob {
  const id = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();

  db.prepare(
    `INSERT INTO jobs (
      id, owner_id, title, status, model, language, thinking_level, concurrency,
      dimensions_json, custom_dimensions_json, created_at, updated_at
    ) VALUES (?, ?, ?, 'completed', 'gemini-4-hydrogen', 'zh', 'low', 3, ?, '[]', ?, ?)`
  ).run(
    id,
    ownerId,
    '经典 LLM 论文综述示例矩阵 (4 篇)',
    JSON.stringify(CORE_DIMENSIONS),
    now,
    now
  );

  const insertPaper = db.prepare(
    `INSERT INTO papers (
      id, job_id, sort_order, file_name, file_size, page_count, status,
      duration_ms, model_used, is_demo, pdf_path, extraction_json
    ) VALUES (?, ?, ?, ?, ?, ?, 'done', ?, ?, 1, NULL, ?)`
  );

  DEMO_PAPERS.forEach((p, idx) => {
    const paperId = `${id}_p${idx + 1}`;
    insertPaper.run(
      paperId,
      id,
      idx,
      p.fileName,
      p.fileSize,
      p.pageCount,
      p.durationMs || 3800,
      p.modelUsed || 'gemini-4-hydrogen',
      JSON.stringify(p.extraction)
    );
  });

  return getJob(id)!;
}

export function getJob(jobId: string): SerializedJob | undefined {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return undefined;
  return mapJobRow(row);
}

export function listJobs(ownerId?: string): SerializedJob[] {
  const rows = (
    ownerId && ownerId !== 'anonymous'
      ? db
          .prepare(
            `SELECT * FROM jobs
             WHERE owner_id = ? OR owner_id = 'anonymous'
             ORDER BY updated_at DESC LIMIT 50`
          )
          .all(ownerId)
      : db.prepare('SELECT * FROM jobs ORDER BY updated_at DESC LIMIT 50').all()
  ) as Array<Record<string, unknown>>;

  return rows.map(mapJobRow);
}

export function renameJob(jobId: string, title: string): SerializedJob | undefined {
  const trimmed = title.trim();
  if (!trimmed) return getJob(jobId);
  db.prepare('UPDATE jobs SET title = ?, updated_at = ? WHERE id = ?').run(
    trimmed,
    Date.now(),
    jobId
  );
  return getJob(jobId);
}

export function deleteJob(jobId: string): boolean {
  const paperFiles = db
    .prepare('SELECT pdf_path FROM papers WHERE job_id = ? AND pdf_path IS NOT NULL')
    .all(jobId) as Array<{ pdf_path: string }>;

  const info = db.prepare('DELETE FROM jobs WHERE id = ?').run(jobId);
  jobRuntimeKeys.delete(jobId);

  for (const pf of paperFiles) {
    if (pf.pdf_path) {
      fsp.unlink(pf.pdf_path).catch(() => {});
    }
  }
  return Number(info.changes || 0) > 0;
}

export function deletePaperFromJob(jobId: string, paperId: string): SerializedJob | undefined {
  const row = db
    .prepare('SELECT pdf_path FROM papers WHERE id = ? AND job_id = ?')
    .get(paperId, jobId) as { pdf_path?: string } | undefined;

  db.prepare('DELETE FROM papers WHERE id = ? AND job_id = ?').run(paperId, jobId);
  db.prepare('UPDATE jobs SET updated_at = ? WHERE id = ?').run(Date.now(), jobId);

  if (row?.pdf_path) {
    fsp.unlink(row.pdf_path).catch(() => {});
  }
  return getJob(jobId);
}

export function getPaperPdfPath(paperId: string): { pdfPath: string; fileName: string } | undefined {
  const row = db
    .prepare('SELECT pdf_path, file_name FROM papers WHERE id = ?')
    .get(paperId) as { pdf_path?: string; file_name?: string } | undefined;
  if (!row?.pdf_path || !fs.existsSync(row.pdf_path)) return undefined;
  return {
    pdfPath: row.pdf_path,
    fileName: row.file_name || 'paper.pdf',
  };
}

export async function addPdfToJob(
  jobId: string,
  fileName: string,
  pdfBuffer: Buffer,
  pageCountHint = 0
): Promise<PaperRow> {
  const existing = db
    .prepare('SELECT * FROM papers WHERE job_id = ? AND file_name = ? AND file_size = ?')
    .get(jobId, fileName, pdfBuffer.byteLength) as Record<string, unknown> | undefined;

  if (existing) {
    return mapPaperRow(existing);
  }

  const paperId = `paper_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pdfFilePath = path.join(PDF_DIR, `${paperId}.pdf`);
  await fsp.writeFile(pdfFilePath, pdfBuffer);

  const countRow = db
    .prepare('SELECT COUNT(*) as cnt FROM papers WHERE job_id = ?')
    .get(jobId) as { cnt: number };

  db.prepare(
    `INSERT INTO papers (
      id, job_id, sort_order, file_name, file_size, page_count, status, is_demo, pdf_path
    ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?)`
  ).run(
    paperId,
    jobId,
    Number(countRow.cnt || 0),
    fileName,
    pdfBuffer.byteLength,
    pageCountHint,
    pdfFilePath
  );

  db.prepare('UPDATE jobs SET updated_at = ? WHERE id = ?').run(Date.now(), jobId);
  const inserted = db.prepare('SELECT * FROM papers WHERE id = ?').get(paperId) as Record<
    string,
    unknown
  >;
  return mapPaperRow(inserted);
}

export async function recordExtractedPaperInJob(params: {
  jobId: string;
  existingPaperId?: string;
  fileName: string;
  pdfBuffer: Buffer;
  pageCount: number;
  extraction: PaperExtractionResult;
  durationMs: number;
  modelUsed: string;
}): Promise<PaperRow> {
  const {
    jobId,
    existingPaperId,
    fileName,
    pdfBuffer,
    pageCount,
    extraction,
    durationMs,
    modelUsed,
  } = params;

  const paperId =
    existingPaperId || `paper_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pdfFilePath = path.join(PDF_DIR, `${paperId}.pdf`);
  await fsp.writeFile(pdfFilePath, pdfBuffer);

  const resolvedPages = pageCount || extraction.total_pages_detected || 0;
  const existing = db.prepare('SELECT id FROM papers WHERE id = ?').get(paperId);

  if (existing) {
    db.prepare(
      `UPDATE papers
       SET page_count = ?, status = 'done', error = NULL, duration_ms = ?,
           model_used = ?, pdf_path = ?, extraction_json = ?
       WHERE id = ?`
    ).run(
      resolvedPages,
      durationMs,
      modelUsed,
      pdfFilePath,
      JSON.stringify(extraction),
      paperId
    );
  } else {
    const countRow = db
      .prepare('SELECT COUNT(*) as cnt FROM papers WHERE job_id = ?')
      .get(jobId) as { cnt: number };

    db.prepare(
      `INSERT INTO papers (
        id, job_id, sort_order, file_name, file_size, page_count, status,
        duration_ms, model_used, is_demo, pdf_path, extraction_json
      ) VALUES (?, ?, ?, ?, ?, ?, 'done', ?, ?, 0, ?, ?)`
    ).run(
      paperId,
      jobId,
      Number(countRow.cnt || 0),
      fileName,
      pdfBuffer.byteLength,
      resolvedPages,
      durationMs,
      modelUsed,
      pdfFilePath,
      JSON.stringify(extraction)
    );
  }

  db.prepare(`UPDATE jobs SET status = 'completed', updated_at = ? WHERE id = ?`).run(
    Date.now(),
    jobId
  );

  const row = db.prepare('SELECT * FROM papers WHERE id = ?').get(paperId) as Record<
    string,
    unknown
  >;
  return mapPaperRow(row);
}

export function updatePaperSummaryInJob(
  jobId: string,
  paperId: string,
  dimKey: string,
  summary: string
): boolean {
  const row = db
    .prepare('SELECT extraction_json FROM papers WHERE id = ? AND job_id = ?')
    .get(paperId, jobId) as { extraction_json?: string } | undefined;
  if (!row?.extraction_json) return false;

  const extraction = JSON.parse(row.extraction_json) as PaperExtractionResult;
  if (
    dimKey === 'research_question' ||
    dimKey === 'methodology' ||
    dimKey === 'datasets' ||
    dimKey === 'conclusions' ||
    dimKey === 'limitations'
  ) {
    extraction[dimKey] = { ...extraction[dimKey], summary };
  } else {
    const cd = extraction.custom_dimensions?.find((c) => c.key === dimKey);
    if (!cd) return false;
    cd.summary = summary;
  }

  db.prepare('UPDATE papers SET extraction_json = ? WHERE id = ?').run(
    JSON.stringify(extraction),
    paperId
  );
  db.prepare('UPDATE jobs SET updated_at = ? WHERE id = ?').run(Date.now(), jobId);
  return true;
}

export function requeueFailedPapers(jobId: string) {
  db.prepare(
    `UPDATE papers SET status = 'queued', error = NULL
     WHERE job_id = ? AND status = 'error' AND pdf_path IS NOT NULL`
  ).run(jobId);
}

export function startJobQueue(jobId: string, apiKeyOverride?: string) {
  if (apiKeyOverride) {
    jobRuntimeKeys.set(jobId, apiKeyOverride);
  }
  if (runningJobs.has(jobId)) return;

  const job = getJob(jobId);
  if (!job) return;

  const apiKey = apiKeyOverride || jobRuntimeKeys.get(jobId) || process.env.GEMINI_API_KEY?.trim() || '';
  if (!apiKey) return;

  const queuedRows = db
    .prepare(
      `SELECT * FROM papers WHERE job_id = ? AND status = 'queued' ORDER BY sort_order ASC`
    )
    .all(jobId) as Array<Record<string, unknown>>;

  if (queuedRows.length === 0) {
    db.prepare(`UPDATE jobs SET status = 'completed', updated_at = ? WHERE id = ?`).run(
      Date.now(),
      jobId
    );
    return;
  }

  runningJobs.add(jobId);
  db.prepare(`UPDATE jobs SET status = 'running', updated_at = ? WHERE id = ?`).run(
    Date.now(),
    jobId
  );

  const queue = [...queuedRows];
  const workerCount = Math.min(job.concurrency || 3, queue.length);

  const runWorker = async () => {
    while (queue.length > 0) {
      const pRow = queue.shift();
      if (!pRow) break;
      const paperId = String(pRow.id);
      const pdfPath = pRow.pdf_path ? String(pRow.pdf_path) : '';

      if (!pdfPath || !fs.existsSync(pdfPath)) {
        db.prepare(`UPDATE papers SET status = 'error', error = ? WHERE id = ?`).run(
          '本地 PDF 原文件不存在，请重新上传',
          paperId
        );
        continue;
      }

      db.prepare(`UPDATE papers SET status = 'extracting', error = NULL WHERE id = ?`).run(
        paperId
      );
      db.prepare('UPDATE jobs SET updated_at = ? WHERE id = ?').run(Date.now(), jobId);

      const started = Date.now();
      try {
        const pdfBuffer = await fsp.readFile(pdfPath);
        const extraction = await extractPaperMatrix({
          apiKey,
          pdfBuffer,
          fileName: String(pRow.file_name),
          totalPagesHint: Number(pRow.page_count) || undefined,
          model: job.model,
          language: job.language,
          thinkingLevel: job.thinkingLevel,
          customDimensions: job.customDimensions,
        });

        const pages = Number(pRow.page_count) || extraction.total_pages_detected || 0;
        db.prepare(
          `UPDATE papers
           SET page_count = ?, status = 'done', error = NULL,
               duration_ms = ?, model_used = ?, extraction_json = ?
           WHERE id = ?`
        ).run(
          pages,
          Date.now() - started,
          job.model,
          JSON.stringify(extraction),
          paperId
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : '抽取失败';
        db.prepare(`UPDATE papers SET status = 'error', error = ? WHERE id = ?`).run(
          msg,
          paperId
        );
      }
      db.prepare('UPDATE jobs SET updated_at = ? WHERE id = ?').run(Date.now(), jobId);
    }
  };

  Promise.all(Array.from({ length: workerCount }, () => runWorker())).finally(() => {
    runningJobs.delete(jobId);
    const remaining = db
      .prepare(`SELECT COUNT(*) as cnt FROM papers WHERE job_id = ? AND status = 'queued'`)
      .get(jobId) as { cnt: number };
    const nextStatus = Number(remaining?.cnt || 0) > 0 ? 'idle' : 'completed';
    db.prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?').run(
      nextStatus,
      Date.now(),
      jobId
    );
  });
}
