/* 字体跟随真机探针：注入歌词 → 逐模式切换 fx.lyricFont → 截图 + 读 computed font-family
   用法: node scripts/font-follow-probe.cjs  */
const { chromium } = require('playwright');

const BASE = 'http://localhost:3362';
const OUT = 'output/font-follow';
const MODES = [
  { id: 'still',    apply: 'applyStillMode',    textSel: '#still-overlay .st-text' },
  { id: 'claddagh', apply: 'applyCladdaghMode', textSel: '#claddagh-overlay .cl-char' },
  { id: 'cappella', apply: 'applyCappellaMode', textSel: '#cappella-overlay .cp-text' },
  { id: 'sonnet',   apply: 'applySonnetMode',   textSel: '#sonnet-overlay .sonnet-line, #sonnet-overlay .sonnet-sub-main' },
  { id: 'monet',    apply: 'applyMonetMode',    textSel: '#monet-overlay .mn-word, #monet-overlay [class*="mn-"]' },
];
const FONT_A = 'sans';       // 默认
const FONT_B = 'mashan';     // 非默认（Ma Shan Zheng 手写体，肉眼差异大）

(async () => {
  const fs = require('fs');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)); });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));

  await page.goto(BASE + '/?v=probe' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);

  // 背景切 cover 模式（叠纹/演唱会背景会让截图无法读字）+ 压住 body 背景图层
  await page.evaluate(() => {
    try { fx.backgroundImage = ''; fx.backgroundMedia = null; fx.preset = 0; } catch (e) { }
    try { document.body.style.background = '#0e0906'; } catch (e) { }
    ['ambient-bg', 'bg-media', 'concert-bg', 'visual-bg', 'stage-bg'].forEach((id) => {
      var el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    document.querySelectorAll('canvas.bg-canvas, .concert-layer, .ambient-layer').forEach((el) => { el.style.display = 'none'; });
  });

  // 注入歌词 + 播放时间源（真实全局 lyricsLines；audio.currentTime 由页面自身 audio 元素提供）
  await page.evaluate(() => {
    const now = 0;
    lyricsLines = [
      { text: '字体跟随验证第一行', t: now, duration: 8, words: [{ text: '字体跟随验证第一行', t: now, d: 8 }], translation: 'Font follow probe line one' },
      { text: '第二行歌词 ABCDEFG', t: now + 8, duration: 8, words: [{ text: '第二行歌词 ABCDEFG', t: now + 8, d: 8 }], translation: 'Second line of lyrics' },
      { text: '第三行见证字体变化', t: now + 16, duration: 8, words: [{ text: '第三行见证字体变化', t: now + 16, d: 8 }], translation: 'Third line sees the change' },
    ];
    if (typeof audio !== 'undefined' && audio) {
      try { Object.defineProperty(audio, 'currentTime', { get: () => 1.5, configurable: true }); } catch (e) { }
    }
    if (typeof playing !== 'undefined') { try { playing = true; } catch (e) { } }
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    ['home-view', 'home', 'app-home', 'shelf-layer', 'stage', 'visual-stage'].forEach((id) => {
      var el = document.getElementById(id); if (el) el.style.display = 'none';
    });
  });

  async function setFont(key) {
    await page.evaluate((k) => {
      fx.lyricFont = k;
      try { if (typeof saveFxArchive === 'function') saveFxArchive(); } catch (e) { }
      try { if (typeof persistFx === 'function') persistFx(); } catch (e) { }
    }, key);
    await page.waitForTimeout(1600); // 等 700ms sync 轮询一拍 + 字体加载
  }

  async function probe(mode) {
    const rec = { mode: mode.id };
    // 进模式
    await page.evaluate((m) => { try { window[m.apply](true, { save: false }); } catch (e) { console.error('apply fail', m.id, e); } }, mode);
    await page.waitForTimeout(2200);
    rec.overlayVisible = await page.evaluate((id) => {
      var ov = document.getElementById(id + '-overlay');
      if (!ov) return 'no-overlay';
      var r = ov.getBoundingClientRect();
      var cs = getComputedStyle(ov);
      return cs.display + '/' + cs.visibility + '/' + r.width + 'x' + r.height + '/text-nodes=' + ov.querySelectorAll('*').length;
    }, mode.id);

    // 把覆盖层临时提到最高层截图（首页图层 z-index 上万，覆盖层 z-index:5 会被压住）
    async function raiseOverlay(on) {
      await page.evaluate((args) => {
        var ov = document.getElementById(args.id + '-overlay');
        if (!ov) return;
        if (args.on) {
          ov.dataset.probeOldZ = ov.style.zIndex || '';
          ov.style.zIndex = '99999';
        } else {
          ov.style.zIndex = ov.dataset.probeOldZ || '';
        }
      }, { id: mode.id, on: on });
    }

    await setFont(FONT_A);
    await page.waitForTimeout(600);
    rec.fontA = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { fontFamily: cs.fontFamily.slice(0, 160), fontWeight: cs.fontWeight, text: (el.textContent || '').slice(0, 24) };
    }, mode.textSel);
    await raiseOverlay(true);
    await page.screenshot({ path: `${OUT}/${mode.id}-font-sans.png` });
    await raiseOverlay(false);

    await setFont(FONT_B);
    await page.waitForTimeout(800);
    rec.fontB = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { fontFamily: cs.fontFamily.slice(0, 160), fontWeight: cs.fontWeight, text: (el.textContent || '').slice(0, 24) };
    }, mode.textSel);
    await raiseOverlay(true);
    await page.screenshot({ path: `${OUT}/${mode.id}-font-mashan.png` });
    await raiseOverlay(false);

    // 出模式
    await page.evaluate((m) => { try { window[m.apply](false, { save: false }); } catch (e) { } }, mode);
    await page.waitForTimeout(500);
    return rec;
  }

  const results = [];
  for (const m of MODES) {
    try { results.push(await probe(m)); }
    catch (e) { results.push({ mode: m.id, error: String(e).slice(0, 300) }); }
  }
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
