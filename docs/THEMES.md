# 封面派生双主题（Folia builtinTheme 全链移植）

> 移植自 folia-major `src/utils/themeColorMath.ts` 与 `src/utils/builtinTheme/`（AGPL-3.0，见 NOTICE.md）。
> Folia 的"主题预设"不是静态清单：**每首歌按封面色相 + 和声方案实时生成昼/夜一对主题**，本移植算法与文案逐行一致，
> 随机源改为按歌曲 key 播种的 mulberry32（同歌同主题，跨会话稳定）。

## 生成管线

```
封面取色（歌词管线 stageLyrics.coverPalette，rgb()/hex 均收）
  → 色板分析：按"饱和度×中亮度"评分选基色；找支持色相（25°~160° 外的第二色相）；
    和声方案（duotone 65% 概率优先 / analogous / complementary / split / triadic / monochrome）；
    基调 tone（ink 素墨 / tinted 轻染 / rich 浓彩，权重 3:4:2.5）
  → 双主题数值设计空间：背景按 tone 的明度/饱和度区间随机；primary/accent/secondary
    各自的饱和度/亮度区间起手，沿亮度轴解 WCAG 对比度地板（primary 9:1、secondary 4.5:1、accent 3.2:1），
    保色相推亮度（adjustLightnessForContrast），不再退化为硬编码黑白
  → 命名：色相桶中文前缀（绯色/琥珀/鎏金/新柳/苔痕/潮汐/深蓝/紫烟/玫影…低饱和走月白/银灰/素墨…）
    × 昼后缀（破晓/晨光/微光/初雪/白昼/浮云/日砂）或夜后缀（子夜/夜色/深潭/暗涌/沉夜/夜航/星屑）
    + " Built-in" 尾标；同色系家族配一句第一人称氛围描述（15~30 字，共 6 家族 × 昼夜 × 5 句）
```

## 昼夜与消费端

- **模式**：`fx.themeMode` ∈ `auto`（跟随本地时间 7:00-19:00 为昼）/ `light` / `dark`，DIY 控制台「主题」seg 切换，`saveLyricLayout` 持久化。
- **消费端**：
  1. 正交背景层（`95-background-runtime` 的 `currentCoverPalette` 委派 `themeServiceActiveTheme()`）——背景拿到的是昼/夜主题色而非原始取色；
  2. 烟纸（`20-fume` `fumeSyncTheme`）：主题色进纸面文字/装饰，纸面底色走 `--theme-bg` CSS 变量（亮主题 = 亮纸暗墨）；排版缓存键含 `theme.name`，主题变化自动整版重排；
  3. CSS 变量 `--theme-bg/--theme-primary/--theme-accent/--theme-secondary` 挂 `:root`，任何 UI/覆盖层可取用（带原暖色兜底）。
- **稳定性纪律**：色板键需**连续两拍（1.2s×2）一致**才重生成——取色管线分步写入 base/primary/secondary 时不翻主题。
- 无封面/纯音乐：不生成（消费端各自回退）；对比度地板在测试中钉死（`tests/duo-theme.test.js`）。

## 文件

| 文件 | 职责 |
| --- | --- |
| `public/js/modules/02-visual/96-theme-service.js` | 色彩数学 + 色板分析 + 双主题生成 + 命名/描述表 + 昼房切换 + CSS 变量 + DIY seg |
| `tests/duo-theme.test.js` | 色彩数学往返 / 分析确定性 / 双主题形状与对比度地板 / 命名描述格式 / 昼房解析 |
