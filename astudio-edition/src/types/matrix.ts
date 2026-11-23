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

export type EngineUsed = 'spark-llm' | 'offline-nlp' | 'demo';

export interface PaperRow {
  id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  status: PaperStatus;
  error?: string;
  durationMs?: number;
  modelUsed?: string;
  engineUsed?: EngineUsed;
  isDemo?: boolean;
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

export type EngineMode = 'auto' | 'offline' | 'llm';

export type ProviderId = 'spark' | 'deepseek' | 'qwen' | 'custom';

export interface ProviderPreset {
  id: ProviderId;
  name: string;
  badge: string;
  baseUrl: string;
  defaultModel: string;
  models: Array<{ id: string; label: string; desc: string }>;
  keyPlaceholder: string;
  docUrl: string;
  docLabel: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'spark',
    name: '讯飞星火大模型 (Spark OpenAI 兼容)',
    badge: 'AStudio 推荐',
    baseUrl: 'https://spark-api-open.xf-yun.com/v1',
    defaultModel: '4.0Ultra',
    models: [
      { id: '4.0Ultra', label: 'Spark 4.0 Ultra', desc: '讯飞旗舰模型 · 复杂学术综述与多维抽取首选' },
      { id: 'generalv3.5', label: 'Spark Max (3.5)', desc: '均衡高效 · 适合 20 篇以上批量稳定提取' },
      { id: 'pro-128k', label: 'Spark Pro 128K', desc: '128K 超长上下文 · 适合长篇综述与学位论文' },
      { id: 'lite', label: 'Spark Lite', desc: '免费轻量高速 · 适合快速初筛与演示' },
    ],
    keyPlaceholder: '输入讯飞开放平台星火 APIPassword (Bearer Key)',
    docUrl: 'https://www.xfyun.cn/doc/spark/HTTP%E8%B0%83%E7%94%A8%E6%96%87%E6%A1%A3.html',
    docLabel: '获取星火 APIPassword ↗',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek OpenAI 兼容接口',
    badge: '高性价比',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek-V3 (deepseek-chat)', desc: '学术结构化 JSON 抽取精度高、成本极低' },
      { id: 'deepseek-reasoner', label: 'DeepSeek-R1 (deepseek-reasoner)', desc: '深度推理模型 · 适合理论推导型论文' },
    ],
    keyPlaceholder: 'sk-...',
    docUrl: 'https://platform.deepseek.com/',
    docLabel: '前往 DeepSeek 控制台 ↗',
  },
  {
    id: 'qwen',
    name: '通义千问 (DashScope 兼容接口)',
    badge: '长文本',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: [
      { id: 'qwen-plus', label: 'Qwen-Plus', desc: '中英文论文抽取效果均衡' },
      { id: 'qwen-long', label: 'Qwen-Long', desc: '超长上下文窗口，完整覆盖数十页 PDF' },
    ],
    keyPlaceholder: 'sk-...',
    docUrl: 'https://bailian.console.aliyun.com/',
    docLabel: '前往阿里云百炼 ↗',
  },
  {
    id: 'custom',
    name: '自定义 OpenAI 兼容接口 (Ollama / vLLM / OneAPI)',
    badge: '自由扩展',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5:14b',
    models: [],
    keyPlaceholder: 'sk-...（本地模型可填 ollama）',
    docUrl: 'https://platform.openai.com/docs/api-reference/chat',
    docLabel: 'OpenAI Chat Completions 规范 ↗',
  },
];

export interface ExtractionSettings {
  engineMode: EngineMode;
  provider: ProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  language: OutputLanguage;
  concurrency: number;
  maxPagesToSend: number;
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
