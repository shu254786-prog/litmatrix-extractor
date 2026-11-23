function getBaseUrl() {
  const app = getApp();
  const raw = (app.globalData.settings.serverBaseUrl || 'http://localhost:3001').trim();
  return raw.replace(/\/+$/, '');
}

function getHeaders(extra = {}) {
  const app = getApp();
  const headers = { ...extra };
  const key = (app.globalData.settings.apiKey || '').trim();
  if (key) {
    headers['x-gemini-api-key'] = key;
  }
  return headers;
}

function request(path, method = 'GET', data = undefined) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getBaseUrl()}${path}`,
      method,
      data,
      header: getHeaders({ 'Content-Type': 'application/json' }),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          const msg = (res.data && res.data.error) || `请求失败 (${res.statusCode})`;
          reject(new Error(msg));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败，请检查后端域名配置'));
      },
    });
  });
}

function uploadPdfToJob(jobId, filePath, fileName) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${getBaseUrl()}/api/jobs/${jobId}/upload`,
      filePath,
      name: 'pdf',
      formData: {
        fileName,
        autoStart: 'false',
      },
      header: getHeaders(),
      success(res) {
        let parsed = {};
        try {
          parsed = JSON.parse(res.data || '{}');
        } catch (e) {
          // ignore
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
        } else {
          reject(new Error(parsed.error || `上传失败 (${res.statusCode})`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || 'PDF 上传失败'));
      },
    });
  });
}

function downloadExcel(jobId) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: `${getBaseUrl()}/api/jobs/${jobId}/export/xlsx`,
      header: getHeaders(),
      success(res) {
        if (res.statusCode === 200 && res.tempFilePath) {
          resolve(res.tempFilePath);
        } else {
          reject(new Error(`下载 Excel 失败 (${res.statusCode})`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '下载 Excel 失败'));
      },
    });
  });
}

module.exports = {
  checkHealth: () => request('/api/health', 'GET'),
  createJob: (settings) =>
    request('/api/jobs', 'POST', {
      model: settings.model,
      language: settings.language,
      thinkingLevel: settings.thinkingLevel,
      concurrency: settings.concurrency,
    }),
  createDemoJob: () => request('/api/jobs/demo', 'POST'),
  uploadPdfToJob,
  startJob: (jobId, retry = false) =>
    request(`/api/jobs/${jobId}/start`, 'POST', { retry }),
  getJob: (jobId) => request(`/api/jobs/${jobId}`, 'GET'),
  getMarkdown: (jobId) => request(`/api/jobs/${jobId}/export/markdown`, 'GET'),
  synthesizeJob: (jobId) => request(`/api/jobs/${jobId}/synthesize`, 'POST'),
  downloadExcel,
};
