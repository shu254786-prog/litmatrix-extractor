import type {
  DimensionConfig,
  ExtractedDimension,
  OutputLanguage,
  PaperExtractionResult,
  PaperRow,
} from '../types/matrix';
import type { ParsedPdfDocument } from './pdfHelper';

function buildPageIndexedContext(doc: ParsedPdfDocument, maxPages: number): string {
  const pages = doc.pages;
  if (pages.length === 0) return '';

  // Prioritize front pages + tail pages (where experiments/conclusions/limitations live) if doc is very long
  let selected = pages;
  if (pages.length > maxPages) {
    const frontCount = Math.ceil(maxPages * 0.65);
    const tailCount = maxPages - frontCount;
    selected = [
      ...pages.slice(0, frontCount),
      ...pages.slice(pages.length - tailCount),
    ];
  }

  const MAX_TOTAL_CHARS = 38000;
  const parts: string[] = [];
  let charCount = 0;

  for (const p of selected) {
    const pageText = p.text.slice(0, 3200);
    const block = `=== [PDF_PAGE_${p.pageNumber}] ===\n${pageText}\n`;
    if (charCount + block.length > MAX_TOTAL_CHARS) break;
    parts.push(block);
    charCount += block.length;
  }

  return parts.join('\n');
}

function parseJsonFromLlm(rawText: string): Record<string, unknown> {
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error('模型返回的内容不是有效的 JSON 格式，请重试或切换模型。');
  }
}

function normalizeDimension(
  raw: unknown,
  numPages: number
): ExtractedDimension {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const summary =
    typeof obj.summary === 'string' && obj.summary.trim()
      ? obj.summary.trim()
      : '未在论文中明确检索到该维度信息。';
  const keywords = Array.isArray(obj.keywords)
    ? obj.keywords.map(String).filter(Boolean).slice(0, 4)
    : [];

  const rawCitations = Array.isArray(obj.citations) ? obj.citations : [];
  const citations = rawCitations
    .map((c) => {
      const item = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
      const pageNum = Number(item.pdf_page) || 1;
      const clampedPage = Math.max(1, Math.min(numPages || 999, Math.round(pageNum)));
      return {
        pdf_page: clampedPage,
        section: typeof item.section === 'string' && item.section.trim() ? item.section.trim() : '正文',
        quote: typeof item.quote === 'string' && item.quote.trim() ? item.quote.trim() : summary.slice(0, 80),
      };
    })
    .slice(0, 3);

  if (citations.length === 0) {
    citations.push({
      pdf_page: 1,
      section: '全文综合',
      quote: summary.slice(0, 80),
    });
  }

  return { summary, keywords, citations };
}

