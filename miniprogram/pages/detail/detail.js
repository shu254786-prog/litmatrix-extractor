const api = require('../../utils/api');

const CORE_LABELS = [
  { key: 'research_question', label: '研究问题' },
  { key: 'methodology', label: '方法' },
  { key: 'datasets', label: '数据集' },
  { key: 'conclusions', label: '结论' },
  { key: 'limitations', label: '局限性' },
];

Page({
  data: {
    jobId: '',
    paper: null,
    sections: [],
    editing: null,
  },

  onLoad(options) {
    this.paperId = options.id || '';
    this.loadPaper();
  },

  loadPaper() {
    const app = getApp();
    const job = app.globalData.currentJob;
    if (!job || !this.paperId) return;

    const paper = (job.papers || []).find((p) => p.id === this.paperId);
    if (!paper || !paper.extraction) return;

    const sections = CORE_LABELS.map((item) => ({
      key: item.key,
      label: item.label,
      data: paper.extraction[item.key] || { summary: '—', keywords: [], citations: [] },
    }));

    if (Array.isArray(paper.extraction.custom_dimensions)) {
      for (const cd of paper.extraction.custom_dimensions) {
        sections.push({
          key: cd.key,
          label: cd.label,
          data: { summary: cd.summary, keywords: cd.keywords, citations: cd.citations },
        });
      }
    }

    this.setData({ jobId: job.id, paper, sections });
  },

  onCopyQuote(e) {
    const { quote, page } = e.currentTarget.dataset;
    getApp().haptic('light');
    wx.setClipboardData({
      data: `[PDF P.${page}] "${quote}"`,
      success() {
        getApp().haptic('medium');
        wx.showToast({ title: `已复制 P.${page} 摘录`, icon: 'success' });
      },
    });
  },

  openEditor(e) {
    const { key, label, summary } = e.currentTarget.dataset;
    getApp().haptic('light');
    this.setData({
      editing: { key, label, value: summary || '' },
    });
  },

  onEditInput(e) {
    this.setData({ 'editing.value': e.detail.value });
  },

  closeEditor() {
    getApp().haptic('light');
    this.setData({ editing: null });
  },

  async saveEdit() {
    const { editing, jobId } = this.data;
    if (!editing || !jobId) return;
    getApp().haptic('medium');
    wx.showLoading({ title: '保存中...' });
    try {
      const res = await api.updatePaperSummary(
        jobId,
        this.paperId,
        editing.key,
        editing.value
      );
      if (res.job) {
        getApp().globalData.currentJob = res.job;
      }
      wx.hideLoading();
      this.setData({ editing: null });
      this.loadPaper();
      wx.showToast({ title: '已保存修改', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }
  },

  noop() {},
});
