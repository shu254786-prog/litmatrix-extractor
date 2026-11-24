const api = require('../../utils/api');

Page({
  data: {
    user: null,
    settings: {},
    serverOnline: false,
    inputSyncCode: '',
    pairing: false,
  },

  async onShow() {
    const app = getApp();
    this.setData({
      user: (app.globalData.auth && app.globalData.auth.user) || null,
      settings: app.globalData.settings,
    });
    this.checkServer();
    if (app.globalData.auth && app.globalData.auth.token) {
      try {
        const res = await api.getMe();
        if (res.user) {
          app.setAuth({ token: app.globalData.auth.token, user: res.user });
          this.setData({ user: res.user });
        }
      } catch (e) {
        // ignore
      }
    }
  },

  onShareAppMessage() {
    return {
      title: 'LitMatrix · 电脑拖入 20 篇 PDF，手机微信同步查看综述矩阵',
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

  onCopySyncCode() {
    const code = this.data.user && this.data.user.syncCode;
    if (!code) return;
    getApp().haptic('light');
    wx.setClipboardData({
      data: code,
      success() {
        wx.showToast({ title: '已复制互通码', icon: 'success' });
      },
    });
  },

  onInputSyncCode(e) {
    this.setData({ inputSyncCode: e.detail.value || '' });
  },

  async onBindSyncCode() {
    const clean = (this.data.inputSyncCode || '').replace(/\D/g, '');
    if (clean.length !== 6) {
      wx.showToast({ title: '请输入 6 位数字互通码', icon: 'none' });
      return;
    }

    const app = getApp();
    app.haptic('medium');
    this.setData({ pairing: true });
    try {
      const res = await api.pairSyncCode(clean);
      app.setAuth({ token: res.token, user: res.user });
      this.setData({ user: res.user, inputSyncCode: '' });

      // Automatically load latest synced batch into workspace!
      const jobsRes = await api.listJobs();
      if (jobsRes.jobs && jobsRes.jobs.length > 0) {
        app.globalData.currentJob = jobsRes.jobs[0];
      }

      wx.showModal({
        title: '跨端互通成功',
        content: `已与电脑端工作区完成双向绑定！点击确定前往查看同步过来的文献矩阵。`,
        showCancel: false,
        success() {
          wx.switchTab({ url: '/pages/library/library' });
        },
      });
    } catch (err) {
      wx.showModal({
        title: '绑定失败',
        content: err.message || '请确认电脑端与小程序连接同一后端地址',
        showCancel: false,
      });
    } finally {
      this.setData({ pairing: false });
    }
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
        content: `持久化存储: ${res.persistentDb || 'sqlite'}\n服务端 Key: ${
          res.hasServerApiKey ? '已配置' : '使用客户端 Key'
        }\n内容安全: ${res.wechatSafetyEnabled ? '已启用微信检测' : '未配置 AppSecret'}`,
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
      content: '仅清理本地暂存的临时状态，云端 SQLite 文献库不受影响。',
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
