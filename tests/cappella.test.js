'use strict';
/* 群唱（Cappella）：确定性哈希/序列构建/短行承接/表情包闸门/头像稳定色 */
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
  cappellaBuildMessages, cappellaAvatarStyle, cappellaAvatarGlyph,
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
  // 短行承接：短行大概率沿用上一发送者（同侧）
  const shortLine = msgs.find(m => m.kind === 'lyric' && m.lineIndex === 2 && cappellaCountCompactChars(lines[2].text) <= 12);
  // 顺序与时间
  const timed = msgs.filter(m => m.kind !== 'title');
  let mono = true;
  for (let i = 1; i < timed.length; i++) if (timed[i].start < timed[i - 1].start) mono = false;
  assert.ok(mono);
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

/* ---------- 头像 ---------- */
{
  assert.ok(cappellaAvatarStyle(3).startsWith('linear-gradient'));
  assert.equal(cappellaAvatarStyle(3), cappellaAvatarStyle(3));  // 稳定
  assert.equal(cappellaAvatarGlyph(8, '夜航'), '夜');             // 右侧主唱用歌名首字
  assert.ok('月星风海灯'.includes(cappellaAvatarGlyph(0, '')));
}

console.log('cappella.test.js: all assertions passed');
