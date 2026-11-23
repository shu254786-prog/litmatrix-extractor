import type {
  DimensionConfig,
  ExtractedDimension,
  OutputLanguage,
  PageCitation,
  PaperExtractionResult,
  PaperRow,
} from '../types/matrix';
import type { ParsedPdfDocument } from './pdfHelper';

interface IndexedSentence {
  text: string;
  page: number;
  section: string;
}

const KNOWN_VENUES = [
  'NeurIPS',
  'ICML',
  'ICLR',
  'CVPR',
  'ICCV',
  'ECCV',
  'ACL',
  'EMNLP',
  'NAACL',
  'AAAI',
  'IJCAI',
  'KDD',
  'SIGIR',
  'WWW',
  'TKDE',
  'TPAMI',
  'Nature',
  'Science',
  'arXiv',
  'IEEE',
  'ACM',
  '计算机学报',
  '软件学报',
  '自动化学报',
  '中文信息学报',
  '电子学报',
];

const KNOWN_DATASETS = [
  'ImageNet',
  'CIFAR-10',
  'CIFAR-100',
  'COCO',
  'MNIST',
  'GLUE',
  'SuperGLUE',
  'MMLU',
  'GSM8K',
  'MATH',
  'HumanEval',
  'SQuAD',
  'Natural Questions',
  'TriviaQA',
  'HotpotQA',
  'MS MARCO',
  'FEVER',
  'WMT',
  'WikiText',
  'WikiSQL',
  'Cora',
  'Citeseer',
  'PubMed',
  'MIMIC',
  'HH-RLHF',
  'AlpacaEval',
  'MT-Bench',
  'CLUE',
  'C-Eval',
  'CMMLU',
];

function isSectionHeading(line: string): boolean {
  if (line.length < 3 || line.length > 75) return false;
  if (/^(\d+(\.\d+)*\.?\s+|[IVX]+\.\s+)[A-Za-z\u4e00-\u9fa5]/.test(line)) {
    return !/[.。;；]$/.test(line);
  }
  if (
    /^(abstract|introduction|related work|background|method|methodology|approach|framework|architecture|experiments?|experimental setup|datasets?|evaluation|results?|discussion|limitations?|conclusion|future work|references|摘要|引言|绪论|相关工作|研究方法|模型架构|实验设置|数据集|实验结果|结果分析|局限性|讨论|总结与展望|结论)$/i.test(
      line.trim()
    )
  ) {
    return true;
  }
  return false;
}

function splitIntoSentences(text: string): string[] {
  // Split English & Chinese sentence boundaries while preserving abbreviations moderately
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const raw = cleaned.split(/(?<=[。！？!?]|(?<!et al|e\.g|i\.e|Fig|Tab|Eq|Dr|Mr|vs)\.)\s+/);
  return raw
    .map((s) => s.trim())
    .filter((s) => s.length >= 24 && s.length <= 420);
}

function extractSentencesWithSections(doc: ParsedPdfDocument): IndexedSentence[] {
  const result: IndexedSentence[] = [];
  let currentSection = 'Front Matter';

  for (const page of doc.pages) {
    let pageBuffer: string[] = [];
    const flushBuffer = () => {
      if (pageBuffer.length === 0) return;
      const sentences = splitIntoSentences(pageBuffer.join(' '));
      for (const s of sentences) {
        result.push({
          text: s,
          page: page.pageNumber,
          section: currentSection,
        });
      }
      pageBuffer = [];
    };

    for (const line of page.lines) {
      if (isSectionHeading(line)) {
        flushBuffer();
        currentSection = line.slice(0, 60);
        if (/^(references|bibliography|acknowledg|参考文献|致谢)/i.test(currentSection)) {
          // Stop collecting body sentences once References section starts
          return result;
        }
      } else {
        pageBuffer.push(line);
      }
    }
    flushBuffer();
  }

  return result;
}

