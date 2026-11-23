const MODEL_IDS = [
  'gemini-4-hydrogen',
  'gemini-4-argon',
  'gemini-4-carbon',
  'gemini-3.5-flash-lite',
];

const MODEL_LABELS = [
  'Gemini 4 Hydrogen (推荐)',
  'Gemini 4 Argon (推理增强)',
  'Gemini 4 Carbon (旗舰)',
  'Gemini 3.5 Flash-Lite (极速)',
];

const LANG_IDS = ['zh', 'en'];
const LANG_LABELS = ['中文学术总结', 'English'];

const CONC_VALUES = [1, 2, 3, 4, 5];
const CONC_LABELS = ['1 篇并行', '2 篇并行', '3 篇并行 (推荐)', '4 篇并行', '5 篇并行'];

Page({
  data: {
    serverBaseUrl: '',
    apiKey: '',
    modelLabels: MODEL_LABELS,
    modelIndex: 0,
    langLabels: LANG_LABELS,
    langIndex: 0,
    concLabels: CONC_LABELS,
    concIndex: 2,
    customDimensions: [],
    newDimLabel: '',
  },

  onLoad() {
    const app = getApp();
    const s = app.globalData.settings;
    this.setData({
      serverBaseUrl: s.serverBaseUrl,
      apiKey: s.apiKey,
      modelIndex: Math.max(0, MODEL_IDS.indexOf(s.model)),
      langIndex: Math.max(0, LANG_IDS.indexOf(s.language)),
      concIndex: Math.max(0, CONC_VALUES.indexOf(s.concurrency || 3)),
      customDimensions: s.customDimensions || [],
    });
  },

  onInputServer(e) {
    this.setData({ serverBaseUrl: e.detail.value });
  },

  onInputKey(e) {
    this.setData({ apiKey: e.detail.value });
  },

  onModelChange(e) {
    getApp().haptic('light');
    this.setData({ modelIndex: Number(e.detail.value) });
  },

  onLangChange(e) {
    getApp().haptic('light');
    this.setData({ langIndex: Number(e.detail.value) });
  },

  onConcChange(e) {
    getApp().haptic('light');
    this.setData({ concIndex: Number(e.detail.value) });
  },

  onDimInput(e) {
    this.setData({ newDimLabel: e.detail.value });
  },

  addCustomDim() {
    const label = (this.data.newDimLabel || '').trim();
    if (!label) return;
    getApp().haptic('light');
    const next = [
      ...this.data.customDimensions,
      {
        key: `custom_${Date.now()}`,
        label,
        description: `提取论文中的「${label}」相关信息并附带页码溯源`,
        isCore: false,
      },
    ];
    this.setData({ customDimensions: next, newDimLabel: '' });
  },

  removeCustomDim(e) {
    const key = e.currentTarget.dataset.key;
    getApp().haptic('light');
    this.setData({
      customDimensions: this.data.customDimensions.filter((c) => c.key !== key),
    });
  },

  onSave() {
    const app = getApp();
    app.haptic('medium');
    app.saveSettings({
      serverBaseUrl: this.data.serverBaseUrl,
      apiKey: this.data.apiKey,
      model: MODEL_IDS[this.data.modelIndex],
      language: LANG_IDS[this.data.langIndex],
      concurrency: CONC_VALUES[this.data.concIndex],
      customDimensions: this.data.customDimensions,
    });
    wx.showToast({ title: '已保存配置', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 450);
  },
});
