const STORAGE_KEY = 'litmatrix_mp_settings_v1';

const DEFAULT_SETTINGS = {
  // 本地开发调试默认连接 localhost:3001；正式上线需替换为已备案 HTTPS 域名
  serverBaseUrl: 'http://localhost:3001',
  apiKey: '',
  model: 'gemini-4-hydrogen',
  language: 'zh',
  thinkingLevel: 'low',
  concurrency: 3,
};

App({
  globalData: {
    settings: { ...DEFAULT_SETTINGS },
    currentJob: null,
  },

  onLaunch() {
    try {
      const saved = wx.getStorageSync(STORAGE_KEY);
      if (saved && typeof saved === 'object') {
        this.globalData.settings = { ...DEFAULT_SETTINGS, ...saved };
      }
    } catch (e) {
      // ignore storage error
    }
  },

  saveSettings(nextSettings) {
    this.globalData.settings = { ...this.globalData.settings, ...nextSettings };
    try {
      wx.setStorageSync(STORAGE_KEY, this.globalData.settings);
    } catch (e) {
      // ignore
    }
  },
});
