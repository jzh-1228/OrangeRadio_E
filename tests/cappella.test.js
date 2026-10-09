'use strict';
/* 群唱（Cappella）：确定性哈希/序列构建/短行承接/表情包闸门/气泡配色/三档 motion */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.join(__dirname, '..', 'public', 'js', 'modules', '10-shell', '23-cappella.js');

const sandbox = {
  console,
  readBooleanPreference() { return false; },
  saveBooleanPreference() { },
  scheduleUiWarmTask() { return 0; },
  setTimeout() { return 0; },
  clearTimeout() { },
  document: {
    getElementById() { return null; },
    createElement() { return {}; },
    body: { classList: { toggle() { } } },
  },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(modulePath, 'utf8'), sandbox, { filename: modulePath });

const {
  cappellaHashString, cappellaSeededUnit, cappellaCountCompactChars,
  cappellaBuildMessages, cappellaBubbleColors, cappellaMixColors,
  cappellaFormatTimestamp, cappellaAvatarUrl, CAPPELLA_CONFIGS,
  CAPPELLA_AVATAR_URLS, CAPPELLA_EMO_URLS,
} = sandbox;

/* ---------- 确定性哈希 ---------- */
{
  assert.equal(cappellaHashString('abc'), cappellaHashString('abc'));
  assert.notEqual(cappellaHashString('abc'), cappellaHashString('abd'));
  const u1 = cappellaSeededUnit('carry', 1.5, 2, 'song-x');
  assert.equal(u1, cappellaSeededUnit('carry', 1.5, 2, 'song-x'));
  assert.ok(u1 >= 0 && u1 <= 1);
  assert.equal(cappellaCountCompactChars('  hello world  '), 10);
}

/* ---------- 消息序列 ---------- */
{
  const lines = [];
  for (let i = 0; i < 24; i++) {
    const text = i === 5 ? '......' : ('歌词行' + i + (i % 3 === 0 ? '这是一句比较长一点的歌词内容' : '短词'));
    lines.push({ t: i * 4, duration: 3, text, words: [] });
  }
  const msgs = cappellaBuildMessages(lines, '测试之歌', 'normal', 'song-x');
  const again = cappellaBuildMessages(lines, '测试之歌', 'normal', 'song-x');
  assert.deepEqual(msgs, again);                          // 同歌确定性
  assert.equal(msgs[0].kind, 'title');
  assert.equal(msgs[0].side, 'right');
  // 每行一条 lyric（间奏行换成 emo），normal 档另有 ≤cap 条随机回应表情
  const lyricCount = msgs.filter(m => m.kind === 'lyric').length;
  const emoCount = msgs.filter(m => m.kind === 'emo').length;
  const cap = Math.floor(24 * 0.125);
  assert.equal(lyricCount, 23);                           // 24 行 - 1 间奏（被 emo 替代）
  assert.ok(emoCount >= 1 && emoCount <= 1 + cap);
  assert.equal(lyricCount + emoCount, msgs.length - 1);   // 除标题外逐条对账
  // 强制右：normal 档每 5 行（lineIndex+1)%5===0 的非间奏行落在右侧
  const forced = msgs.find(m => m.kind === 'lyric' && m.lineIndex === 4);
  assert.equal(forced.side, 'right');
  // 顺序与时间
  const timed = msgs.filter(m => m.kind !== 'title');
  let mono = true;
  for (let i = 1; i < timed.length; i++) if (timed[i].start < timed[i - 1].start) mono = false;
  assert.ok(mono);
  // emo 消息携带图片 URL（不再用 emoji 字符）
  const emo = msgs.find(m => m.kind === 'emo');
  assert.ok(emo.emoUrl && emo.emoUrl.startsWith('assets/cappella/emo/'));
  // 空歌词：只有标题
  assert.equal(cappellaBuildMessages([], '空', 'normal', 's').length, 1);
}

/* ---------- chaotic 档：表情概率放开 ---------- */
{
  const lines = [];
  for (let i = 0; i < 30; i++) lines.push({ t: i * 3, duration: 2.4, text: '行' + i, words: [] });
  const chaotic = cappellaBuildMessages(lines, 'T', 'chaotic', 'seed-1');
  const emos = chaotic.filter(m => m.kind === 'emo').length;
  const cap = Math.floor(30 * (1 / 6));
  assert.ok(emos >= 0 && emos <= cap + 1);                // 上限+间奏冗余
  const calm = cappellaBuildMessages(lines, 'T', 'calm', 'seed-1');
  assert.equal(calm.filter(m => m.kind === 'emo').length, 0);   // calm 档无随机表情
}

/* ---------- 三档 motion（Folia getCappellaIntensityConfig 数值直译） ---------- */
{
  const m = CAPPELLA_CONFIGS.normal.motion;
  assert.equal(m.activeScale, 1.12);
  assert.equal(m.passedScale, 0.92);
  assert.equal(m.activeFontMultiplier, 1.34);
  assert.equal(m.glowOpacity, 0.4);
  assert.equal(m.glowDuration, 1.8);
  assert.equal(m.glowRightAlpha, 0.34);
  assert.equal(m.glowLeftAlpha, 0.18);
  assert.equal(m.emoActiveSize, 160);
  assert.ok(CAPPELLA_CONFIGS.calm.motion.activeScale < m.activeScale);
  assert.ok(CAPPELLA_CONFIGS.chaotic.motion.activeScale > m.activeScale);
}

/* ---------- 气泡配色（Folia getBubbleColors 视觉导向调整版） ---------- */
{
  const theme = { backgroundColor: '#171009', primaryColor: '#f2e6d4', accentColor: '#ff9c6e', secondaryColor: '#e6c9a6' };
  const right = cappellaBubbleColors({ side: 'right', avatarIndex: 8 }, theme);
  assert.ok(right.backgroundColor.startsWith('rgba('));
  // 右侧文字为提亮白（本项目夜主题 accent 明度高，气泡压暗后浅字保对比）
  assert.equal(right.textColor, 'rgba(249,244,236,1)');
  const left0 = cappellaBubbleColors({ side: 'left', avatarIndex: 0 }, theme);
  const left8 = cappellaBubbleColors({ side: 'left', avatarIndex: 8 }, theme);
  assert.equal(left0.textColor, 'rgba(249,243,234,1)');     // 左侧提亮白（mix 0.5）
  assert.notEqual(left0.backgroundColor, left8.backgroundColor);  // 头像 tone 渐进
  // mixColors：中点混合
  const mid = cappellaMixColors('#000000', '#ffffff', 0.5, 1);
  assert.equal(mid, 'rgba(128,128,128,1)');
}

/* ---------- 头像与资源 ---------- */
{
  assert.equal(CAPPELLA_AVATAR_URLS.length, 15);
  assert.equal(CAPPELLA_EMO_URLS.length, 9);
  assert.ok(cappellaAvatarUrl(8, 'right').includes('assets/cappella/avatar/'));
  assert.equal(cappellaAvatarUrl(0, 'left'), CAPPELLA_AVATAR_URLS[0]);
  // 资源文件真实存在
  const pub = path.join(__dirname, '..', 'public');
  for (const u of [...CAPPELLA_AVATAR_URLS, ...CAPPELLA_EMO_URLS]) {
    assert.ok(fs.existsSync(path.join(pub, u)), 'missing asset ' + u);
  }
}

/* ---------- 时间戳 ---------- */
{
  assert.equal(cappellaFormatTimestamp(0), '0:00');
  assert.equal(cappellaFormatTimestamp(83), '1:23');
  assert.equal(cappellaFormatTimestamp(-5), '0:00');
}

console.log('cappella.test.js: all assertions passed');
