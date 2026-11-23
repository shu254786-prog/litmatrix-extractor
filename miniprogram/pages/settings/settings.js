const api = require('../../utils/api');

const MODEL_IDS = [
  'gemini-4-hydrogen',
  'gemini-4-argon',
  'gemini-4-carbon',
  'gemini-3.5-flash-lite',
];

const MODEL_LABELS = [
  'Gemini 4 Hydrogen (推荐默认)',
  'Gemini 4 Argon (深度推理)',
  'Gemini 4 Carbon (旗舰高精度)',
  'Gemini 3.5 Flash-Lite (极速批量)',
];

const LANG_IDS = ['zh', 'en'];
const LANG_LABELS = ['中文学术总结', 'English'];

Page({
  data: {
    serverBaseUrl: '',
    apiKey: '',
    modelLabels: MODEL_LABELS,
    modelIndex: 0,
    langLabels: LANG_LABELS,
    langIndex: 0,
  },

  onLoad() {
    const app = getApp();
    const s = app.globalData.settings;
    const modelIndex = Math.max(0, MODEL_IDS.indexOf(s.model));
    const langIndex = Math.max(0, LANG_IDS.indexOf(s.language));
    this.setData({
      serverBaseUrl: s.serverBaseUrl,
      apiKey: s.apiKey,
      modelIndex,
      langIndex,
    });
  },

  onInputServer(e) {
    this.setData({ serverBaseUrl: e.detail.value });
  },

  onInputKey(e) {
    this.setData({ apiKey: e.detail.value });
  },

  onModelChange(e) {
    this.setData({ modelIndex: Number(e.detail.value) });
  },

  onLangChange(e) {
    this.setData({ langIndex: Number(e.detail.value) });
  },

  async onTestHealth() {
    const app = getApp();
    app.saveSettings({
      serverBaseUrl: this.data.serverBaseUrl,
      apiKey: this.data.apiKey,
    });
    wx.showLoading({ title: '测试连接中...' });
    try {
      const res = await api.checkHealth();
      wx.hideLoading();
      wx.showModal({
        title: '连接成功',
        content: `后端在线！\n服务端预设 Key: ${res.hasServerApiKey ? '已配置' : '未配置'}\n内容安全校验: ${
          res.wechatSafetyEnabled ? '已启用' : '未配置'
        }`,
        showCancel: false,
      });
    } catch (err) {
      wx.hideLoading();
      wx.showModal({
        title: '连接失败',
        content: err.message || '请确认服务已启动且域名/端口正确',
        showCancel: false,
      });
    }
  },

  onSave() {
    const app = getApp();
    app.saveSettings({
      serverBaseUrl: this.data.serverBaseUrl,
      apiKey: this.data.apiKey,
      model: MODEL_IDS[this.data.modelIndex],
      language: LANG_IDS[this.data.langIndex],
    });
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 400);
  },
});