function inferMetadata(doc: ParsedPdfDocument, fileName: string) {
  const firstPage = doc.pages[0];
  const firstLines = firstPage?.lines ?? [];
  const firstPageText = firstPage?.text ?? '';

  // Title heuristic
  let title = doc.metadataTitle || '';
  if (!title || /^untitled|microsoft word|latex/i.test(title)) {
    const candidateLines = firstLines
      .slice(0, 8)
      .filter(
        (l) =>
          l.length >= 10 &&
          l.length <= 160 &&
          !/^(arxiv:|proceedings|published|accepted|copyright|preprint|http|doi:|vol\.|no\.)/i.test(
            l
          ) &&
          !/@/.test(l)
      );
    title = candidateLines[0] || fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
  }

  // Year heuristic
  const yearMatch =
    firstPageText.match(/\b(202[0-6]|201\d|200\d)\b/) ||
    fileName.match(/(202[0-6]|201\d|200\d)/);
  const year = yearMatch ? yearMatch[1] : 'N/A';

  // Venue heuristic
  let venue = 'PDF Document';
  for (const v of KNOWN_VENUES) {
    if (new RegExp(`\\b${v}\\b|${v}`, 'i').test(firstPageText)) {
      venue = year !== 'N/A' && !v.includes(year) ? `${v} ${year}` : v;
      break;
    }
  }

  // Authors heuristic
  let authors = doc.metadataAuthor || '';
  if (!authors) {
    const titleIdx = firstLines.findIndex((l) => l === title);
    const afterTitle = firstLines
      .slice(Math.max(0, titleIdx + 1), Math.max(2, titleIdx + 4))
      .find((l) => l.length >= 4 && l.length <= 110 && !/abstract|摘要|university|学院|大学/i.test(l));
    authors = afterTitle || '未在首页显式识别作者';
  }

  return { title, authors, year, venue };
}

interface DimensionProfile {
  sectionBoost: RegExp;
  cues: Array<{ pattern: RegExp; weight: number }>;
  fallbackSummary: string;
}

const CORE_PROFILES: Record<string, DimensionProfile> = {
  research_question: {
    sectionBoost: /abstract|intro|background|motivation|problem|摘要|引言|绪论/i,
    cues: [
      { pattern: /\b(we address|we investigate|we study|we explore|research question|problem|challenge|bottleneck|motivation|crucial|however|despite|hinder|limitation of existing|aim to)\b/i, weight: 4 },
      { pattern: /(针对|为了解决|旨在|现有方法|痛点|瓶颈|挑战|问题在于|尚未解决|如何有效)/, weight: 4 },
      { pattern: /\b(this paper|in this work|our goal|to bridge this gap)\b/i, weight: 3 },
    ],
    fallbackSummary: '论文在引言与摘要部分探讨了该领域的核心技术瓶颈与任务需求。',
  },
  methodology: {
    sectionBoost: /method|approach|framework|model|architecture|design|algorithm|方法|模型|架构|设计|算法/i,
    cues: [
      { pattern: /\b(we propose|we introduce|we present|our approach|our framework|architecture|algorithm|module|mechanism|pipeline|loss function|objective|transformer|attention|diffusion|graph)\b/i, weight: 4 },
      { pattern: /(本文提出|我们提出|构建了|设计了|框架|算法|模块|机制|端到端|联合训练|损失函数)/, weight: 4 },
      { pattern: /\b(consists of|comprises|formulated as|specifically|trained with)\b/i, weight: 2 },
    ],
    fallbackSummary: '论文提出了相应的模型框架与计算流程以实现目标任务建模。',
  },
  datasets: {
    sectionBoost: /experiment|dataset|data|setup|eval|benchmark|实验|数据|评估/i,
    cues: [
      { pattern: /\b(dataset|datasets|benchmark|benchmarks|corpus|corpora|samples|training set|test set|evaluated on|split|metric|accuracy|f1|bleu|rouge|auc|rmse)\b/i, weight: 4 },
      { pattern: /(数据集|基准|语料|样本|训练集|测试集|验证集|评价指标|评估指标|准确率|召回率)/, weight: 4 },
      { pattern: new RegExp(`\\b(${KNOWN_DATASETS.join('|')})\\b`, 'i'), weight: 5 },
    ],
    fallbackSummary: '论文在标准公开数据集或自建测试集上进行了定量对比实验。',
  },
  conclusions: {
    sectionBoost: /result|conclusion|finding|eval|performance|实验结果|结论|总结/i,
    cues: [
      { pattern: /\b(outperforms?|achieves?|demonstrates?|results show|we find|significantly|state-of-the-art|sota|surpass|improve|improvement|gain|by \d+(\.\d+)?%|in conclusion)\b/i, weight: 4 },
      { pattern: /(实验结果表明|显著优于|提升了|达到|超过了|综上所述|本文结论|证实了|有效性)/, weight: 4 },
      { pattern: /\b(\d+(\.\d+)?%|bleu|f1|acc)\b/i, weight: 2 },
    ],
    fallbackSummary: '实验结果验证了所提方法在核心评估指标上相较基线具有更优表现。',
  },
  limitations: {
    sectionBoost: /limit|discuss|future|conclusion|broader|ethic|局限|不足|讨论|展望/i,
    cues: [
      { pattern: /\b(limitation|limitations|future work|drawback|shortcoming|bottleneck|constraint|remains challenging|fail to|cannot handle|high computational|overhead|leave.*for future|only evaluated)\b/i, weight: 5 },
      { pattern: /(局限性|不足之处|未来工作|未来将|仍有待|计算开销|算力瓶颈|泛化能力受限|仅在.*测试)/, weight: 5 },
      { pattern: /\b(however|although|nevertheless|caveat|trade-off)\b/i, weight: 2 },
    ],
    fallbackSummary: '论文在讨论或结论章节提及了方法在适用边界、计算成本或泛化性方面的改进空间。',
  },
};

