const api = require('../../utils/api');

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    agreed: true,
    loggingIn: false,
    canBack: false,
  },

  onLoad() {
    const pages = getCurrentPages();
    const app = getApp();
    const user = app.globalData.auth && app.globalData.auth.user;
    this.setData({
      canBack: pages.length > 1,
      avatarUrl: (user && user.avatarUrl) || '',
      nickName: (user && !user.isGuest && user.nickName) || '',
    });
  },

  onChooseAvatar(e) {
    getApp().haptic('light');
    this.setData({ avatarUrl: e.detail.avatarUrl || '' });
  },

  onNickInput(e) {
    this.setData({ nickName: e.detail.value || '' });
  },

  toggleAgree() {
    getApp().haptic('light');
    this.setData({ agreed: !this.data.agreed });
  },

  openPrivacy() {
    getApp().haptic('light');
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  finishNavigation() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  onWeChatLogin() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先勾选同意隐私保护指引', icon: 'none' });
      return;
    }

    const app = getApp();
    app.haptic('medium');
    this.setData({ loggingIn: true });

    wx.login({
      success: async (loginRes) => {
        try {
          const res = await api.wechatLogin({
            code: loginRes.code || '',
            nickName: this.data.nickName || '微信科研用户',
            avatarUrl: this.data.avatarUrl || '',
            isGuest: false,
          });
          app.setAuth({ token: res.token, user: res.user });
          wx.showToast({ title: '登录成功', icon: 'success' });
          setTimeout(() => this.finishNavigation(), 450);
        } catch (err) {
          wx.showModal({
            title: '登录提示',
            content: err.message || '暂时无法连接后端，请检查设置中的服务地址',
            showCancel: false,
          });
        } finally {
          this.setData({ loggingIn: false });
        }
      },
      fail: () => {
        this.setData({ loggingIn: false });
        wx.showToast({ title: '获取微信登录凭证失败', icon: 'none' });
      },
    });
  },

  async onGuestLogin() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先勾选同意隐私保护指引', icon: 'none' });
      return;
    }
    const app = getApp();
    app.haptic('light');
    this.setData({ loggingIn: true });
    try {
      const res = await api.wechatLogin({ isGuest: true });
      app.setAuth({ token: res.token, user: res.user });
      this.finishNavigation();
    } catch (e) {
      // Allow offline guest navigation into workspace if backend hasn't been configured yet
      app.setAuth({
        token: '',
        user: { userId: 'guest_offline', nickName: '访客研究员', isGuest: true },
      });
      this.finishNavigation();
    } finally {
      this.setData({ loggingIn: false });
    }
  },
});
