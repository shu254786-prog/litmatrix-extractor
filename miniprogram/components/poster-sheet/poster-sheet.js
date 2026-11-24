function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const chars = Array.from(String(text || ''));
  const lines = [];
  let line = '';

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (ch === '\n') {
      lines.push(line);
      line = '';
      if (lines.length >= maxLines) break;
      continue;
    }
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line.length > 0) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) {
    lines.push(line);
  }
  if (lines.length === maxLines && chars.length > lines.join('').length) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.slice(0, Math.max(1, last.length - 1)) + '…';
  }
  return lines;
}

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer(val) {
        if (val) {
          setTimeout(() => this.generatePoster(), 80);
        }
      },
    },
    papers: {
      type: Array,
      value: [],
    },
    modelLabel: {
      type: String,
      value: 'gemini-4-hydrogen',
    },
    userName: {
      type: String,
      value: '科研研究员',
    },
  },

  data: {
    generating: false,
    posterPath: '',
  },

  methods: {
    onClose() {
      getApp().haptic('light');
      this.triggerEvent('close');
    },

    noop() {},

    onPreviewFull() {
      if (!this.data.posterPath) return;
      wx.previewImage({
        urls: [this.data.posterPath],
        current: this.data.posterPath,
      });
    },

    onShareFriend() {
      if (!this.data.posterPath) return;
      getApp().haptic('light');
      if (wx.showShareImageMenu) {
        wx.showShareImageMenu({ path: this.data.posterPath });
      } else {
        this.onPreviewFull();
      }
    },

    onSaveAlbum() {
      if (!this.data.posterPath) return;
      getApp().haptic('medium');
      wx.saveImageToPhotosAlbum({
        filePath: this.data.posterPath,
        success() {
          wx.showToast({ title: '海报已保存到相册', icon: 'success' });
        },
        fail: (err) => {
          if ((err.errMsg || '').includes('auth deny')) {
            wx.showModal({
              title: '需要相册权限',
              content: '请在设置中开启「保存到相册」权限后重试。',
              success: (m) => {
                if (m.confirm) wx.openSetting();
              },
            });
          } else {
            wx.showToast({ title: '保存失败', icon: 'none' });
          }
        },
      });
    },

    generatePoster() {
      const completed = (this.properties.papers || []).filter(
        (p) => p.status === 'done' && p.extraction
      );
      if (completed.length === 0) return;

      this.setData({ generating: true, posterPath: '' });

      const query = this.createSelectorQuery();
      query
        .select('#matrixPosterCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            this.setData({ generating: false });
            return;
          }

          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const width = 375;
          const height = 640;
          const dpr = 2;
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);

          // Background
          ctx.fillStyle = '#F2F2F7';
          ctx.fillRect(0, 0, width, height);

          // Top Apple Editorial Gradient Header
          const grad = ctx.createLinearGradient(0, 0, width, 138);
          grad.addColorStop(0, '#007AFF');
          grad.addColorStop(1, '#5856D6');
          ctx.fillStyle = grad;
          drawRoundedRect(ctx, 14, 14, width - 28, 114, 18);
          ctx.fill();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 20px sans-serif';
          ctx.fillText('LitMatrix · 文献综述对比矩阵', 30, 50);

          ctx.fillStyle = 'rgba(255,255,255,0.88)';
          ctx.font = '12px sans-serif';
          ctx.fillText(
            `已提炼 ${completed.length} 篇核心文献 · 五维结构化 + 物理页码溯源`,
            30,
            74
          );

          // Header meta pill
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          drawRoundedRect(ctx, 30, 88, 220, 24, 12);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '11px sans-serif';
          ctx.fillText(
            `引擎: ${this.properties.modelLabel} · ${new Date().toLocaleDateString('zh-CN')}`,
            40,
            104
          );

          // Draw top 3 papers cleanly inside cards
          const shown = completed.slice(0, 3);
          let curY = 142;

          shown.forEach((paper) => {
            const ext = paper.extraction;
            const cardH = 142;

            ctx.fillStyle = '#FFFFFF';
            drawRoundedRect(ctx, 14, curY, width - 28, cardH, 16);
            ctx.fill();

            // Title
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 13px sans-serif';
            const titleLines = wrapText(ctx, ext.title, width - 64, 1);
            ctx.fillText(titleLines[0] || '', 28, curY + 24);

            // Authors & Year
            ctx.fillStyle = '#007AFF';
            ctx.font = '11px sans-serif';
            ctx.fillText(`${ext.authors} · ${ext.year} · ${ext.venue}`, 28, curY + 42);

            // Methodology snippet
            ctx.fillStyle = '#5856D6';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText('方法', 28, curY + 63);
            ctx.fillStyle = '#3A3A3C';
            ctx.font = '11px sans-serif';
            const methLines = wrapText(ctx, ext.methodology.summary, width - 92, 2);
            methLines.forEach((l, li) => ctx.fillText(l, 60, curY + 63 + li * 15));

            // Conclusions snippet
            ctx.fillStyle = '#1C7C36';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText('结论', 28, curY + 98);
            ctx.fillStyle = '#3A3A3C';
            ctx.font = '11px sans-serif';
            const concLines = wrapText(ctx, ext.conclusions.summary, width - 92, 2);
            concLines.forEach((l, li) => ctx.fillText(l, 60, curY + 98 + li * 15));

            // Provenance tag
            const pPage =
              (ext.conclusions.citations && ext.conclusions.citations[0] && ext.conclusions.citations[0].pdf_page) ||
              1;
            ctx.fillStyle = 'rgba(255, 149, 0, 0.14)';
            drawRoundedRect(ctx, width - 98, curY + 114, 68, 19, 9);
            ctx.fill();
            ctx.fillStyle = '#C96A00';
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText(`溯源 P.${pPage}`, width - 86, curY + 127);

            curY += cardH + 12;
          });

          // Footer
          ctx.fillStyle = '#8E8E93';
          ctx.font = '11px sans-serif';
          const moreTxt =
            completed.length > 3
              ? `另有 ${completed.length - 3} 篇文献详见小程序/Excel 完整对比矩阵`
              : '长按保存海报 · 微信搜索「LitMatrix 文献矩阵」';
          ctx.fillText(moreTxt, 20, height - 34);
          ctx.fillStyle = '#007AFF';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText(`整理人: ${this.properties.userName || '科研研究员'}`, 20, height - 16);

          wx.canvasToTempFilePath({
            canvas,
            fileType: 'png',
            quality: 1,
            success: (out) => {
              this.setData({ generating: false, posterPath: out.tempFilePath });
            },
            fail: () => {
              this.setData({ generating: false });
              wx.showToast({ title: '生成海报失败', icon: 'none' });
            },
          });
        });
    },
  },
});
