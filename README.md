# LitMatrix · 文献综述矩阵提取器 (Gemini AI Studio)

面向科研人员的批量论文 PDF 对比矩阵提取工具。一次拖入 20+ 篇学术论文 PDF，借助 Google AI Studio (`@google/genai` Interactions API) 自动按 **「研究问题 / 方法 / 数据集 / 结论 / 局限性」** 抽取结构化对比表，支持 **1-indexed 物理页码溯源**、原文摘录高亮预览，以及一键导出 **Excel (`.xlsx`)** 和 **Markdown (`.md`)**。

## 核心特性

- **批量 PDF 并发队列**：支持一次拖入 20+ 篇 PDF（单篇上限 50MB），本地通过 `pdfjs-dist` 即时识别物理页数，支持 1–5 路并发提取与失败重试。
- **结构化五维矩阵 + 自定义列**：严格基于 JSON Schema 输出 `研究问题`、`方法`、`数据集`、`结论`、`局限性` 及论文元数据（标题、作者、年份、会议/期刊），支持追加自定义提取列及表格内联编辑。
- **精确页码溯源 (`P.页码`)**：每条提取结论附带 `pdf_page`（1-indexed PDF 物理页码）、`section`（章节标题）和 `quote`（原文逐字摘录）。点击页码角标可在右侧抽屉直接渲染对应 PDF 页面并高亮匹配词段。
- **双格式专业导出**：
  - **Excel (`.xlsx`)**：包含双工作表（`文献综述对比矩阵` + `页码溯源与原文摘录`核查明细）。
  - **Markdown (`.md`)**：标准 GFM 对比表格 + 可选页码溯源附录，支持一键复制与下载。
- **AI 横向对比综述**：基于已提取的多篇文献矩阵，一键生成 Related Work 横向对比综述草稿。
- **内置示例数据**：点击「加载示例矩阵」即可在无 API Key 时体验完整表格、页码溯源和导出流程。

## 技术栈

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, `pdfjs-dist`, `exceljs`, `lucide-react`
- **Backend**: Node.js, Express 5, Multer, `@google/genai` (v3.6+, `gemini-4-hydrogen` 默认模型)

## 本地运行

```bash
# 1. 安装依赖
npm install

# 2. （可选）配置服务端 API Key，也可启动后直接在网页右上角填入
cp .env.example .env

# 3a. 开发模式（前端 5173 + 后端 3001）
npm run dev

# 3b. 生产模式单端口运行（http://localhost:3001）
npm run build
npm start
```

## 安全说明

- 网页端输入的 Google AI Studio API Key 仅保存在用户本地浏览器 `localStorage`，通过请求头发送至本地后端转发给 Gemini API；请勿将包含真实 `GEMINI_API_KEY` 的 `.env` 文件提交到仓库。
