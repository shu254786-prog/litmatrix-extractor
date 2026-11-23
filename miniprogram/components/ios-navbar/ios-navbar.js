Component({
  options: {
    multipleSlots: true,
  },
  properties: {
    title: {
      type: String,
      value: 'LitMatrix',
    },
    showBack: {
      type: Boolean,
      value: false,
    },
  },
  data: {
    statusBarHeight: 44,
    navBarHeight: 44,
    totalNavHeight: 88,
    capsuleRightPad: 100,
  },
  lifetimes: {
    attached() {
      const app = getApp();
      this.setData(app.globalData.navMetrics);
    },
  },
  methods: {
    onBack() {
      getApp().haptic('light');
      wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) });
    },
  },
});
