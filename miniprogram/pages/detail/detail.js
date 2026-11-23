const LABELS = [
  { key: 'research_question', label: '研究问题' },
  { key: 'methodology', label: '方法' },
  { key: 'datasets', label: '数据集' },
  { key: 'conclusions', label: '结论' },
  { key: 'limitations', label: '局限性' },
];

Page({
  data: {
    paper: null,
    sections: [],
  },

  onLoad(options) {
    const app = getApp();
    const job = app.globalData.currentJob;
    if (!job || !options.id) return;

    const paper = (job.papers || []).find((p) => p.id === options.id);
    if (!paper || !paper.extraction) return;

    const sections = LABELS.map((item) => ({
      key: item.key,
      label: item.label,
      data: paper.extraction[item.key] || { summary: '—', keywords: [], citations: [] },
    }));

    this.setData({ paper, sections });
  },

  onCopyQuote(e) {
    const { quote, page } = e.currentTarget.dataset;
    wx.setClipboardData({
      data: `[PDF P.${page}] "${quote}"`,
      success() {
        wx.showToast({ title: `已复制 P.${page} 摘录`, icon: 'success' });
      },
    });
  },
});
