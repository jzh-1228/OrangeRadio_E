# Folia 模式移植管线（.tmp-port）

把 `D:/ZCodeWP/.research/folia-major`（AGPL-3.0，本项目已按 AGPL 合并授权，见 NOTICE.md）
中任意 visualizer 模式的渲染核心，忠实移植为 MineRadio 无构建全局脚本环境的引擎产物。

**管线是模式无关的**：canvas2D / DOM / framer-motion / pretext / Pixi 皆可。
Pixi 引擎类（sonnet/tempera/lumiere）与 DOM 类（classic 试点）走同一条管线，
差异只在 `port-config.json` 里的一段声明。

```
Folia 源码 ──拷贝+依赖闭包自动追──> src/ ──tsc──> out/ ──拓扑拼接+重名安全改名──>
<mode>-engine.js ──finish 后处理──> public/js/modules/<目标>/<mode>-engine.js
```

## 快速开始

```bash
cd .tmp-port
python port-mode.py <mode>        # mode = port-config.json 里的一段
```

产物：`.tmp-port/<mode>-engine.js`；配置了 `deploy.target` 的模式同时落到 public。

## port-config.json 每模式声明

| 字段 | 说明 |
| --- | --- |
| `entryKind: "auto"` | **闭包模式**（Pixi 引擎类）：从 `entryFile` 的入口符号出发自动追相对 import 闭包（`./` `../` 跨目录均可，transitive 自动拷入 src 并 tsc） |
| `entryKind: "files"` | **清单模式**（React 组件树/DOM 类）：Folia 侧渲染核心是 React 组件、无法整体转译落地的，纯逻辑依赖闭包走显式 `files` 清单；React 组件树的 DOM 落地写在 `manualParts` 手工段 |
| `files` / `entryFile` | 上述两种入口（仓库相对路径） |
| `extraShared` | 闭包之外强制拷入的共享文件（一般留空，import 自动追已覆盖） |
| `wrapper.args` | 产物 IIFE 形参按需注入：Pixi 模式 `["PIXI","pretext","env"]`，DOM 模式 `["env"]`，参数名任意 |
| `wrapper.defaults` | 各形参的运行时取值表达式（footer 展开） |
| `exports` | 注入 `env.<symbol>` 的导出（`kind: class\|const\|manual`；manual = 手工段定义的符号） |
| `aliasExports` | 把闭包内符号（即使被重名改名成 `xxx__2`）以稳定别名注入 IIFE 内 + `env.<alias>`，供手工段与测试直接调用 |
| `externalVars` | 外部 shim 包（lucide-react 等）import 就地替换为 var 垫片行（默认表已与已部署产物语义一致，一般不填） |
| `manualParts` | 手工移植段，按序拼在自动段后（Folia 渲染核心的 DOM 落地 / mini-motion） |
| `replacements` | 幂等文本替换对（部署适配，如 `loadPixi()` → 全局 PIXI） |
| `finish` | 产物后处理脚本（部署适配的复杂逻辑，如 tempera 注入 sonnet 滤镜），依次执行 |
| `deploy` | `{target, version}`：直接拷贝到 public 目标路径 |

## 产物结构（以 classic 为例）

```js
// OrangeSea CLASSIC ENGINE (AGPL-3.0, from folia-major) -- no-build bundle
(function (env) {
"use strict";
// ======== utils/glowBlurQuantize ========      ← Folia 纯逻辑闭包（tsc 转译，拓扑序）
// ...（重名顶层符号已按声明文件编号安全改名，import 绑定/对象简写随之改写）
// ======== manual: manual/mini-motion.js ========   ← framer-motion 子集忠实实现
// ======== manual: manual/classic-engine-core.js ==== ← Visualizer.tsx 渲染核心 DOM 落地
var CM_xxx = xxx;  env.CM_xxx = xxx;             ← aliasExports 稳定别名（IIFE 内 + env）
env.ClassicClassicEngine = ...;                  ← exports 注出
})(typeof window !== "undefined" ? window : this);
```

IIFE 包裹 = 零全局泄漏，宿主只见 `env` 上的注出符号（`env.ClassicClassicEngine`、`env.CM_*`）。

## 两类模式的移植范式（后续 10 个模式照此执行）