function extractKeywordsFromText(text: string, isDatasetDim = false): string[] {
  const tags: string[] = [];
  if (isDatasetDim) {
    for (const ds of KNOWN_DATASETS) {
      if (new RegExp(`\\b${ds}\\b`, 'i').test(text)) {
        tags.push(ds);
      }
    }
  }

  // Extract capitalized acronyms or model names (e.g., LoRA, Transformer, PPO, BERT)
  const acronyms = text.match(/\b[A-Z][A-Za-z0-9-]{2,14}\b/g) || [];
  const stopWords = new Set([
    'The',
    'This',
    'That',
    'These',
    'Those',
    'Table',
    'Figure',
    'Section',
    'Page',
    'However',
    'Furthermore',
    'Moreover',
    'Although',
    'Because',
    'Results',
    'Method',
    'Methods',
  ]);
  for (const a of acronyms) {
    if (!stopWords.has(a) && !tags.includes(a)) {
      tags.push(a);
    }
    if (tags.length >= 4) break;
  }

  // Extract Chinese key noun phrases if few English tags
  if (tags.length < 3) {
    const cnChunks = text.match(/[\u4e00-\u9fa5]{2,6}(?:模型|方法|机制|算法|数据集|指标|架构|网络|注意力|检索|微调)/g) || [];
    for (const c of cnChunks) {
      if (!tags.includes(c)) tags.push(c);
      if (tags.length >= 4) break;
    }
  }

  return tags.slice(0, 4);
}

