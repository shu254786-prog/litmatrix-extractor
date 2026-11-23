import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  DimensionConfig,
  GeminiModelId,
  OutputLanguage,
  PaperExtractionResult,
} from '../src/types/matrix.js';

const INLINE_PDF_LIMIT_BYTES = 12 * 1024 * 1024; // 12 MB inline base64 threshold; larger files use Files API

const dimensionSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description:
        'Concise, high-density academic synthesis (2-4 sentences). Do not fabricate details missing from the PDF; if not stated in the paper, explicitly note that it is not reported.',
    },
    keywords: {
      type: 'array',
      items: { type: 'string' },
      description: '2 to 4 short key terms, model names, dataset names, or metric tags.',
    },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pdf_page: {
            type: 'integer',
            description:
              '1-indexed physical page number of the PDF file (Page 1 = very first page of the PDF, ignoring printed journal pagination).',
          },
          section: {
            type: 'string',
            description: 'Section or heading title where the evidence appears (e.g., "3.2 Method", "5 Limitations").',
          },
          quote: {
            type: 'string',
            description:
              'Short exact verbatim excerpt copied from that PDF page (10-30 words) supporting the summary.',
          },
        },
        required: ['pdf_page', 'section', 'quote'],
      },
      description: 'At least 1 and up to 3 page-level provenance citations for this dimension.',
    },
  },
  required: ['summary', 'keywords', 'citations'],
};

function buildExtractionSchema(customDimensions: DimensionConfig[]) {
  const properties: Record<string, unknown> = {
    title: { type: 'string', description: 'Exact title of the paper.' },
    authors: {
      type: 'string',
      description: 'Concise author list (e.g., "Vaswani et al." or "张三, 李四").',
    },
    year: { type: 'string', description: '4-digit publication or preprint year, or "N/A".' },
    venue: {
      type: 'string',
      description: 'Conference, journal, or preprint archive (e.g., "NeurIPS 2024", "arXiv").',
    },
    total_pages_detected: {
      type: 'integer',
      description: 'Total physical pages observed in this PDF.',
    },
    research_question: dimensionSchema,
    methodology: dimensionSchema,
    datasets: dimensionSchema,
    conclusions: dimensionSchema,
    limitations: dimensionSchema,
  };

  const required = [
    'title',
    'authors',
    'year',
    'venue',
    'total_pages_detected',
    'research_question',
    'methodology',
    'datasets',
    'conclusions',
    'limitations',
  ];

  if (customDimensions.length > 0) {
    properties.custom_dimensions = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          label: { type: 'string' },
          summary: { type: 'string' },
          keywords: { type: 'array', items: { type: 'string' } },
          citations: dimensionSchema.properties.citations,
        },
        required: ['key', 'label', 'summary', 'keywords', 'citations'],
      },
    };
    required.push('custom_dimensions');
  }

  return {
    type: 'object',
    properties,
    required,
  };
}

export interface ExtractPaperParams {
  apiKey: string;
  pdfBuffer: Buffer;
  fileName: string;
  totalPagesHint?: number;
  model: GeminiModelId;
  language: OutputLanguage;
  thinkingLevel: 'minimal' | 'low' | 'medium' | 'high';
  customDimensions: DimensionConfig[];
}

