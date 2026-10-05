/* =========================================================================
   OrangeSea · 节拍缓存（beat-cache）
   -------------------------------------------------------------------------
   从原 server.js 拆出：beatmap 磁盘缓存（非 C 盘安全策略、读写）。
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BEATMAP_CACHE_DIR } = require('../context');

function beatCacheRootInfo() {
  const dir = path.resolve(BEATMAP_CACHE_DIR);
  const root = path.parse(dir).root;
  const drive = root ? root.replace(/[\\\/]+$/, '').toUpperCase() : '';
  const allowed = !!root && !/^C:$/i.test(drive);
  const available = allowed && fs.existsSync(root);
  return { dir, root, drive, allowed, available };
}
function ensureBeatMapCacheDir() {
  const info = beatCacheRootInfo();
  if (!info.allowed) {
    const err = new Error('BEAT_CACHE_ON_C_DRIVE_DISABLED');
    err.code = 'BEAT_CACHE_ON_C_DRIVE_DISABLED';
    err.info = info;
    throw err;
  }
  if (!info.available) {
    const err = new Error('BEAT_CACHE_DRIVE_UNAVAILABLE');
    err.code = 'BEAT_CACHE_DRIVE_UNAVAILABLE';
    err.info = info;
    throw err;
  }
  fs.mkdirSync(info.dir, { recursive: true });
  return info.dir;
}
function safeBeatMapCacheFile(key) {
  const raw = String(key || '').trim();
  if (!raw || raw.length > 240) return null;
  const hash = crypto.createHash('sha1').update(raw).digest('hex');
  const label = raw.replace(/[^a-z0-9_.-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'beatmap';
  return path.join(ensureBeatMapCacheDir(), `${label}-${hash}.json`);
}
function compactBeatMapCachePayload(body) {
  const key = String(body && body.key || '').trim();
  const map = body && body.map;
  if (!key || !map || typeof map !== 'object') return null;
  return {
    v: 1,
    key,
    savedAt: Date.now(),
    meta: {
      provider: String(body.provider || '').slice(0, 32),
      title: String(body.title || '').slice(0, 160),
      artist: String(body.artist || '').slice(0, 160),
      mode: String(body.mode || 'mr').slice(0, 32),
    },
    map,
  };
}
function readBeatMapCache(key) {
  const file = safeBeatMapCacheFile(key);
  if (!file || !fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!(raw && raw.map)) return null;
  // 读命中重盖 mtime：热门「只读不再分析」的文件不会被 prune 按最旧误淘汰
  //（renameSync 覆盖写天然刷新 mtime，这里保护的是长期只读命中的条目）。
  try { const now = new Date(); fs.utimesSync(file, now, now); } catch (_) { }
  return raw;
}

// 目录字节上限（仿 desktop/main.js pruneLyricCache 的 96MB 歌词 prune）：
// 文件名 = label-sha1(key)，同 key 覆盖写不膨胀，但新歌新 key 的 json 永久累积，
// 此前全仓无任何淘汰——beatmaps 是缓存目录体系内唯一无预算的成员。
const BEATMAP_CACHE_MAX_BYTES = 256 * 1024 * 1024;

async function pruneBeatMapCache() {
  let entries = [];
  const dir = path.resolve(BEATMAP_CACHE_DIR);
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.json$/i.test(entry.name)) continue;
    const file = path.join(dir, entry.name);
    try {
      const stat = await fs.promises.stat(file);
      files.push({ file, size: Math.max(0, Number(stat.size) || 0), time: Number(stat.mtimeMs) || 0 });
    } catch (_) { }
  }
  let total = files.reduce((sum, item) => sum + item.size, 0);
  if (total <= BEATMAP_CACHE_MAX_BYTES) return;
  files.sort((a, b) => a.time - b.time);
  for (const item of files) {
    if (total <= BEATMAP_CACHE_MAX_BYTES) break;
    try {
      await fs.promises.unlink(item.file);
      total -= item.size;
    } catch (_) { }
  }
}

function writeBeatMapCache(body) {
  const payload = compactBeatMapCachePayload(body);
  if (!payload) return { ok: false, error: 'INVALID_BEATMAP_CACHE_PAYLOAD' };
  const file = safeBeatMapCacheFile(payload.key);
  if (!file) return { ok: false, error: 'INVALID_BEATMAP_CACHE_KEY' };
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload));
  fs.renameSync(tmp, file);
  pruneBeatMapCache().catch(() => { }); // 写后异步 prune，不阻塞响应
  return { ok: true, key: payload.key, savedAt: payload.savedAt, dir: path.dirname(file) };
}

module.exports = {
  beatCacheRootInfo,
  ensureBeatMapCacheDir,
  safeBeatMapCacheFile,
  compactBeatMapCachePayload,
  readBeatMapCache,
  writeBeatMapCache,
  pruneBeatMapCache,
};
