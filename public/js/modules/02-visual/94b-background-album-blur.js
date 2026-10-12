// ============================================================
// 94b-background-album-blur.js — 正交背景五：封面模糊压暗底（dom-layer）
//
// 「album-blur：封面大图模糊+压暗」。与 body 背景体系的 #album-bg
// （index.css:988 blur(120px) brightness(0.18)）同审美、与 cover-fluid
// （94 背景一：blur(40px) 不压暗 + 三色光斑 + overlay 混色）形成明确
// 视觉差：重模糊(84px)+强压暗(brightness .32)+暗纱压角，只留封面的
// 大色团光晕，底部一道主题色地平线微光——更暗、更沉浸、无彩斑。
//
// 结构纪律沿用 94 背景一结论：
//   · 384px 降采样源 + blur 烤死在 img 上（大封面单瓦纹理不闪烁）
//   · fade 只做在包装 div（对 blur 层动 opacity 会每帧重栅格化）
//   · 双层 cross-fade（新层 decode 完成一帧后才揭示）
// 实现契约同 94-background-presets（92 注册表协议），独立 Image
// 降采样（不复用 94 闭包私有件）；依赖 vbgHexToRgb/vbgThemeColors。
// ============================================================

(function () {
  // 84px 重 blur 已抹平一切细于 ~84px 的细节，384px 长边源的模糊结果
  // 与原分辨率视觉一致（94 同款结论：纹理单瓦上传、大封面不闪烁）。
  var ABL_COVER_SOURCE_MAX = 384;
  var state = {
    host: null,
    sourceCover: '',
    buildSeq: 0,
    themeKey: '',
    topLayer: null
  };

  /* 封面降采样：384px 长边 jpeg。远程无 CORS 头会 taint canvas →
     resolve(null) 由调用方回退原 URL（重 blur 下可接受，94 同策略）。 */
  function ablBuildDownscaledCover(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = function () {
        try {
          var nw = img.naturalWidth || img.width;
          var nh = img.naturalHeight || img.height;
          if (!nw || !nh) { resolve(null); return; }
          var scale = Math.min(1, ABL_COVER_SOURCE_MAX / Math.max(nw, nh));
          var w = Math.max(1, Math.round(nw * scale));
          var h = Math.max(1, Math.round(nh * scale));
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          var ctx = c.getContext('2d');
          if (!ctx) { resolve(null); return; }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.82));
        } catch (e) {
          resolve(null);
        }
      };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  function ablApplyTheme(theme) {
    var host = state.host;
    if (!host) return;
    var t = vbgThemeColors(theme);
    var key = t.bg + t.c1;
    if (key === state.themeKey) return;
    state.themeKey = key;
    host.style.setProperty('--vbgb-bg', t.bg);
    // 地平线微光：主题主色自底向上淡出（比 cover-fluid 的三色光斑收敛得多）
    var rgb = vbgHexToRgb(t.c1, [255, 122, 61]);
    var horizon = host.querySelector('.vbg-abl-horizon');
    if (horizon) {
      horizon.style.background =
        'linear-gradient(to top, rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.16) 0%, rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0) 30%)';
    }
  }

  /* 新封面层：wrapper(淡入) > img(烤死 blur+压暗+scale)。decode 完成一帧后才揭示。 */
  function ablPushCoverLayer(src) {
    var host = state.host;
    if (!host) return;
    var stage = host.querySelector('.vbg-abl-stage');
    if (!stage) return;
    var layer = document.createElement('div');
    layer.className = 'vbg-abl-layer';
    var img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.src = src;
    layer.appendChild(img);
    stage.appendChild(layer);
    var old = state.topLayer;
    state.topLayer = layer;
    var reveal = function () {
      if (layer.parentNode !== stage) return;
      layer.classList.add('in');
      // 新层淡入完成后丢弃底下的旧层（1.6s 过渡 + 余量）
      setTimeout(function () {
        if (old && old.parentNode === stage && state.topLayer === layer) stage.removeChild(old);
      }, 1850);
    };
    if (img.decode) {
      img.decode().then(function () { requestAnimationFrame(reveal); }).catch(reveal);
    } else {
      if (img.complete) reveal();
      else img.onload = reveal;
    }
  }

  registerVisualizerBackgroundImpl('album-blur', {
    needsRaf: false,
    mount: function (host, ctx) {
      state.host = host;
      state.sourceCover = '';
      state.themeKey = '';
      state.topLayer = null;
      host.classList.add('vbg-abl');
      // 结构：idle(无封面底色) + stage(封面层) + veil(暗纱压角) + horizon(主题地平线)
      host.innerHTML =
        '<div class="vbg-abl-idle" aria-hidden="true"></div>' +
        '<div class="vbg-abl-stage" aria-hidden="true"></div>' +
        '<div class="vbg-abl-veil" aria-hidden="true"></div>' +
        '<div class="vbg-abl-horizon" aria-hidden="true"></div>';
      this.tickSlow(ctx);
    },
    unmount: function () {
      state.buildSeq++;
      state.host = null;
      state.topLayer = null;
      state.sourceCover = '';
    },
    tickSlow: function (ctx) {
      var host = state.host;
      if (!host) return;
      ablApplyTheme(ctx.theme);
      var url = ctx.coverUrl || '';
      if (url && url === state.sourceCover) return;
      state.sourceCover = url;
      var seq = ++state.buildSeq;
      if (!url) {
        var stage = host.querySelector('.vbg-abl-stage');
        if (stage) stage.innerHTML = '';
        state.topLayer = null;
        return;
      }
      ablBuildDownscaledCover(url).then(function (smallUrl) {
        if (seq !== state.buildSeq || !state.host) return; // 已切歌/已卸载，丢弃过期结果
        ablPushCoverLayer(smallUrl || url);
      });
    },
    onResize: function () { },
    tick: null
  });
})();

/* 封面模糊背景接管注册表登记项（92 预登记 implReady:false 防御默认 → 就绪） */
registerVisualizerBackground({ id: 'album-blur', label: '封面模糊', kind: 'dom-layer', order: 30, implReady: true });
