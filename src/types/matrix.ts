export type CoreDimensionKey =
  | 'research_question'
  | 'methodology'
  | 'datasets'
  | 'conclusions'
  | 'limitations';

export interface DimensionConfig {
  key: string;
  label: string;
  description: string;
  isCore?: boolean;
}

export interface PageCitation {
  pdf_page: number;
  section: string;
  quote: string;
}

export interface ExtractedDimension {
  summary: string;
  keywords: string[];
  citations: PageCitation[];
}

export interface PaperExtractionResult {
  title: string;
  authors: string;
  year: string;
  venue: string;
  total_pages_detected: number;
  research_question: ExtractedDimension;
  methodology: ExtractedDimension;
  datasets: ExtractedDimension;
  conclusions: ExtractedDimension;
  limitations: ExtractedDimension;
  custom_dimensions?: Array<{
    key: string;
    label: string;
    summary: string;
    keywords: string[];
    citations: PageCitation[];
  }>;
}

export type PaperStatus = 'queued' | 'extracting' | 'done' | 'error';

export interface PaperRow {
  id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  status: PaperStatus;
  error?: string;
  durationMs?: number;
  modelUsed?: string;
  isDemo?: boolean;
  hasPdf?: boolean;
  extraction?: PaperExtractionResult;
}

export interface ProvenanceTarget {
  paperId: string;
  fileName: string;
  paperTitle: string;
  dimensionLabel: string;
  citation: PageCitation;
}

export type OutputLanguage = 'zh' | 'en';

export type GeminiModelId =
  | 'gemini-4-hydrogen'
  | 'gemini-4-argon'
  | 'gemini-4-carbon'
  | 'gemini-3.5-flash-lite';

export interface ExtractionSettings {
  apiKey: string;
  model: GeminiModelId;
  language: OutputLanguage;
  concurrency: number;
  thinkingLevel: 'minimal' | 'low' | 'medium' | 'high';
  customDimensions: DimensionConfig[];
}

export const CORE_DIMENSIONS: DimensionConfig[] = [
  {
    key: 'research_question',
    label: '研究问题',
    description: '论文要解决的核心科学问题、研究动机或现实痛点',
    isCore: true,
  },
  {
    key: 'methodology',
    label: '方法',
    description: '提出的模型架构、算法框架、实验设计或理论方法',
    isCore: true,
  },
  {
    key: 'datasets',
    label: '数据集',
    description: '使用的数据集、基准测试集、样本规模及评估指标',
    isCore: true,
  },
  {
    key: 'conclusions',
    label: '结论',
    description: '主要实验结果、量化提升幅度与核心发现',
    isCore: true,
  },
  {
    key: 'limitations',
    label: '局限性',
    description: '作者自述的局限、边界条件、算力/数据瓶颈或未来工作',
    isCore: true,
  },
];