### A. Pixi 引擎类（参考 sonnet/tempera/lumiere）
1. `entryKind: "auto"` + `entryFile` 指向 `create<Mode>PixiRuntime.ts`；
2. `wrapper.args: ["PIXI","pretext","env"]`；`exports` 声明 Runtime class 与 `compile<Mode>Program`；
3. 需要 finish 脚本做部署适配时写入 `finish`（读 `.tmp-port/<mode>-engine.js`，写回）；
4. 宿主桥 `public/js/modules/10-shell/<n>b-<mode>-engine-bridge.js`：
   数据形状转换（lyricsLines → Folia Line）+ MotionValue duck-type + 主题桥 + 生命周期
   （样本：`26a-sonnet-pixi-bridge.js`）；
5. index.html 在 `js/index-loader.js` 之前加 `<script src='js/modules/<目标>/<mode>-engine.js?v=N'>`。

### B. DOM/React 组件类（试点：classic）
1. `entryKind: "files"`：把 Folia 渲染核心依赖的**纯逻辑闭包**列进 `files`
   （classic = glowBlurQuantize / colorMix / renderHints / graphemeTiming /
   wordSegmentation / cjkSemanticLayout / fontStacks / wordColoring / subtitleFontSizes）；
2. 渲染核心（Visualizer.tsx 组件树）手工落地进 `manualParts`：
   布局/运动/绘制算法与常量与源码**逐函数同构**（每函数标注源文件行号），
   React 生命周期 → 显式引擎实例（`create/destroy/sync`），framer-motion →
   `manual/mini-motion.js`（spring 半隐式欧拉 / keyframes+times / color/filter
   复杂值插值 / variants 三态切换 / transitionEnd，tween 缺省 easeOut 与 framer 一致）；
3. `aliasExports` 把闭包符号以 `CM_*` 别名注出，手工段与测试直接引用（重名改名免疫）；
4. 桥 = `stateVar`/`apply<Mode>Mode(on, opts)` 入口保留（注册表/预设网格/互斥/性能门控全靠它们），
   负责 lyricsLines→Line 数据形状、`getAdjustedLyricPlaybackTime` 时间源 MV、
   `themeOverlayDarkTheme` 主题桥、700ms 轮询 sync（换歌/主题/字号）、destroy；
5. index.html 覆盖层容器 `#<id>-overlay` 保留 + 引擎宿主 `<div id="<id>-engine-host">`；
   `public/css/<id>.css` 只留容器壳（背景/层级/显示切换），**不得持引擎动画类**
   （动画全部 inline style + mini-motion 单主路径）。

## 已验证的等价性（sonnet/tempera/lumiere 回归，2026-10-10）

重跑三链（port-mode → finish → deploy）与已部署产物 diff，差异仅两类、均不改变行为：

1. **transitive 闭包新增死代码段**：`pixiFilterPoolCompat` + `loadPixi`
   （Folia 源码的真实依赖，旧管线靠手工维护 src 漏拷）。finish 的
   `loadPixi()` 调用替换后二者不被调用（已验证：`await Promise.resolve(PIXI)` 存在、
   `await loadPixi()` 0 处、`node --check` 全过）。
2. **tempera 一处 import 形态**：Folia 源码已把 `@chenglou/pretext/rich-inline`
   改为主包 import，tsc 产物随之 `var { layoutWithLines, prepareWithSegments } = pretext`
   （带花括号的标准解构，旧产物为历史源码的无花括号形态）。

其余逐字节一致；public 已部署引擎保持原文件零改动（sonnet deploy 后已 `git checkout` 还原）。

## 已知怪点（保持历史形态，勿“顺手修复”）

- rich-inline 垫片模板 `NAMED:var \1 = pretext` 无花括号——那是旧版产物的历史形态；
  当前源码走主包规则（带花括号），模板保留只为兼容旧快照复现。
- finish 脚本对运行顺序有隐含依赖：`finish-tempera.py` 读 `out/sonnet/…`（滤镜源），
  需先跑过 `python port-mode.py sonnet`。

## 注意事项

- **版权**：所有源自 Folia 的产物/手工段/桥文件头部带
  `// Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted from folia-major (AGPL-3.0)`。
- **无构建纪律**：产物整体在 IIFE 内零全局泄漏；桥（index-loader 清单）是经典 script，
  顶层符号必须带模式前缀（如 `<mode>Xxx`），改动后 `node --check`。
- **测试**：`tests/<mode>.test.js` 覆盖引擎产物加载 / 关键算法（直接调 `env.CM_*`）/ 桥契约 /
  注册接线。样本：`tests/classic.test.js`。
- **探针**：`node tests/manual/mode-visual-probe.cjs <modeId>` 真机放歌验收；
  原版对照图 `.tmp-folia-modes/<id>.png` 与 `<id>-panel.png`。
- tsc 的类型错误是 non-fatal（src 内可能缺 Folia 仓库级类型文件，运行时行为不受影响）。
