import {
  extractPaperMatrix as extractWithGemini,
  synthesizeLiteratureReview as synthesizeWithGemini,
} from './geminiExtractor.js';
import { extractPageTaggedText } from './pdfRenderer.js';
import type {
  AnyModelId,
  DimensionConfig,
  GeminiModelId,
  ModelProvider,
  OutputLanguage,
  PaperExtractionResult,
} from '../src/types/matrix.js';

export const PROVIDER_DEFAULT_BASE_URL: Record<ModelProvider, string> = {
  gemini: 'https://generativelanguage.googleapis.com',
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  custom: 'https://api.openai.com/v1',
};

function sanitizeJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  return trimmed;
}

function clampAndNormalize(
  parsed: Partial<PaperExtractionResult>,
  maxPages: number,
  customDimensions: DimensionConfig[]
): PaperExtractionResult {
  const normDim = (d?: Partial<PaperExtractionResult['research_question']>) => {
    const citations = Array.isArray(d?.citations)
      ? d!.citations.map((c) => ({
          pdf_page:
            typeof c?.pdf_page === 'number' && !Number.isNaN(c.pdf_page)
              ? Math.max(1, Math.min(maxPages || 999, Math.round(c.pdf_page)))
              : 1,
          section: String(c?.section || '正文'),
          quote: String(c?.quote || ''),
        }))
      : [];
    return {
      summary: String(d?.summary || '未在原文中明确提及'),
      keywords: Array.isArray(d?.keywords) ? d!.keywords.map(String) : [],
      citations,
    };
  };

  const result: PaperExtractionResult = {
    title: String(parsed.title || 'Untitled Paper'),
    authors: String(parsed.authors || 'Unknown'),
    year: String(parsed.year || 'N/A'),
    venue: String(parsed.venue || 'Preprint'),
    total_pages_detected: Number(parsed.total_pages_detected || maxPages || 1),
    research_question: normDim(parsed.research_question),
    methodology: normDim(parsed.methodology),
    datasets: normDim(parsed.datasets),
    conclusions: normDim(parsed.conclusions),
    limitations: normDim(parsed.limitations),
  };

  if (customDimensions.length > 0) {
    const incoming = Array.isArray(parsed.custom_dimensions)
      ? parsed.custom_dimensions
      : [];
    result.custom_dimensions = customDimensions.map((cd) => {
      const matched = incoming.find((x) => x.key === cd.key || x.label === cd.label);
      const base = normDim(matched);
      return {
        key: cd.key,
        label: cd.label,
        ...base,
      };
    });
  }

  return result;
}

