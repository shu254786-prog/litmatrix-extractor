import type { PaperRow } from '../types/matrix';

export const DEMO_PAPERS: PaperRow[] = [
  {
    id: 'demo-1',
    fileName: 'Vaswani_2017_Attention_Is_All_You_Need.pdf',
    fileSize: 2215244,
    pageCount: 15,
    status: 'done',
    durationMs: 3820,
    modelUsed: 'gemini-4-hydrogen',
    isDemo: true,
    extraction: {
      title: 'Attention Is All You Need',
      authors: 'Vaswani et al.',
      year: '2017',
      venue: 'NeurIPS 2017',
      total_pages_detected: 15,
      research_question: {
        summary:
          '传统循环神经网络（RNN/LSTM）及卷积序列模型在序列建模中必须按时间步顺序计算，严重限制了训练并行度并削弱了长距离依赖捕获能力。本文探讨能否完全摒弃循环与卷积结构，仅依赖自注意力机制构建高效的序列转导模型。',
        keywords: ['序列建模', '并行训练', '长程依赖'],
        citations: [
          {
            pdf_page: 1,
            section: 'Abstract',
            quote:
              'We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.',
          },
          {
            pdf_page: 2,
            section: '1 Introduction',
            quote:
              'This inherently sequential nature precludes parallelization within training examples, which becomes critical at longer sequence lengths.',
          },
        ],
      },
      methodology: {
        summary:
          '提出 Encoder-Decoder 架构的 Transformer，核心采用 Scaled Dot-Product Attention 与 Multi-Head Attention 使模型同时关注不同表示子空间的位置信息，并结合正弦位置编码（Positional Encoding）和残差层归一化。',
        keywords: ['Transformer', 'Multi-Head Attention', 'Positional Encoding'],
        citations: [
          {
            pdf_page: 3,
            section: '3.1 Encoder and Decoder Stacks',
            quote:
              'The Transformer follows this overall architecture using stacked self-attention and point-wise, fully connected layers for both the encoder and decoder.',
          },
          {
            pdf_page: 4,
            section: '3.2.2 Multi-Head Attention',
            quote:
              'Multi-head attention allows the model to jointly attend to information from different representation subspaces at different positions.',
          },
        ],
      },
      datasets: {
        summary:
          '在 WMT 2014 英德（450 万句对）和英法（3600 万句对）机器翻译基准数据集上训练，并在 WSJ 英语选区句法分析任务上验证泛化能力，主要评估指标为 BLEU 与训练计算量（FLOPs）。',
        keywords: ['WMT 2014 EN-DE', 'WMT 2014 EN-FR', 'BLEU'],
        citations: [
          {
            pdf_page: 7,
            section: '5.1 Training Data and Batching',
            quote:
              'We trained on the standard WMT 2014 English-German dataset consisting of about 4.5 million sentence pairs.',
          },
          {
            pdf_page: 9,
            section: '6.3 English Constituency Parsing',
            quote:
              'To evaluate if the Transformer can generalize to other tasks we performed experiments on English constituency parsing.',
          },
        ],
      },
      conclusions: {
        summary:
          'Transformer (big) 在 WMT 2014 英德翻译上取得 28.4 BLEU（较此前最佳集成模型高 2.0 BLEU），英法翻译取得 41.8 BLEU，且仅需 8 块 P100 GPU 训练 3.5 天，训练成本显著低于所有主流 RNN/CNN 基线。',
        keywords: ['28.4 BLEU', '41.8 BLEU', '训练成本降低'],
        citations: [
          {
            pdf_page: 8,
            section: '6.1 Machine Translation',
            quote:
              'On the WMT 2014 English-to-German translation task, the big transformer model outperforms the best previously reported models including ensembles by more than 2.0 BLEU.',
          },
        ],
      },
      limitations: {
        summary:
          '自注意力机制的计算与显存复杂度随序列长度呈二次方增长 O(n²)，限制了超长文档、图像或音频等模态的高分辨率直接输入；作者提出未来可探索局部受限注意力（Local/Restricted Attention）降低计算开销。',
        keywords: ['O(n²) 复杂度', '长序列瓶颈', '受限注意力'],
        citations: [
          {
            pdf_page: 6,
            section: '4 Why Self-Attention',
            quote:
              'Restricting self-attention to considering only a neighborhood of size r in the input sequence would increase the maximum path length to O(n/r).',
          },
          {
            pdf_page: 10,
            section: '7 Conclusion',
            quote:
              'We plan to investigate local, restricted attention mechanisms to efficiently handle large inputs and outputs such as images, audio and video.',
          },
        ],
      },
    },
  },
  {
    id: 'demo-2',
    fileName: 'Lewis_2020_RAG_Retrieval_Augmented_Generation.pdf',
    fileSize: 884120,
    pageCount: 19,
    status: 'done',
    durationMs: 4150,
    modelUsed: 'gemini-4-hydrogen',
    isDemo: true,
    extraction: {
      title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
      authors: 'Lewis et al.',
      year: '2020',
      venue: 'NeurIPS 2020',
      total_pages_detected: 19,
      research_question: {
        summary:
          '大规模预训练语言模型将知识隐式存储在参数中，难以精确追溯来源、动态更新过时知识，且在知识密集型生成任务中容易产生事实幻觉。本文研究如何将参数化记忆与非参数化外部检索记忆进行端到端联合建模。',
        keywords: ['事实幻觉', '非参数记忆', '知识更新'],
        citations: [
          {
            pdf_page: 1,
            section: '1 Introduction',
            quote:
              'They cannot easily expand or revise their memory, cannot straightforwardly provide insight into their predictions, and may produce "hallucinations".',
          },
        ],
      },
      methodology: {
        summary:
          '提出 RAG-Sequence 与 RAG-Token 两种端到端架构：利用基于 BERT 的 DPR（Dense Passage Retriever）在 Wikipedia 向量索引上检索 Top-K 文档，再交由 BART-large 生成器边际化融合检索文档概率生成答案，联合微调检索器与生成器。',
        keywords: ['DPR 检索', 'BART 生成', '端到端边际化'],
        citations: [
          {
            pdf_page: 3,
            section: '2 Methods',
            quote:
              'We explore two models: RAG-Sequence uses the same retrieved document to predict each target token, whereas RAG-Token can predict each target token based on a different document.',
          },
        ],
      },
      datasets: {
        summary:
          '在 Natural Questions、TriviaQA、WebQuestions、CuratedTrec 等开放域问答数据集，以及 MS-MARCO、Jeopardy 问题生成、FEVER 事实验证任务上进行评测，索引语料采用 2018 年 Wikipedia 切分出的 2100 万条文本块。',
        keywords: ['Natural Questions', 'TriviaQA', 'FEVER'],
        citations: [
          {
            pdf_page: 4,
            section: '3 Experiments',
            quote:
              'For our non-parametric memory we use the 2018 Wikipedia dump, splitting each article into disjoint 100-word chunks to make a total of 21 million documents.',
          },
        ],
      },
      conclusions: {
        summary:
          'RAG 在多个开放域问答与 FEVER 事实验证上刷新 SOTA；相比纯参数化 seq2seq 模型（BART/T5），生成内容更具体、多样且事实准确率更高，并可通过直接替换外部向量索引实现零再训练的知识热更新。',
        keywords: ['SOTA 问答', '事实性提升', '热更新索引'],
        citations: [
          {
            pdf_page: 6,
            section: '4.1 Open-domain Question Answering',
            quote:
              'RAG sets a new state of the art on Natural Questions, WebQuestions, and CuratedTrec, outperforming both extractive and closed-book models.',
          },
        ],
      },
      limitations: {
        summary:
          '系统性能高度依赖外部文档库覆盖率与检索质量，检索失败时生成准确率下降；同时检索索引重建（MIPS）与 Top-K 文档编码带来额外推理延迟，且文章对多跳复杂推理及潜在语料偏见讨论较少。',
        keywords: ['检索质量依赖', '推理开销', '语料偏见'],
        citations: [
          {
            pdf_page: 9,
            section: '6 Broader Impact & Discussion',
            quote:
              'Wikipedia or any external knowledge source will probably never be entirely factual and completely devoid of bias.',
          },
        ],
      },
    },
  },
  {
    id: 'demo-3',
    fileName: 'Hu_2021_LoRA_Low_Rank_Adaptation.pdf',
    fileSize: 1620400,
    pageCount: 26,
    status: 'done',
    durationMs: 3640,
    modelUsed: 'gemini-4-hydrogen',
    isDemo: true,
    extraction: {
      title: 'LoRA: Low-Rank Adaptation of Large Language Models',
      authors: 'Hu et al.',
      year: '2022',
      venue: 'ICLR 2022',
      total_pages_detected: 26,
      research_question: {
        summary:
          '全量微调（Full Fine-Tuning）GPT-3 175B 等超大规模模型会为每个下游任务生成完整参数副本，存储与显存开销极高；而现有 Adapter 或 Prefix-Tuning 会引入推理延迟或挤占有效上下文长度。',
        keywords: ['参数高效微调', '全量微调瓶颈', '零推理延迟'],
        citations: [
          {
            pdf_page: 1,
            section: '1 Introduction',
            quote:
              'Deploying independent instances of fine-tuned models, each with 175B parameters, is prohibitively expensive.',
          },
        ],
      },
      methodology: {
        summary:
          '假设模型微调时的权重更新矩阵 ΔW 具有极低的内在秩（Intrinsic Rank），冻结预训练权重 W0，在 Transformer 注意力投影层旁路注入可训练的低秩分解矩阵 B·A（秩 r ≪ d），推理时可将 BA 直接合并回 W0，实现零额外推理延迟。',
        keywords: ['低秩分解', '旁路注入', '权重无损合并'],
        citations: [
          {
            pdf_page: 4,
            section: '4.1 Low-Rank-Parameterized Update Matrices',
            quote:
              'We constrain its update by representing the latter with a low-rank decomposition W0 + ΔW = W0 + BA, where B ∈ R^{d×r}, A ∈ R^{r×k}, and the rank r << min(d,k).',
          },
        ],
      },
      datasets: {
        summary:
          '在 RoBERTa-base/large、DeBERTa-XXL 的 GLUE 基准，GPT-2 M/L 的 E2E NLG Challenge、WebNLG、DART，以及 GPT-3 175B 的 WikiSQL、MNLI 和 SAMSum 摘要任务上开展系统性验证。',
        keywords: ['GLUE', 'E2E NLG', 'WikiSQL / SAMSum'],
        citations: [
          {
            pdf_page: 6,
            section: '5 Empirical Experiments',
            quote:
              'We evaluate the downstream task performance of LoRA on RoBERTa, DeBERTa, and GPT-2, before scaling up to GPT-3 175B.',
          },
        ],
      },
      conclusions: {
        summary:
          '在 GPT-3 175B 上，LoRA 将可训练参数量压缩至原来的 1/10000、显存占用减少 3 倍，但下游任务表现与全量微调持平甚至略优，且实验表明极小的秩（如 r=1 或 r=4）已足以捕获绝大部分任务适配信息。',
        keywords: ['参数压缩 10000x', '显存降 3x', 'r=4 足够'],
        citations: [
          {
            pdf_page: 2,
            section: '1 Introduction',
            quote:
              'LoRA can reduce the number of trainable parameters by 10,000 times and the GPU memory requirement by 3 times.',
          },
        ],
      },
      limitations: {
        summary:
          '若需在同一 Batch 中混合推理多个不同任务的 LoRA 模块，无法预先将权重合并进 W0 而会失去零延迟优势；此外对于与预训练语料分布差异极巨的领域，极低秩假设的适用边界仍需进一步研究。',
        keywords: ['多任务混批推理', '高差异领域边界', '超参选择'],
        citations: [
          {
            pdf_page: 5,
            section: '4.2 Applying LoRA to Transformer',
            quote:
              'One limitation is that it is not straightforward to batch inputs to different tasks with different A and B in a single forward pass without additional latency.',
          },
        ],
      },
    },
  },
  {
    id: 'demo-4',
    fileName: 'Rafailov_2023_Direct_Preference_Optimization.pdf',
    fileSize: 1398200,
    pageCount: 28,
    status: 'done',
    durationMs: 3910,
    modelUsed: 'gemini-4-hydrogen',
    isDemo: true,
    extraction: {
      title: 'Direct Preference Optimization: Your Language Model is Secretly a Reward Model',
      authors: 'Rafailov et al.',
      year: '2023',
      venue: 'NeurIPS 2023',
      total_pages_detected: 28,
      research_question: {
        summary:
          '传统基于人类反馈的强化学习（RLHF）需要先拟合奖励模型再通过 PPO 在线采样优化策略，流程复杂、训练极不稳定且超参数敏感、计算资源消耗巨大。本文探索能否绕过显式奖励建模与强化学习采样，直接从偏好对数据优化语言模型。',
        keywords: ['RLHF 替代', 'PPO 不稳定', '人类偏好对齐'],
        citations: [
          {
            pdf_page: 1,
            section: '1 Introduction',
            quote:
              'While large-scale unsupervised language models learn broad world knowledge, achieving precise control over their behavior is difficult due to the unsupervised nature of their training.',
          },
          {
            pdf_page: 2,
            section: '1 Introduction',
            quote:
              'RLHF is a complex and often unstable procedure, first fitting a reward model and then fine-tuning the large unsupervised LM using reinforcement learning.',
          },
        ],
      },
      methodology: {
        summary:
          '通过对 KL 约束奖励最大化目标进行解析推导，建立奖励函数与最优策略之间的闭式映射关系，将 Bradley-Terry 偏好模型转化为纯二元交叉熵分类损失（DPO Loss），从而无需奖励模型与在线 PPO 采样即可完成对齐训练。',
        keywords: ['闭式解析映射', 'DPO Loss', 'Bradley-Terry'],
        citations: [
          {
            pdf_page: 4,
            section: '4 Direct Preference Optimization',
            quote:
              'We derive a simple approach for optimizing policies directly under this objective without an explicit reward model or reinforcement learning loop.',
          },
        ],
      },
      datasets: {
        summary:
          '在 IMDb 情感控制生成、Anthropic HH-RLHF 单轮对话对齐以及 Reddit TL;DR 文本摘要数据集上进行实验，结合 GPT-4 自动胜率评估与人工评审对比 PPO、Best-of-N 等基线。',
        keywords: ['Anthropic HH-RLHF', 'Reddit TL;DR', 'GPT-4 Win Rate'],
        citations: [
          {
            pdf_page: 7,
            section: '6 Experiments',
            quote:
              'We evaluate DPO on three open-ended text generation tasks: controlled sentiment generation, summarization, and single-turn dialogue.',
          },
        ],
      },
      conclusions: {
        summary:
          'DPO 在 KL 散度-奖励权衡曲线上稳定优于 PPO，在 Reddit TL;DR 摘要任务上的 GPT-4 胜率超过 PPO 约 3–6 个百分点，且对采样温度更鲁棒，代码实现大幅简化。',
        keywords: ['胜率超越 PPO', 'KL-Reward 帕累托最优', '训练稳定性'],
        citations: [
          {
            pdf_page: 8,
            section: '6.2 Empirical Results',
            quote:
              'DPO achieves the highest win rates against the preferred completions while maintaining lower KL divergence than PPO.',
          },
        ],
      },
      limitations: {
        summary:
          '离策略（Off-policy）偏好数据的分布偏移可能影响泛化，且模型在多轮复杂推理或数学等需要在线探索的任务上与在线 RL 方法的差距尚未充分验证；未探索 DPO 如何扩展至迭代式在线偏好采集。',
        keywords: ['离策略分布偏移', '复杂推理泛化', '在线探索缺失'],
        citations: [
          {
            pdf_page: 10,
            section: '7 Discussion',
            quote:
              'How DPO performs on out-of-distribution prompts and whether iterative online data collection further improves DPO remains an exciting direction for future work.',
          },
        ],
      },
    },
  },
];
