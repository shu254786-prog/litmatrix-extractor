const api = require('../../utils/api');

Page({
  data: {
    user: null,
    settings: {},
    serverOnline: false,
  },

  onShow() {
    const app = getApp();
    this.setData({
      user: (app.globalData.auth && app.globalData.auth.user) || null,
      settings: app.globalData.settings,
    });
    this.checkServer();
  },

  onShareAppMessage() {
    return {
      title: 'LitMatrix · 批量解析 20+ 篇 PDF 的文献综述矩阵提取器',
      path: '/pages/index/index',
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

  onTapProfile() {
    getApp().haptic('light');
    wx.navigateTo({ url: '/pages/login/login' });
  },

  goSettings() {
    getApp().haptic('light');
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  goPrivacy() {
    getApp().haptic('light');
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  async onTestHealth() {
    getApp().haptic('light');
    wx.showLoading({ title: '检测中...' });
    try {
      const res = await api.checkHealth();
      wx.hideLoading();
      this.setData({ serverOnline: true });
      wx.showModal({
        title: '引擎在线',
        content: `服务连接正常！\n服务端 Key: ${res.hasServerApiKey ? '已配置' : '使用客户端 Key'}\n内容安全: ${
          res.wechatSafetyEnabled ? '已启用微信检测' : '未配置 AppSecret'
        }`,
        showCancel: false,
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ serverOnline: false });
      wx.showModal({
        title: '无法连接后端',
        content: err.message || '请检查「模型与 AI Studio Key」中的服务地址',
        showCancel: false,
      });
    }
  },

  onClearCache() {
    getApp().haptic('light');
    wx.showModal({
      title: '清理本地缓存',
      content: '仅清理本地暂存的临时工作区状态，保留登录信息与 API 配置。',
      success(res) {
        if (!res.confirm) return;
        getApp().globalData.currentJob = null;
        wx.showToast({ title: '已清理', icon: 'success' });
      },
    });
  },

  onLogout() {
    const app = getApp();
    app.haptic('light');
    wx.showModal({
      title: '退出登录',
      content: '确认退出当前账号吗？',
      confirmColor: '#FF3B30',
      success: (res) => {
        if (!res.confirm) return;
        app.logout();
        this.setData({ user: null });
        wx.showToast({ title: '已退出', icon: 'success' });
      },
    });
  },
});