function scoreAndPickDimension(
  sentences: IndexedSentence[],
  dimKey: string,
  customDim?: DimensionConfig,
  language: OutputLanguage = 'zh'
): ExtractedDimension {
  const profile = CORE_PROFILES[dimKey];

  const scored = sentences.map((s) => {
    let score = 0;

    if (profile) {
      if (profile.sectionBoost.test(s.section)) score += 3;
      for (const cue of profile.cues) {
        if (cue.pattern.test(s.text)) score += cue.weight;
      }
      // Prefer earlier pages for research_question, later pages for conclusions/limitations
      if (dimKey === 'research_question' && s.page <= 2) score += 2;
      if (dimKey === 'limitations' && s.page >= Math.max(2, (sentences[sentences.length - 1]?.page || 1) - 3)) {
        score += 2;
      }
    } else if (customDim) {
      const tokens = `${customDim.label} ${customDim.description}`
        .toLowerCase()
        .split(/[\s,，、；;]+/)
        .filter((t) => t.length >= 2);
      const lower = `${s.section} ${s.text}`.toLowerCase();
      for (const tok of tokens) {
        if (lower.includes(tok)) score += 4;
      }
    }

    // Mild length sweet-spot bonus
    if (s.text.length >= 60 && s.text.length <= 240) score += 1;

    return { sentence: s, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const picked: IndexedSentence[] = [];
  for (const item of scored) {
    if (item.score <= 0 && picked.length >= 1) break;
    const duplicate = picked.some(
      (p) => p.text.slice(0, 40) === item.sentence.text.slice(0, 40)
    );
    if (!duplicate) {
      picked.push(item.sentence);
    }
    if (picked.length >= 2) break;
  }

  if (picked.length === 0 && sentences.length > 0) {
    picked.push(sentences[0]);
  }

  const citations: PageCitation[] = picked.map((p) => ({
    pdf_page: p.page,
    section: p.section,
    quote: p.text.length > 220 ? `${p.text.slice(0, 217)}...` : p.text,
  }));

  let summary = '';
  if (picked.length > 0) {
    const joined = picked.map((p) => p.text).join(' ');
    summary =
      language === 'zh'
        ? `${joined}`
        : joined;
    if (summary.length > 340) {
      summary = `${summary.slice(0, 337)}...`;
    }
  } else {
    summary = profile?.fallbackSummary || '未在 PDF 正文中检测到足够匹配的文本段落（可能为扫描版图片 PDF）。';
  }

  const keywords = extractKeywordsFromText(
    picked.map((p) => p.text).join(' '),
    dimKey === 'datasets'
  );

  return {
    summary,
    keywords: keywords.length > 0 ? keywords : [customDim?.label || '正文定位'],
    citations,
  };
}

export function extractPaperOffline(params: {
  doc: ParsedPdfDocument;
  fileName: string;
  language: OutputLanguage;
  customDimensions: DimensionConfig[];
}): PaperExtractionResult {
  const { doc, fileName, language, customDimensions } = params;
  const totalTextLen = doc.pages.reduce((acc, p) => acc + p.text.length, 0);

  if (totalTextLen < 80) {
    throw new Error(
      '未能从该 PDF 提取到足够的可选文本（可能是纯图片扫描件）。请切换为支持多模态 PDF 的大模型接口或先做 OCR。'
    );
  }

  const meta = inferMetadata(doc, fileName);
  const sentences = extractSentencesWithSections(doc);

  const research_question = scoreAndPickDimension(sentences, 'research_question', undefined, language);
  const methodology = scoreAndPickDimension(sentences, 'methodology', undefined, language);
  const datasets = scoreAndPickDimension(sentences, 'datasets', undefined, language);
  const conclusions = scoreAndPickDimension(sentences, 'conclusions', undefined, language);
  const limitations = scoreAndPickDimension(sentences, 'limitations', undefined, language);

  const custom_dimensions =
    customDimensions.length > 0
      ? customDimensions.map((cd) => {
          const res = scoreAndPickDimension(sentences, cd.key, cd, language);
          return {
            key: cd.key,
            label: cd.label,
            ...res,
          };
        })
      : undefined;

  return {
    title: meta.title,
    authors: meta.authors,
    year: meta.year,
    venue: meta.venue,
    total_pages_detected: doc.numPages,
    research_question,
    methodology,
    datasets,
    conclusions,
    limitations,
    custom_dimensions,
  };
}

export function synthesizeLiteratureOffline(
  papers: PaperRow[],
  language: OutputLanguage
): string {
  const completed = papers.filter((p) => p.status === 'done' && p.extraction);
  if (completed.length === 0) return '';

  const years = completed
    .map((p) => Number(p.extraction?.year))
    .filter((y) => !Number.isNaN(y) && y > 1990);
  const yearRange =
    years.length > 0
      ? `${Math.min(...years)}–${Math.max(...years)}`
      : '近年';

  const allDatasets = Array.from(
    new Set(
      completed.flatMap((p) => p.extraction?.datasets.keywords || [])
    )
  ).slice(0, 8);

  const allMethods = Array.from(
    new Set(
      completed.flatMap((p) => p.extraction?.methodology.keywords || [])
    )
  ).slice(0, 8);

  if (language === 'en') {
    const lines = [
      `## Cross-Paper Literature Synthesis (${completed.length} Papers, ${yearRange})`,
      '',
      `> Generated locally by PaperMatrix Structural Engine (configure Spark/LLM API in Settings for deeper academic synthesis).`,
      '',
      `### 1. Research Landscape & Evolution`,
      `Across the ${completed.length} reviewed papers (${yearRange}), studies primarily address core bottlenecks summarized below:`,
      ...completed.map(
        (p, i) =>
          `- **[${i + 1}] ${p.extraction!.authors} (${p.extraction!.year})** *${p.extraction!.title}*: ${p.extraction!.research_question.summary} (P.${p.extraction!.research_question.citations[0]?.pdf_page ?? 1})`
      ),
      '',
      `### 2. Methodology & Benchmarks`,
      `- **Key Techniques**: ${allMethods.join(', ') || 'Various neural & algorithmic approaches'}`,
      `- **Common Benchmarks / Datasets**: ${allDatasets.join(', ') || 'Domain-specific evaluation suites'}`,
      '',
      `### 3. Shared Limitations & Research Gaps`,
      ...completed.map(
        (p) =>
          `- **${p.extraction!.authors} (${p.extraction!.year})**: ${p.extraction!.limitations.summary} (P.${p.extraction!.limitations.citations[0]?.pdf_page ?? 1})`
      ),
    ];
    return lines.join('\n');
  }

  const lines = [
    `## 文献横向对比综述草稿（共 ${completed.length} 篇 · 时间跨度 ${yearRange}）`,
    '',
    `> 注：当前由本地离线结构引擎自动聚合生成；在右上角配置「讯飞星火 / DeepSeek」API 后可获得更深度的学术润色综述。`,
    '',
    `### 一、核心研究问题与演进脉络`,
    `本次纳入分析的 ${completed.length} 篇文献主要围绕以下关键科学问题展开探索：`,
    ...completed.map((p, idx) => {
      const ext = p.extraction!;
      const page = ext.research_question.citations[0]?.pdf_page ?? 1;
      return `- **[${idx + 1}] ${ext.authors} (${ext.year}, ${ext.venue})**：针对《${ext.title}》，其核心研究问题为：${ext.research_question.summary}（溯源：P.${page}）`;
    }),
    '',
    `### 二、方法流派与数据集共识`,
    `- **高频核心方法 / 技术关键词**：${allMethods.length ? allMethods.join('、') : '多维特征建模与端到端优化'}`,
    `- **主流验证数据集与指标**：${allDatasets.length ? allDatasets.join('、') : '领域公开基准数据集'}`,
    ...completed.map((p) => {
      const ext = p.extraction!;
      const mPage = ext.methodology.citations[0]?.pdf_page ?? 1;
      const cPage = ext.conclusions.citations[0]?.pdf_page ?? 1;
      return `- **${ext.authors} (${ext.year})**：采用 ${ext.methodology.keywords.join('/')} 路线（P.${mPage}），主要结论显示：${ext.conclusions.summary}（P.${cPage}）`;
    }),
    '',
    `### 三、共性局限与未来研究空白 (Research Gaps)`,
    ...completed.map((p) => {
      const ext = p.extraction!;
      const lPage = ext.limitations.citations[0]?.pdf_page ?? 1;
      return `- **${ext.authors} (${ext.year})** [P.${lPage}]：${ext.limitations.summary}`;
    }),
  ];

  return lines.join('\n');
}
