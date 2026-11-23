const api = require('../../utils/api');

Page({
  data: {
    user: null,
    settings: {},
    serverOnline: false,
    jobId: '',
    papers: [],
    completedPapers: [],
    doneCount: 0,
    errorCount: 0,
    progressPct: 0,
    uploading: false,
    loadingDemo: false,
    isPolling: false,
    viewMode: 'cards',
    showSynthesis: false,
    synthesisText: '',
  },

  pollTimer: null,

  onShow() {
    const app = getApp();
    this.setData({
      settings: app.globalData.settings,
      user: (app.globalData.auth && app.globalData.auth.user) || null,
    });
    if (app.globalData.currentJob) {
      this.applyJobState(app.globalData.currentJob);
    }
    this.checkServer();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  async onPullDownRefresh() {
    getApp().haptic('light');
    await this.checkServer();
    if (this.data.jobId) {
      try {
        const res = await api.getJob(this.data.jobId);
        if (res.job) this.applyJobState(res.job);
      } catch (e) {
        // ignore
      }
    }
    wx.stopPullDownRefresh();
  },

  onShareAppMessage() {
    const count = this.data.doneCount;
    return {
      title: count > 0
        ? `我用 LitMatrix 整理了 ${count} 篇论文的五维综述矩阵（附页码溯源）`
        : 'LitMatrix · 批量拖入 PDF 一键抽取文献综述对比矩阵',
      path: '/pages/index/index',
    };
  },

  onShareTimeline() {
    return {
      title: 'LitMatrix · 文献综述矩阵提取器 (Gemini AI Studio)',
    };
  },

  async checkServer() {
    try {
      await api.checkHealth();
      this.setData({ serverOnline: true });
    } catch (e) {
      this.setData({ serverOnline: false });
    }
  },

  onTapUserPill() {
    getApp().haptic('light');
    if (this.data.user) {
      wx.switchTab({ url: '/pages/profile/profile' });
    } else {
      wx.navigateTo({ url: '/pages/login/login' });
    }
  },

  setViewMode(e) {
    getApp().haptic('light');
    this.setData({ viewMode: e.currentTarget.dataset.mode });
  },

  applyJobState(job) {
    const app = getApp();
    app.globalData.currentJob = job;

    const papers = job.papers || [];
    const completedPapers = papers.filter((p) => p.status === 'done' && p.extraction);
    const doneCount = completedPapers.length;
    const errorCount = papers.filter((p) => p.status === 'error').length;
    const progressPct = papers.length ? Math.round((doneCount / papers.length) * 100) : 0;

    const prevDone = this.data.doneCount;
    this.setData({
      jobId: job.id,
      papers,
      completedPapers,
      doneCount,
      errorCount,
      progressPct,
    });

    if (job.status === 'running') {
      this.startPolling();
    } else {
      if (this.data.isPolling && doneCount > prevDone) {
        app.haptic('medium');
      }
      this.stopPolling();
    }
  },

  startPolling() {
    if (this.pollTimer) return;
    this.setData({ isPolling: true });
    this.pollTimer = setInterval(async () => {
      if (!this.data.jobId) return;
      try {
        const res = await api.getJob(this.data.jobId);
        if (res.job) this.applyJobState(res.job);
      } catch (e) {
        // keep polling
      }
    }, 2000);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.data.isPolling) {
      this.setData({ isPolling: false });
    }
  },

  onChoosePdfs() {
    const app = getApp();
    app.haptic('light');
    wx.chooseMessageFile({
      count: 20,
      type: 'file',
      extension: ['pdf'],
      success: async (res) => {
        const files = (res.tempFiles || []).filter((f) =>
          (f.name || f.path || '').toLowerCase().endsWith('.pdf')
        );
        if (files.length === 0) {
          wx.showToast({ title: '请选择 PDF 文件', icon: 'none' });
          return;
        }

        this.setData({ uploading: true });
        wx.showLoading({ title: `上传中 (0/${files.length})` });

        try {
          let jobId = this.data.jobId;
          if (!jobId || jobId.startsWith('demo_')) {
            const created = await api.createJob(
              app.globalData.settings,
              `文献矩阵 (${files.length}篇)`
            );
            jobId = created.job.id;
            this.applyJobState(created.job);
          }

          for (let i = 0; i < files.length; i += 1) {
            const f = files[i];
            wx.showLoading({ title: `上传中 (${i + 1}/${files.length})` });
            const up = await api.uploadPdfToJob(jobId, f.path, f.name || `paper_${i + 1}.pdf`);
            if (up.job) this.applyJobState(up.job);
          }

          const started = await api.startJob(jobId, false);
          if (started.job) this.applyJobState(started.job);
          wx.hideLoading();
          app.haptic('medium');
          wx.showToast({ title: '已开始云端并发提取', icon: 'success' });
        } catch (err) {
          wx.hideLoading();
          wx.showModal({
            title: '上传或启动失败',
            content: err.message || '请前往「我的」检查后端服务与 API Key',
            showCancel: false,
          });
        } finally {
          this.setData({ uploading: false });
        }
      },
    });
  },

  async onLoadDemo() {
    getApp().haptic('light');
    this.setData({ loadingDemo: true });
    try {
      const res = await api.createDemoJob();
      this.applyJobState(res.job);
      getApp().haptic('medium');
    } catch (err) {
      wx.showModal({
        title: '无法连接后端',
        content: err.message || '请确认服务已在 localhost:3001 启动',
        showCancel: false,
      });
    } finally {
      this.setData({ loadingDemo: false });
    }
  },

  async onRetryFailed() {
    if (!this.data.jobId) return;
    getApp().haptic('light');
    try {
      const res = await api.startJob(this.data.jobId, true);
      if (res.job) this.applyJobState(res.job);
    } catch (err) {
      wx.showToast({ title: err.message || '重试失败', icon: 'none' });
    }
  },

  onClearJob() {
    getApp().haptic('light');
    this.stopPolling();
    getApp().globalData.currentJob = null;
    this.setData({
      jobId: '',
      papers: [],
      completedPapers: [],
      doneCount: 0,
      errorCount: 0,
      progressPct: 0,
    });
  },

  onOpenPaper(e) {
    getApp().haptic('light');
    const paperId = e.currentTarget.dataset.id;
    const paper = this.data.papers.find((p) => p.id === paperId);
    if (!paper) return;
    if (paper.status === 'error') {
      wx.showModal({ title: '提取失败', content: paper.error || '未知错误', showCancel: false });
      return;
    }
    if (paper.status !== 'done') {
      wx.showToast({ title: '正在解析该论文，请稍候', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/detail/detail?id=${paperId}` });
  },

  async onExportExcel() {
    if (!this.data.jobId) return;
    getApp().haptic('light');
    wx.showLoading({ title: '生成 Excel 中...' });
    try {
      const tempFilePath = await api.downloadExcel(this.data.jobId);
      wx.hideLoading();
      wx.openDocument({
        filePath: tempFilePath,
        fileType: 'xlsx',
        showMenu: true,
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '导出失败', icon: 'none' });
    }
  },

  async onCopyMarkdown() {
    if (!this.data.jobId) return;
    getApp().haptic('light');
    wx.showLoading({ title: '生成 Markdown...' });
    try {
      const res = await api.getMarkdown(this.data.jobId);
      wx.hideLoading();
      wx.setClipboardData({
        data: res.markdown || '',
        success() {
          getApp().haptic('medium');
          wx.showToast({ title: '已复制 Markdown', icon: 'success' });
        },
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '导出失败', icon: 'none' });
    }
  },

  async onSynthesize() {
    if (!this.data.jobId) return;
    getApp().haptic('light');
    wx.showLoading({ title: 'AI 撰写综述中...' });
    try {
      const res = await api.synthesizeJob(this.data.jobId);
      wx.hideLoading();
      getApp().haptic('medium');
      this.setData({
        showSynthesis: true,
        synthesisText: res.synthesis || '未返回内容',
      });
    } catch (err) {
      wx.hideLoading();
      wx.showModal({
        title: '生成失败',
        content: err.message || '请确认已配置 AI Studio API Key',
        showCancel: false,
      });
    }
  },

  copySynthesis() {
    getApp().haptic('medium');
    wx.setClipboardData({
      data: this.data.synthesisText,
      success() {
        wx.showToast({ title: '已复制综述草稿', icon: 'success' });
      },
    });
  },

  closeSynthesis() {
    getApp().haptic('light');
    this.setData({ showSynthesis: false });
  },

  noop() {},
});
