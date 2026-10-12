#!/usr/bin/env node
/**
 * 项目脚本拼接编译检查
 * ---------------------------------------------------------------------------
 * 本项目无构建：public/js/index-loader.js 把 172 个模块并行 fetch 后按清单
 * 顺序 join 成【一个】<script> 注入（index-loader.js:192-195），三大 Pixi 引擎
 * （sonnet/tempera/lumiere-engine.js）则在 public/index.html 尾部以独立
 * <script src='js/modules/...'> 先行加载。两者共享同一全局词法环境——任何
 * 文件引入语法错误、或顶层 const/let/class/function 与其它文件重名，都会在
 * 浏览器里炸掉整条主链，而单测（node 直接 require 单文件）覆盖不到这类
 * 「拼接后」故障。
 *
 * 本工具按真实加载顺序（index.html 的 js/modules/* 引擎 → index-loader 的
 * modulePaths，vendor 一律跳过）拼接全部 175 个项目脚本，用 new vm.Script
 * 做整包语法解析：
 *   - 成功：打印 «COMPILE OK <n> files»，退出码 0；
 *   - 失败（语法错误/顶层标识符重复，vm 对拼接源统一抛 SyntaxError）：
 *     打印出错文件（按行号偏移反查）、错误信息、出错行上下文；重复声明
 *     场景额外列出该标识符的全部声明位置。退出码 1。
 *
 * 用法：node tests/manual/joined-compile.cjs
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC = path.join(ROOT, 'public');
const LOADER = path.join(PUBLIC, 'js', 'index-loader.js');
const INDEX_HTML = path.join(PUBLIC, 'index.html');

/** 从 index-loader.js 源码里抠出 modulePaths 清单（保持声明顺序） */
function readLoaderModulePaths() {
  const text = fs.readFileSync(LOADER, 'utf8');
  const m = text.match(/const modulePaths = \[([\s\S]*?)\];/);
  if (!m) throw new Error('index-loader.js 里找不到 `const modulePaths = [...]`，清单结构变了？');
  const items = (m[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  if (!items.length) throw new Error('index-loader.js 的 modulePaths 解析为空');
  return items;
}

/** 从 index.html 抠出项目模块/引擎 <script src='js/modules/...'>（文档顺序，跳过 vendor） */
function readHtmlProjectScripts() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const out = [];
  const re = /<script\b[^>]*\bsrc=['"]([^'"]+)['"][^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    let src = m[1];
    if (!src.startsWith('js/modules/')) continue; // vendor/*、js/preload-mode.js、loader 自身都不进拼接
    src = src.replace(/\?.*$/, '');              // 去 ?v= cache-bust
    out.push(src);
  }
  return out;
}

function main() {
  // 真实加载顺序：index.html 里引擎 <script> 在 loader 标签之前同步执行，
  // loader 的 172 个模块是 fetch 完成后异步注入——故先引擎、后模块清单。
  const relPaths = [
    ...readHtmlProjectScripts(),
    ...readLoaderModulePaths(),
  ];
  const absPaths = relPaths.map((p) => path.join(PUBLIC, ...p.split('/')));
  const missing = relPaths.filter((_, i) => !fs.existsSync(absPaths[i]));
  if (missing.length) {
    console.error('COMPILE FAIL\n清单里有文件不存在：\n  ' + missing.join('\n  '));
    process.exit(1);
  }

  // 拼接 + 行号偏移表（vm 报的行号是拼接源的，需要反查回文件）
  const parts = [];
  const offsets = []; // { file, abs, startLine } —— 1-based
  let line = 1;
  for (let i = 0; i < absPaths.length; i++) {
    let text = fs.readFileSync(absPaths[i], 'utf8');
    if (!text.endsWith('\n')) text += '\n';
    offsets.push({ file: relPaths[i], abs: absPaths[i], startLine: line });
    parts.push(text);
    line += text.split('\n').length - 1;
  }
  const joined = parts.join('');
  const lines = joined.split('\n');

  let script;
  try {
    script = new vm.Script(joined, { filename: 'joined-mineradio-scripts.js' });
  } catch (e) {
    if (!(e instanceof SyntaxError)) {
      console.error('COMPILE FAIL\n非语法错误：', e && (e.stack || e.message || e));
      process.exit(1);
    }
    console.error('COMPILE FAIL');
    console.error(String(e.message));
    // 行号反查：V8 语法错误帧可能是 joined-mineradio-scripts.js:8123 或 ...:8123:5（列可缺省）
    const lm = String(e.stack || e.message || '').match(/joined-mineradio-scripts\.js:(\d+)(?::\d+)?/);
    if (lm) {
      const errLine = Number(lm[1]);
      const owner = [...offsets].reverse().find((o) => errLine >= o.startLine) || offsets[0];
      const localLine = errLine - owner.startLine + 1;
      console.error(`出错文件：${owner.file}（拼接源第 ${errLine} 行，文件内第 ${localLine} 行）`);
      console.error('上下文：');
      const from = Math.max(0, errLine - 4), to = Math.min(lines.length, errLine + 3);
      for (let i = from; i < to; i++) {
        const mark = (i + 1) === errLine ? '>' : ' ';
        console.error(`  ${mark} ${String(i + 1).padStart(5)} | ${lines[i]}`);
      }
      // 顶层标识符重复场景：列出该标识符在本批文件里的全部声明位置
      const dup = String(e.message).match(/Identifier '(.+?)' has already been declared/);
      if (dup) {
        const id = dup[1];
        const declRe = new RegExp(`\\b(?:const|let|var|function|class)\\s+${id}\\b`);
        console.error(`顶层重复声明 '${id}' 的全部命中位置：`);
        for (let i = 0; i < offsets.length; i++) {
          const text = fs.readFileSync(absPaths[i], 'utf8');
          const ls = text.split('\n');
          for (let j = 0; j < ls.length; j++) {
            if (declRe.test(ls[j])) console.error(`  - ${offsets[i].file}:${j + 1}`);
          }
        }
      }
    } else {
      console.error(e.stack || '(无行号信息)');
    }
    process.exit(1);
  }
  void script;
  console.log(`COMPILE OK ${absPaths.length} files`);
  process.exit(0);
}

main();