export async function extractPaperMatrix(
  params: ExtractPaperParams
): Promise<PaperExtractionResult> {
  const {
    apiKey,
    pdfBuffer,
    fileName,
    totalPagesHint,
    model,
    language,
    thinkingLevel,
    customDimensions,
  } = params;

  const ai = new GoogleGenAI({ apiKey });

  const langInstruction =
    language === 'zh'
      ? 'Write all `summary` fields in clear, precise academic Chinese (保留关键英文专有名词、模型名、数据集名和指标符号). Keep `quote` verbatim in the original language of the PDF.'
      : 'Write all `summary` fields in clear, precise academic English. Keep `quote` verbatim in the original language of the PDF.';

  const customDimPrompt =
    customDimensions.length > 0
      ? `\nAlso extract these custom dimensions into \`custom_dimensions\`:\n${customDimensions
          .map((d) => `- key="${d.key}", label="${d.label}": ${d.description}`)
          .join('\n')}`
      : '';

  const systemInstruction = `You are an expert academic research assistant building a rigorous Literature Review Matrix with strict page-level provenance.
Rules:
1. Ground every single claim in the provided PDF document. Never invent results, datasets, or page numbers.
2. CRITICAL PAGE NUMBER RULE: \`pdf_page\` MUST be the 1-indexed physical page number within the PDF file itself (page 1 is the cover/first page of the PDF), NOT printed journal header/footer page numbers (such as "1042" or "iv").${
    totalPagesHint ? ` This PDF has ${totalPagesHint} physical pages (valid range: 1 to ${totalPagesHint}).` : ''
  }
3. For each dimension (research_question, methodology, datasets, conclusions, limitations), provide 1 to 3 citations with \`pdf_page\`, \`section\`, and an exact short \`quote\` (10-30 words) copied verbatim from that page.
4. ${langInstruction}`;

  const prompt = `Analyze the attached research paper PDF ("${fileName}") and extract a structured Literature Review Matrix covering:
1. research_question (研究问题): core problem, motivation, and research gap.
2. methodology (方法): proposed architecture, algorithm, theoretical formulation, or study design.
3. datasets (数据集): benchmarks, datasets, sample sizes, and evaluation metrics used (if purely theoretical/survey with no dataset, explicitly state that and cite the relevant page).
4. conclusions (结论): headline empirical results, quantitative gains, and primary takeaways.
5. limitations (局限性): stated limitations, failure modes, assumptions, or future work (if not explicitly discussed, note that and cite the Discussion/Conclusion page).${customDimPrompt}`;

  const schema = buildExtractionSchema(customDimensions);
  let uploadedFileName: string | undefined;
  let tempFilePath: string | undefined;

  try {
    let documentBlock:
      | { type: 'document'; data: string; mime_type: 'application/pdf' }
      | { type: 'document'; uri: string; mime_type: 'application/pdf' };

    if (pdfBuffer.byteLength <= INLINE_PDF_LIMIT_BYTES) {
      documentBlock = {
        type: 'document',
        data: pdfBuffer.toString('base64'),
        mime_type: 'application/pdf',
      };
    } else {
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      tempFilePath = path.join(os.tmpdir(), `litmatrix_${Date.now()}_${safeName}`);
      await fs.writeFile(tempFilePath, pdfBuffer);
      const uploaded = await ai.files.upload({
        file: tempFilePath,
        config: { mimeType: 'application/pdf', displayName: fileName },
      });
      uploadedFileName = uploaded.name;
      if (!uploaded.uri) {
        throw new Error('Gemini Files API did not return a file URI.');
      }
      documentBlock = {
        type: 'document',
        uri: uploaded.uri,
        mime_type: 'application/pdf',
      };
    }

    const interaction = await ai.interactions.create({
      model,
      system_instruction: systemInstruction,
      input: [documentBlock, { type: 'text', text: prompt }],
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema,
      },
      generation_config: {
        thinking_level: thinkingLevel,
      },
      store: false,
    });

    const rawText = interaction.output_text;
    if (!rawText) {
      throw new Error('Gemini returned an empty response.');
    }

    const parsed = JSON.parse(rawText) as PaperExtractionResult;
    if (totalPagesHint && totalPagesHint > 0) {
      clampPageNumbers(parsed, totalPagesHint);
    }
    return parsed;
  } finally {
    if (tempFilePath) {
      await fs.unlink(tempFilePath).catch(() => {});
    }
    if (uploadedFileName) {
      await ai.files.delete({ name: uploadedFileName }).catch(() => {});
    }
  }
}

function clampPageNumbers(result: PaperExtractionResult, maxPages: number) {
  const clampList = (citations?: Array<{ pdf_page: number }>) => {
    if (!citations) return;
    for (const c of citations) {
      if (typeof c.pdf_page !== 'number' || Number.isNaN(c.pdf_page)) {
        c.pdf_page = 1;
      } else {
        c.pdf_page = Math.max(1, Math.min(maxPages, Math.round(c.pdf_page)));
      }
    }
  };
  clampList(result.research_question?.citations);
  clampList(result.methodology?.citations);
  clampList(result.datasets?.citations);
  clampList(result.conclusions?.citations);
  clampList(result.limitations?.citations);
  for (const cd of result.custom_dimensions ?? []) {
    clampList(cd.citations);
  }
}

export async function synthesizeLiteratureReview(params: {
  apiKey: string;
  model: GeminiModelId;
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
  const ai = new GoogleGenAI({ apiKey: params.apiKey });
  const langNote =
    params.language === 'zh'
      ? '请使用严谨的学术中文撰写，保留英文专业术语与引用格式 [第一作者, 年份]。'
      : 'Write in rigorous academic English using [Author, Year] inline citations.';

  const prompt = `Based on the following extracted literature review matrix of ${params.papers.length} papers, write a structured comparative synthesis (Related Work / 文献横向对比综述) organized into:
1. 研究脉络与问题演进 (Evolution of Research Questions)
2. 方法论流派对比 (Methodological Taxonomy & Trade-offs)
3. 基准数据集与实验结论共识 (Benchmarks & Empirical Consensus)
4. 共性局限与未来切入点 (Shared Limitations & Research Opportunities)

${langNote}

Matrix JSON:
${JSON.stringify(params.papers, null, 2)}`;

  const interaction = await ai.interactions.create({
    model: params.model,
    input: prompt,
    generation_config: { thinking_level: 'medium' },
    store: false,
  });

  return interaction.output_text || '';
}