async function callOpenAiCompatibleChat(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}): Promise<string> {
  const cleanBase = params.baseUrl.replace(/\/+$/, '');
  const endpoint = cleanBase.endsWith('/chat/completions')
    ? cleanBase
    : `${cleanBase}/chat/completions`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        temperature: params.temperature ?? 0.2,
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userPrompt },
        ],
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `无法连接模型接口 (${endpoint})：${msg}。若在浏览器中遇到跨域 (CORS) 限制，可使用支持浏览器的星火/DeepSeek接口，或切换「离线结构引擎」。`
    );
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `模型接口返回错误 (${response.status}): ${errText.slice(0, 260) || response.statusText}`
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new Error(`模型返回异常: ${data.error.message}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('模型返回了空响应。');
  }
  return content;
}

export async function extractPaperWithLlm(params: {
  doc: ParsedPdfDocument;
  fileName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  language: OutputLanguage;
  maxPagesToSend: number;
  customDimensions: DimensionConfig[];
}): Promise<PaperExtractionResult> {
  const {
    doc,
    fileName,
    baseUrl,
    apiKey,
    model,
    language,
    maxPagesToSend,
    customDimensions,
  } = params;

  const pageContext = buildPageIndexedContext(doc, maxPagesToSend);
  if (!pageContext.trim()) {
    throw new Error('未能从该 PDF 读取到文本内容（可能是扫描版图片 PDF）。');
  }

  const langHint =
    language === 'zh'
      ? '所有 summary 字段使用精炼规范的学术中文（保留关键英文模型名、数据集名、指标符号）；quote 字段必须保持 PDF 原文语言逐字摘录。'
      : 'Write all summary fields in concise academic English; keep quote verbatim in the original PDF language.';

  const customSchemaText =
    customDimensions.length > 0
      ? `,\n  "custom_dimensions": [\n${customDimensions
          .map(
            (d) =>
              `    { "key": "${d.key}", "label": "${d.label}", "summary": "...", "keywords": ["..."], "citations": [{ "pdf_page": 1, "section": "...", "quote": "..." }] }`
          )
          .join(',\n')}\n  ]`
      : '';

  const systemPrompt = [
    'You are an expert academic literature review analyst.',
    'Extract structured comparison dimensions strictly from the provided page-indexed PDF text.',
    'Each page is marked with === [PDF_PAGE_N] === where N is the 1-indexed physical PDF page number.',
    'Never fabricate numbers, datasets, or quotes. Every citation pdf_page must match the === [PDF_PAGE_N] === marker where the quote actually appears.',
    'Output ONLY valid JSON with no extra commentary.',
  ].join(' ');

  const userPrompt = `文件名: ${fileName} (总页数: ${doc.numPages})
语言要求: ${langHint}
${
  customDimensions.length > 0
    ? `自定义扩展维度:\n${customDimensions.map((d) => `- key="${d.key}", label="${d.label}": ${d.description}`).join('\n')}\n`
    : ''
}
请严格按照以下 JSON 结构输出（不要包含 Markdown 以外的多余文字）：
{
  "title": "论文完整标题",
  "authors": "主要作者（如 Vaswani et al. 或 张三等）",
  "year": "4位出版年份或 N/A",
  "venue": "发表会议/期刊/arXiv",
  "total_pages_detected": ${doc.numPages},
  "research_question": {
    "summary": "2-3句总结核心研究问题与动机",
    "keywords": ["关键词1", "关键词2"],
    "citations": [{ "pdf_page": 1, "section": "章节名", "quote": "10-30词原文摘录" }]
  },
  "methodology": { "summary": "...", "keywords": ["..."], "citations": [{ "pdf_page": 1, "section": "...", "quote": "..." }] },
  "datasets": { "summary": "...", "keywords": ["..."], "citations": [{ "pdf_page": 1, "section": "...", "quote": "..." }] },
  "conclusions": { "summary": "...", "keywords": ["..."], "citations": [{ "pdf_page": 1, "section": "...", "quote": "..." }] },
  "limitations": { "summary": "...", "keywords": ["..."], "citations": [{ "pdf_page": 1, "section": "...", "quote": "..." }] }${customSchemaText}
}

以下是按物理页码标注的论文正文：
${pageContext}`;

  const rawContent = await callOpenAiCompatibleChat({
    baseUrl,
    apiKey,
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.15,
  });

  const parsed = parseJsonFromLlm(rawContent);

  const rawCustom = Array.isArray(parsed.custom_dimensions)
    ? parsed.custom_dimensions
    : [];

  const custom_dimensions =
    customDimensions.length > 0
      ? customDimensions.map((cd) => {
          const found = rawCustom.find(
            (item) =>
              item &&
              typeof item === 'object' &&
              (item as Record<string, unknown>).key === cd.key
          );
          const norm = normalizeDimension(found, doc.numPages);
          return {
            key: cd.key,
            label: cd.label,
            ...norm,
          };
        })
      : undefined;

  return {
    title:
      typeof parsed.title === 'string' && parsed.title.trim()
        ? parsed.title.trim()
        : fileName.replace(/\.pdf$/i, ''),
    authors:
      typeof parsed.authors === 'string' && parsed.authors.trim()
        ? parsed.authors.trim()
        : 'Unknown',
    year:
      typeof parsed.year === 'string' || typeof parsed.year === 'number'
        ? String(parsed.year).trim()
        : 'N/A',
    venue:
      typeof parsed.venue === 'string' && parsed.venue.trim()
        ? parsed.venue.trim()
        : 'Preprint / PDF',
    total_pages_detected: doc.numPages,
    research_question: normalizeDimension(parsed.research_question, doc.numPages),
    methodology: normalizeDimension(parsed.methodology, doc.numPages),
    datasets: normalizeDimension(parsed.datasets, doc.numPages),
    conclusions: normalizeDimension(parsed.conclusions, doc.numPages),
    limitations: normalizeDimension(parsed.limitations, doc.numPages),
    custom_dimensions,
  };
}

export async function synthesizeLiteratureWithLlm(params: {
  papers: PaperRow[];
  baseUrl: string;
  apiKey: string;
  model: string;
  language: OutputLanguage;
}): Promise<string> {
  const { papers, baseUrl, apiKey, model, language } = params;
  const completed = papers.filter((p) => p.status === 'done' && p.extraction);

  const digest = completed.map((p, idx) => {
    const ext = p.extraction!;
    return {
      index: idx + 1,
      title: ext.title,
      authors: ext.authors,
      year: ext.year,
      venue: ext.venue,
      research_question: ext.research_question.summary,
      methodology: ext.methodology.summary,
      datasets: ext.datasets.summary,
      conclusions: ext.conclusions.summary,
      limitations: ext.limitations.summary,
    };
  });

  const prompt =
    language === 'zh'
      ? `请基于以下 ${digest.length} 篇论文的提取矩阵，撰写一份可直接放入学术论文 Related Work（文献综述）章节的横向对比综述（Markdown 格式），包含：\n1. 研究问题演进主线\n2. 方法流派对比与优缺点\n3. 主流数据集与评测结论共识\n4. 现有共性局限性与未来研究空白 (Research Gaps)\n\n要求引用具体论文时标注 [作者, 年份]。\n\n文献矩阵 JSON:\n${JSON.stringify(digest, null, 2)}`
      : `Based on the following ${digest.length} paper extraction matrix items, write a publication-ready Related Work comparative synthesis in Markdown covering research evolution, methodology taxonomy, benchmark consensus, and shared limitations/gaps. Cite papers as [Authors, Year].\n\n${JSON.stringify(digest, null, 2)}`;

  return callOpenAiCompatibleChat({
    baseUrl,
    apiKey,
    model,
    systemPrompt: 'You are an expert academic researcher writing a high-impact survey paper.',
    userPrompt: prompt,
    temperature: 0.3,
  });
}
