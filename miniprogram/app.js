const SETTINGS_KEY = 'litmatrix_mp_settings_v3';
const AUTH_KEY = 'litmatrix_mp_auth_v2';

const DEFAULT_SETTINGS = {
  serverBaseUrl: 'http://localhost:3001',
  provider: 'gemini',
  apiKey: '',
  customBaseUrl: '',
  model: 'gemini-4-hydrogen',
  language: 'zh',
  thinkingLevel: 'low',
  concurrency: 3,
  customDimensions: [],
};

function computeNavMetrics() {
  try {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect();
    const statusBarHeight = win.statusBarHeight || 20;
    const navBarHeight = (menu.top - statusBarHeight) * 2 + menu.height;
    return {
      statusBarHeight,
      navBarHeight: Math.max(40, navBarHeight || 44),
      totalNavHeight: statusBarHeight + Math.max(40, navBarHeight || 44),
      capsuleRightPad: (win.windowWidth || 375) - menu.left + 12,
    };
  } catch (e) {
    return {
      statusBarHeight: 44,
      navBarHeight: 44,
      totalNavHeight: 88,
      capsuleRightPad: 100,
    };
  }
}

App({
  globalData: {
    settings: { ...DEFAULT_SETTINGS },
    auth: {
      token: '',
      user: null,
    },
    currentJob: null,
    navMetrics: computeNavMetrics(),
  },

  onLaunch() {
    try {
      const savedSettings = wx.getStorageSync(SETTINGS_KEY);
      if (savedSettings && typeof savedSettings === 'object') {
        this.globalData.settings = { ...DEFAULT_SETTINGS, ...savedSettings };
      }
      const savedAuth = wx.getStorageSync(AUTH_KEY);
      if (savedAuth && typeof savedAuth === 'object' && savedAuth.token) {
        this.globalData.auth = savedAuth;
      }
    } catch (e) {
      // ignore storage errors
    }
  },

  saveSettings(next) {
    this.globalData.settings = { ...this.globalData.settings, ...next };
    try {
      wx.setStorageSync(SETTINGS_KEY, this.globalData.settings);
    } catch (e) {
      // ignore
    }
  },

  setAuth(auth) {
    this.globalData.auth = auth || { token: '', user: null };
    try {
      wx.setStorageSync(AUTH_KEY, this.globalData.auth);
    } catch (e) {
      // ignore
    }
  },

  logout() {
    this.setAuth({ token: '', user: null });
  },

  haptic(type = 'light') {
    try {
      wx.vibrateShort({ type });
    } catch (e) {
      // ignore on unsupported devices
    }
  },
});
