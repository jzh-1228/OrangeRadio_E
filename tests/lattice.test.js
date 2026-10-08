'use strict';
/* 队列拼贴（Lattice）：徽章/分区/兜底渐变/队列指纹/时间格式/歌词索引/歌词集指纹
   被测模块是无模块的全局脚本，用 vm 沙箱加载（同 rainy-cab.test.js 风格）。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.join(__dirname, '..', 'public', 'js', 'modules', '10-shell', '22-lattice.js');

const sandbox = {
  console,
  readBooleanPreference() { return false; },
  saveBooleanPreference() { },
  showToast() { },
  scheduleUiWarmTask() { return 0; },
  setTimeout() { return 0; },
  document: {
    getElementById() { return null; },
    createElement() { return {}; },
    body: { classList: { toggle() { } } },
  },
  window: { addEventListener() { } },
  matchMedia() { return { matches: true }; },
  playQueue: [],
  currentIdx: -1,
  lyricsLines: [],
  getAdjustedLyricPlaybackTime(t) { return t; },
  findStageLyricIndexAtTime(t) {
    if (t < 5) return 0;
    if (t < 10) return 1;
    return 2;
  },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(modulePath, 'utf8'), sandbox, { filename: modulePath });

const {
  latticeBadgeText, latticeSectionFor, latticeFallbackGradient,
  latticeQueueKey, latticeFormatTime, latticeCurrentLyricIndex, latticeLyricsKey,
} = sandbox;

/* ---------- 徽章：1 起两位补零 ---------- */
{
  assert.equal(latticeBadgeText(0), '01');
  assert.equal(latticeBadgeText(4), '05');
  assert.equal(latticeBadgeText(9), '10');
  assert.equal(latticeBadgeText(119), '120');
  assert.equal(latticeBadgeText(-3), '01');      // 非法入参兜底为 1
  assert.equal(latticeBadgeText('7'), '08');
}

/* ---------- 分区：播放头是唯一真相源 ---------- */
{
  assert.equal(latticeSectionFor(3, 3), 'now');
  assert.equal(latticeSectionFor(0, 3), 'played');
  assert.equal(latticeSectionFor(2, 3), 'played');
  assert.equal(latticeSectionFor(4, 3), 'upcoming');
  assert.equal(latticeSectionFor(0, -1), 'upcoming');   // 无播放头：全部待播
  assert.equal(latticeSectionFor(5, -1), 'upcoming');
}

/* ---------- 无封面兜底渐变：按 id 稳定取色相 ---------- */
{
  const g1 = latticeFallbackGradient('song-a');
  assert.equal(g1, latticeFallbackGradient('song-a'));        // 稳定
  assert.notEqual(g1, latticeFallbackGradient('song-b'));     // 不同 id 不同色
  assert.ok(g1.startsWith('linear-gradient(145deg, hsl('));
  assert.ok(latticeFallbackGradient('').includes('hsl('));    // 空兜底
}

/* ---------- 队列指纹：内容/播放头变化必须变键 ---------- */
{
  const q = [
    { id: 1, name: 'A', cover: 'http://c/1.jpg' },
    { id: 2, name: 'B', cover: '' },
    { id: 3, name: 'C', cover: 'http://c/3.jpg' },
  ];
  const base = latticeQueueKey(q, 0);
  assert.equal(latticeQueueKey(q.slice(), 0), base);            // 同内容同键
  assert.notEqual(base, latticeQueueKey(q, 1));                 // 播放头变化
  assert.notEqual(base, latticeQueueKey(q.slice(0, 2), 0));     // 长度变化
  const renamed = q.slice(); renamed[1] = { id: 2, name: 'B2', cover: '' };
  assert.notEqual(base, latticeQueueKey(renamed, 0));           // 歌名变化
  const covered = q.slice(); covered[1] = { id: 2, name: 'B', cover: 'http://c/2.jpg' };
  assert.notEqual(base, latticeQueueKey(covered, 0));           // 封面变化
  assert.ok(latticeQueueKey(null, 0).length > 0);               // 空队列兜底
}

/* ---------- 时间格式 ---------- */
{
  assert.equal(latticeFormatTime(0), '0:00');
  assert.equal(latticeFormatTime(65), '1:05');
  assert.equal(latticeFormatTime(600), '10:00');
  assert.equal(latticeFormatTime(-5), '0:00');
  assert.equal(latticeFormatTime(NaN), '0:00');
}

/* ---------- 当前句索引 / 歌词集指纹 ---------- */
{
  sandbox.lyricsLines = [
    { t: 0, text: '', translation: '' },
    { t: 2, text: '夜に駆ける', translation: '奔向夜晚' },
    { t: 8, text: '繰り返す世界', translation: '' },
  ];
  sandbox.audio = { currentTime: 6 };
  assert.equal(latticeCurrentLyricIndex(), 1);
  sandbox.audio.currentTime = 12;
  assert.equal(latticeCurrentLyricIndex(), 2);
  sandbox.audio = null;
  assert.equal(latticeCurrentLyricIndex(), 0);                  // 无 audio：按 0 兜底

  assert.equal(latticeLyricsKey([]), '0');
  const k1 = latticeLyricsKey(sandbox.lyricsLines);
  assert.equal(k1, latticeLyricsKey(sandbox.lyricsLines.slice()));
  const changed = sandbox.lyricsLines.slice();
  changed[2] = { t: 8, text: '別の世界', translation: '' };
  assert.notEqual(k1, latticeLyricsKey(changed));
  assert.notEqual(k1, latticeLyricsKey(changed.slice(0, 2)));
}

console.log('lattice.test.js: all assertions passed');
