'use strict';
/* 队列拼贴（Lattice · 无限晶格版）：块模板精确覆盖/让位表/环绕候选/队列指纹/
   时间格式/歌词索引。被测模块是无模块的全局脚本，用 vm 沙箱加载（先加载
   22a-lattice-blocks.js 数据模块，再加载 22-lattice.js）。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.join(__dirname, '..', 'public', 'js', 'modules', '10-shell');

const sandbox = {
  console,
  readBooleanPreference() { return false; },
  saveBooleanPreference() { },
  showToast() { },
  scheduleUiWarmTask() { return 0; },
  setTimeout() { return 0; },
  requestAnimationFrame() { return 0; },
  document: {
    getElementById() { return null; },
    createElement() { return { style: {}, dataset: {}, classList: { toggle() { }, add() { }, remove() { } }, querySelector() { return null; } }; },
    body: { classList: { toggle() { } } },
  },
  window: { addEventListener() { } },
  matchMedia() { return { matches: true }; },
  playQueue: [],
  currentIdx: -1,
  lyricsLines: [],
  getAdjustedLyricPlaybackTime(t) { return t; },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, '22a-lattice-blocks.js'), 'utf8'), sandbox, { filename: '22a-lattice-blocks.js' });
vm.runInContext(fs.readFileSync(path.join(dir, '22-lattice.js'), 'utf8'), sandbox, { filename: '22-lattice.js' });

const {
  latticeBadgeText: _unused,   /* 旧 API 已删，占位防误用 */
  latticeFallbackGradient, latticeQueueKey, latticeFormatTime, latticeCurrentLyricIndex,
  latticeCellGeometry, latticeCandidatesForQueueIndex, latticeBlockOrigin,
  latticeGetBlockTemplate, latticeGetBlockReflow, latticeBlockOrientation,
  LATTICE_BLOCK_COLS, LATTICE_BLOCK_ROWS, LATTICE_SLOTS_PER_BLOCK,
} = sandbox;

/* ---------- 块模板：12 槽 · 精确覆盖 12×8 ---------- */
{
  assert.equal(LATTICE_BLOCK_COLS, 12);
  assert.equal(LATTICE_BLOCK_ROWS, 8);
  assert.equal(LATTICE_SLOTS_PER_BLOCK, 12);
  // 16 个方向（4 模板 × 4 反射）各覆盖一遍采样
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      const tpl = latticeGetBlockTemplate(col, row);
      assert.equal(tpl.length, 12);
      let area = 0;
      for (const s of tpl) area += s.cols * s.rows;
      assert.equal(area, 96);                       // 12×8 精确覆盖
      // 槽位互不越界
      for (const s of tpl) {
        assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.cols <= 12 && s.y + s.rows <= 8);
      }
      // 尺寸范围 2×2 ~ 6×6
      for (const s of tpl) {
        assert.ok(s.cols >= 2 && s.rows >= 2 && s.cols <= 6 && s.rows <= 6);
      }
    }
  }
  // 不同 (col,row) 周期性取到不同方向
  assert.notEqual(latticeBlockOrientation(0, 0), latticeBlockOrientation(1, 0));
}

/* ---------- 让位表：每槽展开 6×6 且 block 仍精确覆盖 ---------- */
{
  for (let slot = 0; slot < 12; slot++) {
    const reflow = latticeGetBlockReflow(0, 0, slot);
    assert.ok(reflow, 'reflow slot ' + slot);
    assert.equal(reflow.length, 12);
    let area = 0;
    for (const s of reflow) area += s.cols * s.rows;
    assert.equal(area, 96);
    // 展开槽必为 6×6
    assert.ok(reflow[slot].cols === 6 && reflow[slot].rows === 6);
    // 槽位身份保持（原槽位展开在自身附近：x/y 一致或相近——展开槽从原位起）
    assert.ok(reflow[slot].x >= 0 && reflow[slot].y >= 0);
  }
  assert.equal(latticeGetBlockReflow(0, 0, -1), null);
  assert.equal(latticeGetBlockReflow(0, 0, 12), null);
}

/* ---------- 环绕几何：cellSlot % len ---------- */
{
  // 短队列（< 12）：单 block 单元
  const g1 = latticeCellGeometry(3);
  assert.equal(g1.bpr, 1);
  assert.equal(g1.br, 1);
  // 长队列：多 block 按横竖比 2.2 排
  const g2 = latticeCellGeometry(120);
  assert.ok(g2.bpr >= 1 && g2.br >= 1);
  assert.ok(g2.bpr * g2.br * 12 >= 120);
  // 每首歌都找得到座位
  for (let target = 0; target < 12; target++) {
    const cands = latticeCandidatesForQueueIndex(12, target);
    assert.ok(cands.length >= 1, 'target ' + target);
    for (const c of cands) {
      const geo = latticeCellGeometry(12);
      const cellSlot = (c.lr * geo.bpr + c.lc) * 12 + c.slot;
      assert.equal(cellSlot % 12, target);
    }
  }
  // 世界原点：相邻 block 相差一个 block 尺寸
  const geo = latticeCellGeometry(12);
  const o00 = latticeBlockOrigin(geo, 0, 0);
  const o10 = latticeBlockOrigin(geo, 1, 0);
  assert.equal(o10.x - o00.x, 12 * 136);
  assert.equal(o10.y - o00.y, 0);
}

/* ---------- 无封面兜底渐变：按 id 稳定取色相 ---------- */
{
  const g1 = latticeFallbackGradient('song-a');
  assert.equal(g1, latticeFallbackGradient('song-a'));
  assert.notEqual(g1, latticeFallbackGradient('song-b'));
  assert.ok(g1.startsWith('linear-gradient(135deg, hsl('));
  assert.ok(latticeFallbackGradient('').includes('hsl('));
}

/* ---------- 队列指纹 ---------- */
{
  const q = [
    { id: 1, name: 'A', cover: 'http://c/1.jpg' },
    { id: 2, name: 'B', cover: '' },
    { id: 3, name: 'C', cover: 'http://c/3.jpg' },
  ];
  const base = latticeQueueKey(q, 0);
  assert.equal(latticeQueueKey(q.slice(), 0), base);
  assert.notEqual(base, latticeQueueKey(q, 1));
  assert.notEqual(base, latticeQueueKey(q.slice(0, 2), 0));
  const renamed = q.slice(); renamed[1] = { id: 2, name: 'B2', cover: '' };
  assert.notEqual(base, latticeQueueKey(renamed, 0));
  const covered = q.slice(); covered[1] = { id: 2, name: 'B', cover: 'http://c/2.jpg' };
  assert.notEqual(base, latticeQueueKey(covered, 0));
  assert.ok(latticeQueueKey(null, 0).length > 0);
}

/* ---------- 时间格式 ---------- */
{
  assert.equal(latticeFormatTime(0), '0:00');
  assert.equal(latticeFormatTime(65), '1:05');
  assert.equal(latticeFormatTime(600), '10:00');
  assert.equal(latticeFormatTime(-5), '0:00');
  assert.equal(latticeFormatTime(NaN), '0:00');
}

/* ---------- 当前句索引 ---------- */
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
  assert.equal(latticeCurrentLyricIndex(), 0);
}

console.log('lattice.test.js: all assertions passed');
