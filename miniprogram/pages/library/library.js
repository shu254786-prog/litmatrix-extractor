const api = require('../../utils/api');

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    jobs: [],
    filteredJobs: [],
    query: '',
    loading: false,
  },

  onShow() {
    this.fetchJobs();
  },

  async onPullDownRefresh() {
    getApp().haptic('light');
    await this.fetchJobs();
    wx.stopPullDownRefresh();
  },

  async fetchJobs() {
    this.setData({ loading: true });
    try {
      const res = await api.listJobs();
      const jobs = (res.jobs || []).map((j) => ({
        ...j,
        timeLabel: formatTime(j.updatedAt || j.createdAt),
      }));
      this.setData({ jobs });
      this.applyFilter(this.data.query, jobs);
    } catch (e) {
      this.setData({ jobs: [], filteredJobs: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  onSearch(e) {
    const q = e.detail.value || '';
    this.setData({ query: q });
    this.applyFilter(q, this.data.jobs);
  },

  clearSearch() {
    this.setData({ query: '' });
    this.applyFilter('', this.data.jobs);
  },

  applyFilter(query, jobs) {
    const q = (query || '').trim().toLowerCase();
    if (!q) {
      this.setData({ filteredJobs: jobs });
      return;
    }
    const filtered = jobs.filter((j) => {
      const text = [
        j.title || '',
        j.model || '',
        ...(j.papers || []).map((p) => `${p.fileName} ${(p.extraction && p.extraction.title) || ''} ${(p.extraction && p.extraction.authors) || ''}`),
      ]
        .join(' ')
        .toLowerCase();
      return text.includes(q);
    });
    this.setData({ filteredJobs: filtered });
  },

  onOpenJob(e) {
    const id = e.currentTarget.dataset.id;
    const job = this.data.jobs.find((j) => j.id === id);
    if (!job) return;
    const app = getApp();
    app.haptic('light');
    app.globalData.currentJob = job;
    wx.switchTab({ url: '/pages/index/index' });
  },

  onDeleteJob(e) {
    const id = e.currentTarget.dataset.id;
    getApp().haptic('light');
    wx.showModal({
      title: '删除矩阵记录',
      content: '确定删除该批次的文献提取记录吗？',
      confirmColor: '#FF3B30',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.deleteJob(id);
          const app = getApp();
          if (app.globalData.currentJob && app.globalData.currentJob.id === id) {
            app.globalData.currentJob = null;
          }
          getApp().haptic('medium');
          this.fetchJobs();
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },
});
