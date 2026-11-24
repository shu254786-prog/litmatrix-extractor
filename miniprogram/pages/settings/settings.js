const PROVIDER_CONFIG = [
  {
    id: 'gemini',
    label: 'Google AI Studio (Gemini)',
    models: [
      { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (推荐)' },
      { id: 'gemini-4-argon', label: 'Gemini 4 Argon (推理增强)' },
      { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon (旗舰)' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (极速)' },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek (国内直连)',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek-V3 (deepseek-chat)' },
      { id: 'deepseek-reasoner', label: 'DeepSeek-R1 (deepseek-reasoner)' },
    ],
  },
  {
    id: 'qwen',
    label: '通义千问 Qwen (阿里云百炼)',
    models: [
      { id: 'qwen-long', label: 'Qwen-Long (推荐长论文)' },
      { id: 'qwen-plus', label: 'Qwen-Plus' },
      { id: 'qwen-max', label: 'Qwen-Max' },
    ],
  },
  {
    id: 'custom',
    label: '自定义 OpenAI 兼容接口',
    models: [],
  },
];

const LANG_IDS = ['zh', 'en'];
const LANG_LABELS = ['中文学术总结', 'English'];

const CONC_VALUES = [1, 2, 3, 4, 5];
const CONC_LABELS = ['1 篇并行', '2 篇并行', '3 篇并行 (推荐)', '4 篇并行', '5 篇并行'];

Page({
  data: {
    serverBaseUrl: '',
    apiKey: '',
    providerLabels: PROVIDER_CONFIG.map((p) => p.label),
    providerIndex: 0,
    providerId: 'gemini',
    modelIds: [],
    modelLabels: [],
    modelIndex: 0,
    customBaseUrl: '',
    customModel: 'gpt-4o-mini',
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
    const providerIndex = Math.max(
      0,
      PROVIDER_CONFIG.findIndex((p) => p.id === (s.provider || 'gemini'))
    );
    const prov = PROVIDER_CONFIG[providerIndex];
    const modelIds = prov.models.map((m) => m.id);
    const modelLabels = prov.models.map((m) => m.label);
    const modelIndex = Math.max(0, modelIds.indexOf(s.model));

    this.setData({
      serverBaseUrl: s.serverBaseUrl,
      apiKey: s.apiKey,
      providerIndex,
      providerId: prov.id,
      modelIds,
      modelLabels,
      modelIndex,
      customBaseUrl: s.customBaseUrl || '',
      customModel: prov.id === 'custom' ? s.model : 'gpt-4o-mini',
      langIndex: Math.max(0, LANG_IDS.indexOf(s.language)),
      concIndex: Math.max(0, CONC_VALUES.indexOf(s.concurrency || 3)),
      customDimensions: s.customDimensions || [],
    });
  },

  onProviderChange(e) {
    getApp().haptic('light');
    const providerIndex = Number(e.detail.value);
    const prov = PROVIDER_CONFIG[providerIndex] || PROVIDER_CONFIG[0];
    this.setData({
      providerIndex,
      providerId: prov.id,
      modelIds: prov.models.map((m) => m.id),
      modelLabels: prov.models.map((m) => m.label),
      modelIndex: 0,
    });
  },

  onInputServer(e) {
    this.setData({ serverBaseUrl: e.detail.value });
  },

  onInputKey(e) {
    this.setData({ apiKey: e.detail.value });
  },

  onCustomBaseInput(e) {
    this.setData({ customBaseUrl: e.detail.value });
  },

  onCustomModelInput(e) {
    this.setData({ customModel: e.detail.value });
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
    const model =
      this.data.providerId === 'custom'
        ? this.data.customModel.trim() || 'gpt-4o-mini'
        : this.data.modelIds[this.data.modelIndex] || 'gemini-4-hydrogen';

    app.saveSettings({
      serverBaseUrl: this.data.serverBaseUrl,
      provider: this.data.providerId,
      apiKey: this.data.apiKey,
      customBaseUrl: this.data.customBaseUrl,
      model,
      language: LANG_IDS[this.data.langIndex],
      concurrency: CONC_VALUES[this.data.concIndex],
      customDimensions: this.data.customDimensions,
    });
    wx.showToast({ title: '已保存配置', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 450);
  },
});
