# 微信小程序上线指南（LitMatrix 文献综述矩阵提取器）

本仓库已包含原生微信小程序前端工程 [`miniprogram/`](./miniprogram) 以及支持异步批量队列与服务端 Excel/Markdown 导出的后端接口 [`server/`](./server)。

---

## 一、本地微信开发者工具联调（5 分钟跑通）

1. 确保本地后端已启动：
   ```bash
   npm start
   ```
   服务默认监听 `http://localhost:3001`。
2. 打开 **微信开发者工具** -> **导入项目**：
   - **目录**：选择本仓库下的 `miniprogram` 文件夹
   - **AppID**：填入您的微信小程序 AppID（仅本地体验也可先选「测试号」）
3. 在开发者工具右上角 **「详情」->「本地设置」** 中勾选 **「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」**。
4. 点击小程序页面上的 **「✨ 加载示例矩阵」** 或 **「📄 从微信聊天选 PDF」**，即可直接联调：
   - 批量上传 PDF 到 `/api/jobs/:jobId/upload`
   - 后台并发解析 + 每 2 秒轮询 `/api/jobs/:jobId`
   - 点击 **「📊 导出 Excel」** 直接调用 `wx.openDocument` 在微信中打开 `.xlsx` 并转发到文件传输助手
   - 点击 **「📝 复制 MD」** 一键复制完整 Markdown 矩阵与页码溯源附录

---

## 二、部署公网 HTTPS 后端（上线必需）

微信小程序真机环境强制要求接口走 **HTTPS + 已备案域名**，且服务器需能访问 `generativelanguage.googleapis.com`：

1. 使用根目录提供的 [`Dockerfile`](./Dockerfile) 构建并部署到您的云服务器 / 容器平台（如境外节点配合国内备案域名反代，或具备合法访问能力的容器服务）：
   ```bash
   docker build -t litmatrix-server .
   docker run -d -p 3001:3001 \
     -e GEMINI_API_KEY=你的AI_Studio_Key \
     -e WECHAT_APPID=你的小程序AppID \
     -e WECHAT_APPSECRET=你的小程序Secret \
     litmatrix-server
   ```
2. 使用 Nginx / Caddy 为该服务配置 **HTTPS 证书（TLS 1.2+）** 与已备案域名（例如 `https://api.example.com`）。
   - 注意把 Nginx 的 `client_max_body_size` 调大至 `60M`，以支持单篇 50MB 以内的 PDF 上传。
3. 在小程序 `miniprogram/app.js` 中把 `serverBaseUrl` 默认值改为您的正式域名 `https://api.example.com`。

---

## 三、微信公众平台配置与发布上线

1. **配置服务器域名**
   登录 [微信公众平台](https://mp.weixin.qq.com/) -> **开发管理 -> 开发设置 -> 服务器域名**，将 `https://api.example.com` 同时添加到：
   - `request 合法域名`
   - `uploadFile 合法域名`
   - `downloadFile 合法域名`
2. **上传代码并发布「体验版」（适合自己与课题组使用）**
   - 在微信开发者工具点击 **「上传」**，在微信公众平台后台将该版本设为 **「体验版」**，添加课题组成员微信号即可扫码使用，**无需经过全网公开发布审核**。
3. **正式提审上架（面向大众用户）注意事项**
   - **主体与类目**：AI 文献生成/文档解析类工具通常需**企业/个体工商户主体**与相应服务类目，个人主体大概率会被驳回。
   - **生成式 AI 合规与内容安全**：服务端已预留 `WECHAT_APPID` / `WECHAT_APPSECRET` 自动调用微信 `msg_sec_check` 内容安全接口；正式面向大众上线还需按微信要求准备大模型/算法合规备案资质。
   - **隐私协议**：提交审核前需在公众平台「用户隐私保护指引」中声明收集用户主动上传的文档文件仅用于本次文献提取。
