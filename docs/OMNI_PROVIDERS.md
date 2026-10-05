# Omni 音源抽象层

> 前端多平台音源的统一门面。UI / 模块不得直接拼写平台 API URL 或做平台 if/else，
> 一律经 `omni` 门面或 provider 注册表路由。
> Portions Copyright (c) 2025 chthollyphile and Folia contributors —
> adapted from folia-major (AGPL-3.0), 原生 JS 移植适配本项目无构建模块体系。

## 分层

```
UI / 各模块
  -> omni（09-omni-facade.js，唯一公开入口）
       -> providerRegistry（02）→ 六平台 provider（03~08）
       -> song-key（01，歌曲身份地基）
  -> 服务端 /api/* 路由（保持不变）
```

## 目录（public/js/modules/04-omni/）

| 文件 | 职责 |
| --- | --- |
| `00-omni-errors.js` | `OmniProviderError(code, message, providerId, cause)`；错误码枚举（auth-required / unsupported / not-public / unavailable / not-playable / preview-only / region-restricted / network / invalid-response） |
| `01-song-key.js` | `getPlaybackSourceRef(song)`（判别式：online:{providerId,mediaId} / local / podcast）→ `getPlaybackSongKey(song)` 三段键 `online:qq:MID`；`omniResolveProviderId` 平台判定与 songProviderKey 语义一致；`normalizePlaybackSongSource` 幂等补 sourceRef |
| `02-provider-registry.js` | Map 注册表 + 版本计数 + 订阅通知；`getOmniProviderForSong` 按 sourceRef 路由 |
| `03~08-provider-*.js` | 六平台 adapter（netease/qq/kugou/qishui/spotify/local）：`search.urlFor` / `playback.urlFor`（含超时预算） / `lyrics.urlFor`；文件末尾自注册 |
| `09-omni-facade.js` | 门面：URL 构建族（`searchUrlFor` / `playbackUrlForSong` / `lyricUrlForSong`）+ 数据方法族（`searchProviderSongs` 带 request generation）+ 能力查询族 |
| `10-resource-cache-keys.js` | `getSongResourceCacheKey(kind, song)` = `{kind}_{songKey}`；kugou 封面用 `cover_v2` 版本化前缀 |

## request generation（晚到响应防护）

切换平台 / 开启新搜索事务时调 `omni.invalidateActiveRequests()`（`setActiveProvider` 已内置）。
`omniWithActiveProvider` 进门快照 generation → await → 比对不一致抛 `AbortError`。
**不取消底层网络请求**，只把过期结果变成异常；调用方不得自造第二套取消/晚到防护。

## 迁移后的消费点

| 消费点 | 之前 | 现在 |
| --- | --- | --- |
| `13-playback-start-audio.js` playQueueAt | 平台 if/else 拼 URL（~24 行 ×2 处） | `omni.playbackUrlForSong(song, {qualityParam, matchOpts})` |
| `13-playback-start-audio.js` resolveAlbumGaplessPlaybackData | 同上一份复制 | 同上 |
| `00-lyrics-fetch-parse.js` lyricEndpointForSong | 平台 if/else 拼 URL | `omni.lyricUrlForSong(song)`（裸 id 入参保留旧路径） |
| `07-search.js` searchProviderUrl | 平台 if/else 拼 URL | `omni.searchUrlFor(provider, q, limit, offset)` |
| `qqPlaybackEvidenceQuery` / `neteasePlaybackMatchQuery` | 定义在 13 文件 | 收敛至 04-omni/04 与 03，全局名保留（tempo-worker 等 typeof 调用继续生效） |

## Do Not Regress

- `queueItemKey`（09-queue-snapshot-autoplay.js）保持原实现：键格式已被快照/去重路径依赖，
  与 `getPlaybackSongKey` 并行；统一是后续版本的事。
- 新增资源 kind 必须同步登记清缓存分类表，否则条目变成清不掉的孤儿。
- provider 的 `playback.urlFor` 超时预算是服务端预算的契约（QQ：服务端 vkey 6s + probe 6.2s < 渲染侧 15s），
  改超时先看 `tests/qq-vip-entitlement.test.js` 的预算断言。
- 本地歌曲 playback 能力为 false（文件直连/blob，不走 /api 播放 URL），消费方须判 null。

## 待办（后续阶段）

- `playlistTracksEndpoint`（02-playlist-detail.js）迁移至 provider catalog 切片。
- `11-provider-fallback.js` 跨平台换源编排改走 registry 遍历。
- 账号快照 hydration/freshness 双轴状态机（配合 08-account 状态轮询）。
