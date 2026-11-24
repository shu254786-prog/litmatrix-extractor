let pendingResolve = null;

Component({
  data: {
    visible: false,
    contractName: '《LitMatrix 小程序隐私保护指引》',
  },

  lifetimes: {
    attached() {
      if (wx.onNeedPrivacyAuthorization) {
        wx.onNeedPrivacyAuthorization((resolve) => {
          pendingResolve = resolve;
          this.setData({ visible: true });
        });
      }
      if (wx.getPrivacySetting) {
        wx.getPrivacySetting({
          success: (res) => {
            if (res.privacyContractName) {
              this.setData({ contractName: res.privacyContractName });
            }
          },
        });
      }
    },
  },

  methods: {
    onOpenContract() {
      getApp().haptic('light');
      if (wx.openPrivacyContract) {
        wx.openPrivacyContract({
          fail: () => wx.navigateTo({ url: '/pages/privacy/privacy' }),
        });
      } else {
        wx.navigateTo({ url: '/pages/privacy/privacy' });
      }
    },

    onDisagree() {
      getApp().haptic('light');
      this.setData({ visible: false });
      if (pendingResolve) {
        pendingResolve({ event: 'disagree' });
        pendingResolve = null;
      }
      wx.showToast({
        title: '您已拒绝授权，相关功能暂不可用',
        icon: 'none',
      });
    },

    onAgree() {
      getApp().haptic('medium');
      this.setData({ visible: false });
      if (pendingResolve) {
        pendingResolve({ buttonId: 'agree-privacy-btn', event: 'agree' });
        pendingResolve = null;
      }
    },
  },
});