async function callOpenAICompatible(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  jsonMode?: boolean;
}): Promise<string> {
  const endpoint = `${params.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const body: Record<string, unknown> = {
    model: params.model,
    messages: [
      { role: 'system', content: params.systemPrompt },
      { role: 'user', content: params.userPrompt },
    ],
    temperature: 0.15,
  };
  if (params.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await resp.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!resp.ok) {
    throw new Error(
      payload?.error?.message || `模型接口请求失败 (${resp.status})`
    );
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('模型返回内容为空');
  }
  return content;
}

export async function extractPaperMultiProvider(params: {
  provider: ModelProvider;
  apiKey: string;
  customBaseUrl?: string;
  pdfBuffer: Buffer;
  fileName: string;
  totalPagesHint?: number;
  model: AnyModelId;
  language: OutputLanguage;
  thinkingLevel: 'minimal' | 'low' | 'medium' | 'high';
  customDimensions: DimensionConfig[];
}): Promise<PaperExtractionResult> {
  if (params.provider === 'gemini') {
    return extractWithGemini({
      apiKey: params.apiKey,
      pdfBuffer: params.pdfBuffer,
      fileName: params.fileName,
      totalPagesHint: params.totalPagesHint,
      model: (params.model || 'gemini-4-hydrogen') as GeminiModelId,
      language: params.language,
      thinkingLevel: params.thinkingLevel,
      customDimensions: params.customDimensions,
    });
  }

  // DeepSeek / Qwen / Custom OpenAI-compatible text extraction with explicit page tags
  const baseUrl =
    params.customBaseUrl?.trim() || PROVIDER_DEFAULT_BASE_URL[params.provider];
  const { numPages, taggedText } = await extractPageTaggedText(params.pdfBuffer);

  const langRule =
    params.language === 'zh'
      ? '所有 summary 字段使用严谨简洁的学术中文（保留英文专有名词、模型名、数据集名与指标），quote 必须保留原文逐字摘录。'
      : 'Write all summary fields in rigorous academic English. Keep quote verbatim from the paper.';

  const customPrompt =
    params.customDimensions.length > 0
      ? `\nAdditionally populate "custom_dimensions" array with entries for:\n${params.customDimensions
          .map((d) => `- key="${d.key}", label="${d.label}": ${d.description}`)
          .join('\n')}`
      : '';

  const systemPrompt = `You are a rigorous academic literature review extractor. Output ONLY a single valid JSON object.
CRITICAL PAGE NUMBER RULE: The document below has explicit markers "=== [PDF PAGE N] ===". Every citation's "pdf_page" MUST be the integer N from the matching "=== [PDF PAGE N] ===" marker (1 to ${numPages}).
${langRule}`;

  const userPrompt = `Extract a Literature Review Matrix from PDF "${params.fileName}" (${numPages} pages) as strict JSON matching this exact shape:
{
  "title": "Exact paper title",
  "authors": "First Author et al.",
  "year": "YYYY",
  "venue": "Conference/Journal/arXiv",
  "total_pages_detected": ${numPages},
  "research_question": { "summary": "...", "keywords": ["..."], "citations": [{ "pdf_page": 1, "section": "...", "quote": "exact 10-30 word verbatim excerpt" }] },
  "methodology": { "summary": "...", "keywords": ["..."], "citations": [...] },
  "datasets": { "summary": "...", "keywords": ["..."], "citations": [...] },
  "conclusions": { "summary": "...", "keywords": ["..."], "citations": [...] },
  "limitations": { "summary": "...", "keywords": ["..."], "citations": [...] }${
    params.customDimensions.length > 0
      ? `,
  "custom_dimensions": [{ "key": "...", "label": "...", "summary": "...", "keywords": ["..."], "citations": [...] }]`
      : ''
  }
}${customPrompt}

Paper content with physical PDF page markers:
${taggedText}`;

  const rawText = await callOpenAICompatible({
    baseUrl,
    apiKey: params.apiKey,
    model: params.model,
    systemPrompt,
    userPrompt,
    jsonMode: params.model !== 'deepseek-reasoner',
  });

  const parsed = JSON.parse(sanitizeJsonText(rawText)) as Partial<PaperExtractionResult>;
  return clampAndNormalize(
    parsed,
    params.totalPagesHint || numPages,
    params.customDimensions
  );
}

export async function synthesizeMultiProvider(params: {
  provider: ModelProvider;
  apiKey: string;
  customBaseUrl?: string;
  model: AnyModelId;
  language: OutputLanguage;
  papers: Array<{
    title: string;
    authors: string;
    year: string;
    research_question: string;
    methodology: string;
    datasets: string;
    conclusions: string;
    limitations: string;
  }>;
}): Promise<string> {
  if (params.provider === 'gemini') {
    return synthesizeWithGemini({
      apiKey: params.apiKey,
      model: (params.model || 'gemini-4-hydrogen') as GeminiModelId,
      language: params.language,
      papers: params.papers,
    });
  }

  const baseUrl =
    params.customBaseUrl?.trim() || PROVIDER_DEFAULT_BASE_URL[params.provider];
  const langNote =
    params.language === 'zh'
      ? '请使用严谨的学术中文撰写，保留英文专业术语与引用格式 [第一作者, 年份]。'
      : 'Write in rigorous academic English using [Author, Year] inline citations.';

  const prompt = `Based on the following extracted literature review matrix of ${params.papers.length} papers, write a structured comparative synthesis (Related Work / 文献横向对比综述) organized into:
1. 研究脉络与问题演进
2. 方法论流派对比
3. 基准数据集与实验结论共识
4. 共性局限与未来切入点

${langNote}

Matrix JSON:
${JSON.stringify(params.papers, null, 2)}`;

  return callOpenAICompatible({
    baseUrl,
    apiKey: params.apiKey,
    model: params.model,
    systemPrompt: 'You are an expert academic researcher writing a Related Work comparative synthesis.',
    userPrompt: prompt,
    jsonMode: false,
  });
}
