# -*- coding: utf-8 -*-
# 通用移植管线（模式无关）：Folia 模式目录 + 依赖闭包 → tsc → 拓扑拼接 → 后处理
#
# 用法:  python port-mode.py <mode>       # mode 取 port-config.json 里的一段
#
# 每个模式在 port-config.json 里声明：
#   entryKind: "auto"  —— 从 entryFile 的 export 符号出发自动追依赖闭包（Pixi 引擎类模式）
#              "files" —— 显式文件清单（React 组件树模式：渲染核心手工落地，纯逻辑闭包走清单）
#   files / entryFile        上述两种入口
#   extraShared              闭包之外强制拷入并 tsc 的共享文件（一般留空，import 自动追）
#   wrapper.args/defaults    产物 IIFE 的形参按需注入（PIXI/pretext/env 皆可，参数名任意）
#   exports                  注入 env.<symbol> 的导出（kind: class|const|manual）
#   aliasExports             把闭包内符号（即使被重名改名）以稳定别名注入 env.<alias>
#   manualParts              手工移植段（Folia 渲染核心的 DOM 落地），按序拼在自动段后
#   finish                   产物后处理（部署适配）脚本，依次执行
#
# 闭包规则：从入口（或清单文件）出发解析相对 import（./ ../ 均可，跨目录自动
# 拷入），拓扑排序后拼接；重名顶层符号按声明文件编号安全改名，import 绑定
# 与对象简写属性随之改写；export { A as B } 以别名注入恢复绑定。
# 外部依赖（pixi.js / pretext / …）按 wrapper.args 与 EXTERNAL_TABLE 映射，
# react / framer-motion / 类型 import 一律剥除（React 宿主职责由桥接管）。

import re, os, glob, sys, subprocess, shutil, json

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

MODE = sys.argv[1] if len(sys.argv) > 1 else ''
CONFIG_PATH = 'port-config.json'
with open(CONFIG_PATH, encoding='utf-8') as f:
    CONFIG = json.load(f)
if not MODE or MODE.startswith('_') or MODE not in CONFIG:
    print('usage: python port-mode.py <mode>   modes: ' +
          ', '.join(k for k in CONFIG if not k.startswith('_')))
    sys.exit(2)
CFG = CONFIG[MODE]

RESEARCH = 'D:/ZCodeWP/.research/folia-major/src'
SRC = 'src'          # .tmp-port/src（模式目录 + 依赖闭包的工作副本）
OUT = 'out'

# wrapper 形参 → 外部模块名的缺省映射（import * as X from 'pixi.js' → var X = PIXI）
WRAPPER = CFG.get('wrapper', {})
ARG_NAMES = WRAPPER.get('args', ['env'])
ARG_DEFAULTS = WRAPPER.get('defaults', {
    'env': 'typeof window !== "undefined" ? window : this'
})
# 外部模块处理表：'ARG:<name>' 用 wrapper 形参；'NAMED:<js>' 用模板（\1=导入名列表）；
# 键支持子路径（如 '@chenglou/pretext/rich-inline'，长键优先匹配）。
_EXTERNAL_ARG = {a: a for a in ARG_NAMES}
EXTERNAL_TABLE = {
    'pixi.js': 'ARG:PIXI' if 'PIXI' in _EXTERNAL_ARG else None,
    '@chenglou/pretext': 'ARG:pretext' if 'pretext' in _EXTERNAL_ARG else None,
    # rich-inline 垫片沿用既有部署产物的展开形态（历史一致优先）；
    # 必须带 {} 解构——`var a, b = pretext` 会把两个名字都赋成整个 pretext 对象，
    # 调用即 "prepareRichInline is not a function"（monet 真机/测试双挂的根因）
    '@chenglou/pretext/rich-inline': 'NAMED:var { \\1 } = pretext',
}
EXTERNAL_TABLE.update({k: v for k, v in CFG.get('externalTable', {}).items()})

# 外部框架 import：剥除（产物不消费 React/framer，宿主职责在桥）
STRIP_PACKAGES = ['framer-motion', 'react', 'react-i18next']
# 外部 shim import：就地替换为 var 垫片行（默认值与部署版 finish 语义逐字一致；
# 模板可用 \1 引用 star-import 本地名）。配置可按包名覆盖。
EXTERNAL_VAR_DEFAULTS = {
    'lucide-react': r'var \1 = (typeof \1 !== "undefined") ? \1 : {};',
    'react-dom/server': "var renderToStaticMarkup = (typeof renderToStaticMarkupShim !== 'undefined') ? renderToStaticMarkupShim : function(){ return ''; };",
}
EXTERNAL_VAR = {**EXTERNAL_VAR_DEFAULTS, **CFG.get('externalVars', {})}

# ------------------------------------------------------------------
# 1) 拷模式目录 / 清单文件 + 依赖闭包自动拷入
# ------------------------------------------------------------------

def cp(rel):
    s = os.path.join(RESEARCH, rel)
    d = os.path.join(SRC, rel)
    if os.path.isdir(s):
        if os.path.exists(d): shutil.rmtree(d)
        shutil.copytree(s, d)
    else:
        os.makedirs(os.path.dirname(d), exist_ok=True)
        shutil.copy(s, d)

def resolve_import(rel, spec):
    """把 rel 文件里的相对 import 规格解析成仓库相对路径（带扩展名尝试）。
    候选顺序与 TypeScript 一致：先同名文件（.ts/.tsx/.js）再同名目录/index——
    folia src 同时存在 types.ts 与 types/ 目录，目录优先会把 `../../../types`
    误解析成目录而漏拷 types.ts（其常量就丢了）。"""
    tgt = os.path.normpath(os.path.join(os.path.dirname(rel), spec)).replace(os.sep, '/')
    for cand in (tgt + '.ts', tgt + '.tsx', tgt + '.js', tgt, tgt + '/index.ts'):
        if os.path.exists(os.path.join(RESEARCH, cand)):
            return cand
    return None

def transitive_copy(seeds):
    """从种子文件出发按源码相对 import 自动拷入依赖（跨目录闭包，替代硬编码共享清单）。"""
    seen = set()
    stack = list(seeds)
    while stack:
        rel = stack.pop()
        if rel in seen:
            continue
        seen.add(rel)
        cp(rel)
        try:
            text = open(os.path.join(RESEARCH, rel), encoding='utf-8').read()
        except OSError:
            continue
        for m in re.finditer(r"(?:import|export)[^'\"]*from\s*'(\.{1,2}/[^']*)'", text):
            dep = resolve_import(rel, m.group(1))
            if dep and dep not in seen:
                stack.append(dep)

if CFG.get('entryKind') == 'files':
    transitive_copy(CFG['files'])
else:
    cp(os.path.dirname(CFG['entryFile']))   # 模式目录整体（含 debug/辅助文件）
    transitive_copy([CFG['entryFile']])

for extra in CFG.get('extraShared', []):
    if os.path.exists(os.path.join(RESEARCH, extra)):
        cp(extra)

# tsc 转译（类型错误不致命——src 内可能缺 Folia 仓库级类型文件，运行时行为不受影响）
r = subprocess.run('tsc -p tsconfig.json', shell=True, capture_output=True, text=True)
print('tsc errors (non-fatal):', r.stderr.count('error'))

# ------------------------------------------------------------------
# 2) 读 out/ 全部转译产物
# ------------------------------------------------------------------
files = {}
for p in glob.glob(OUT + '/**/*.js', recursive=True):
    rel = os.path.relpath(p, OUT).replace(os.sep, '/').replace('.js', '')
    files[rel] = open(p, encoding='utf-8').read()

def deps_of(rel):
    out = []
    for m in re.finditer(r"(?:import|export)[^'\"]*from\s*'(\.{1,2}/[^']*)'", files[rel]):
        tgt = os.path.normpath(os.path.join(os.path.dirname(rel), m.group(1))).replace(os.sep, '/')
        if tgt in files and tgt != rel:
            out.append(tgt)
    return out

# ------------------------------------------------------------------
# 3) 收集模式闭包（entryKind=files 用清单；auto 从入口文件追）
# ------------------------------------------------------------------
if CFG.get('entryKind') == 'files':
    closure = set()
    for rel in CFG['files']:
        rel_n = rel.replace('.ts', '')
        if rel_n in files:
            collect_stack = [rel_n]
            while collect_stack:
                cur = collect_stack.pop()
                if cur in closure or cur not in files:
                    continue
                closure.add(cur)
                collect_stack.extend(deps_of(cur))
    order = []
    def visit(rel):
        if rel in order: return
        for d in deps_of(rel): visit(d)
        order.append(rel)
    for f in sorted(closure): visit(f)
else:
    entry = CFG['entryFile'].replace('.ts', '')
    if entry not in files:
        cand = [k for k in files if '/' + MODE + '/create' in k and 'Runtime' in k]
        entry = cand[0] if cand else entry
    print('entry:', entry)
    closure = set()
    def collect(rel):
        if rel in closure: return
        closure.add(rel)
        for d in deps_of(rel): collect(d)
    collect(entry)
    order = []
    def visit(rel):
        if rel in order: return
        for d in deps_of(rel): visit(d)
        order.append(rel)
    for f in sorted(closure): visit(f)
print('closure size:', len(order))

# ------------------------------------------------------------------
# 4) 重名处理：跨文件一致改名（import 绑定感知 + 对象简写属性安全）
# ------------------------------------------------------------------
decl = {}
for rel in order:
    for m in re.finditer(r'^(?:export )?(?:async )?(?:function|const|let|class) (\w+)', files[rel], re.M):
        decl.setdefault(m.group(1), []).append(rel)
dupes = {k for k, v in decl.items() if len(v) > 1}
print('dupes:', sorted(dupes)[:8])

import_bindings = {}   # rel -> {local: (source_module, orig_name)}
for rel in order:
    binds = {}
    for m in re.finditer(r"(?:import|export)\s*\{([^}]*)\}\s*from\s*'(\.{1,2}/[^']*)'", files[rel]):
        names, mod = m.group(1), m.group(2)
        tgt = os.path.normpath(os.path.join(os.path.dirname(rel), mod)).replace(os.sep, '/')
        if tgt in files:
            for part in names.split(','):
                part = part.strip()
                if not part: continue
                if ' as ' in part:
                    orig, local = [x.strip() for x in part.split(' as ')]
                else:
                    local = orig = part
                if local not in binds:
                    binds[local] = (tgt, orig)
    import_bindings[rel] = binds

unique_name = {}
counters = {}
for rel in order:
    for m in re.finditer(r'^(?:export )?(?:async )?(?:function|const|let|class) (\w+)', files[rel], re.M):
        name = m.group(1)
        if name not in dupes: continue
        counters[name] = counters.get(name, 0) + 1
        unique_name[(rel, name)] = name + '__' + str(counters[name])

def resolve_target(rel, name):
    """文件 rel 里的裸名 name 解析到声明（文件, 名）→ 唯一名。"""
    b = import_bindings.get(rel, {}).get(name)
    if b: return unique_name.get((b[0], b[1]), name)
    return unique_name.get((rel, name), name)

# ------------------------------------------------------------------
# 5) 拼接：header + IIFE + 闭包段 + manualParts + prologue + alias + exports + footer
# ------------------------------------------------------------------
chunks = ['// OrangeSea ' + MODE.upper() + ' ENGINE (AGPL-3.0, from folia-major) -- no-build bundle',
          '(function (' + ', '.join(ARG_NAMES) + ') {', '"use strict";']

for rel in order:
    src = files[rel]
    src = re.sub(r"^import\s+type[^;]*;?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import\s*\{[^}]*\}\s*from\s*'(\.{1,2}/[^']*)';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import\s+type\s*\{[^}]*\}\s*from\s*'[^']*';?\s*$", '', src, flags=re.M)
    # 外部模块 → wrapper 形参或模板（键按长度降序，子路径优先命中）
    for pkg in sorted(EXTERNAL_TABLE, key=len, reverse=True):
        rule = EXTERNAL_TABLE[pkg]
        if not rule: continue
        pat = r"^import\s*\*\s*as\s+(\w+)\s+from\s*'" + re.escape(pkg) + r"';?\s*$"
        patn = r"^import\s*\{([^}]*)\}\s*from\s*'" + re.escape(pkg) + r"';?\s*$"
        if rule.startswith('ARG:'):
            argname = rule[4:]
            src = re.sub(pat, r'var \1 = ' + argname + ';', src, flags=re.M)
            src = re.sub(patn, lambda m, _a=argname: 'var { ' + m.group(1) + ' } = ' + _a + ';', src, flags=re.M)
        elif rule.startswith('NAMED:'):
            tpl = rule[6:]
            src = re.sub(patn, lambda m, _t=tpl: _t.replace('\\1', m.group(1)) + ';', src, flags=re.M)
    for pkg in STRIP_PACKAGES:
        src = re.sub(r"^import[^;]*from\s*'" + re.escape(pkg) + r"';?\s*$", '', src, flags=re.M)
    # 外部 shim 包：star import → var 垫片；具名 import → 固定垫片行（就地替换，原位置不变）
    for pkg, tpl in EXTERNAL_VAR.items():
        src = re.sub(r"^import\s*\*\s*as\s+(\w+)\s+from\s*'" + re.escape(pkg) + r"';?\s*$",
                     lambda m, _t=tpl: _t.replace('\\1', m.group(1)), src, flags=re.M)
        src = re.sub(r"^import[^;]*from\s*'" + re.escape(pkg) + r"';?\s*$",
                     lambda m, _t=tpl: _t.replace('\\1', 'default'), src, flags=re.M)
    src = re.sub(r"^import[^;]*from\s*'(\.\./)+types';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import[^;]*from\s*'(\.\./)+tuningRegistry';?\s*$",
                 'var defineVisualizerTuning = function (x) { return x; };', src, flags=re.M)
    # 兜底：指向闭包外相对目标的 import 一律剥除（跨模式共享符号由 prologue/finish 注入）
    def _strip_unresolved(m):
        spec = m.group(1)
        tgt = os.path.normpath(os.path.join(os.path.dirname(rel), spec)).replace(os.sep, '/')
        for cand in (tgt, tgt + '.js', tgt + '/index'):
            if cand in files:
                return m.group(0)
        return ''
    src = re.sub(r"^import[^;]*from\s*'(\.{1,2}/[^']*)';?\s*$", _strip_unresolved, src, flags=re.M)
    src = re.sub(r"^export \{([^}]*)\} from.*$", '', src, flags=re.M)
    src = re.sub(r"^export \{[^}]*\};?\s*$", '', src, flags=re.M)
    src = re.sub(r'^export (async function)', r'\1', src, flags=re.M)
    src = re.sub(r'^export (function)', r'\1', src, flags=re.M)
    src = re.sub(r'^export const', 'const', src, flags=re.M)
    src = re.sub(r'^export let', 'let', src, flags=re.M)
    src = re.sub(r'^export (var)', r'\1', src, flags=re.M)   # TS enum 产出形态
    src = re.sub(r'^export class', 'class', src, flags=re.M)
    src = re.sub(r'^export default\s+(\w+);?', r'var __default = \1;', src, flags=re.M)
    # 重名符号替换（key 位保护：`{ name: 目标名 }` 的 key 不改）
    for name in sorted(dupes, key=len, reverse=True):
        tgt = resolve_target(rel, name)
        if tgt == name:
            continue
        src = re.sub(r'([{,]\s*)' + name + r'(\s*[,}])',
                     lambda mm, _t=tgt: mm.group(1) + name + ': ' + _t + mm.group(2), src)
        src = re.sub(r'(?<![\w.$])' + name + r'(?![\w$])(?!\s*:)',
                     lambda mm, _t=tgt: _t, src)
    chunks.append('// ======== ' + rel + ' ========')
    chunks.append(src)

# 手工段（Folia 渲染核心的宿主落地：mini-motion / DOM 核心）
for part in CFG.get('manualParts', []):
    p = os.path.join(HERE, part)
    chunks.append('// ======== manual: ' + part + ' ========')
    chunks.append(open(p, encoding='utf-8').read())

# prologue（跨模式符号占位等）
for line in CFG.get('prologue', []):
    chunks.append(line)

# aliasExport 注入：即使符号被重名改名，也以稳定别名暴露（手工段/测试直接引用）
alias_injections = []
for a in CFG.get('aliasExports', []):
    resolved = resolve_target(a['from'], a['orig'])
    alias_injections.append('var ' + a['alias'] + ' = ' + resolved + ';')
# 通用别名 re-export 注入：export { X as Y }(from './z') → var Y = <resolved X>
for rel in order:
    for m3 in re.finditer(r"^export\s*\{([^}]*)\}(?:\s*from\s*'[^']*')?;?\s*$", files[rel], re.M):
        for part in m3.group(1).split(','):
            part = part.strip()
            if ' as ' in part:
                orig, alias = [x.strip() for x in part.split(' as ')]
                resolved = resolve_target(rel, orig)
                inj = 'var ' + alias + ' = ' + resolved + ';'
                if inj not in alias_injections:
                    alias_injections.append(inj)
print('alias injections:', len(alias_injections))
for inj in alias_injections:
    chunks.append(inj)
    # 同步注到 env（wrapper 只有一个 env 形参时宿主/测试可直达闭包符号）
    m_alias = re.match(r'^var (\w+) = ', inj)
    if m_alias:
        chunks.append('env.' + m_alias.group(1) + ' = ' + m_alias.group(1) + ';')

# exports 注入：env.<symbol>
for ex in CFG.get('exports', []):
    sym = ex['symbol']
    chunks.append('env.' + sym + ' = (typeof ' + sym + ' !== "undefined") ? ' + sym + ' : null;')

# footer：wrapper 形参缺省值按配置展开
defaults_src = ', '.join(ARG_DEFAULTS.get(a, 'undefined') for a in ARG_NAMES)
chunks.append('})(' + defaults_src + ');')
blob = '\n'.join(chunks)
blob = re.sub(r"^import\s+'[^']+';?\s*$", '', blob, flags=re.M)
# 幂等替换对（部署适配的文本级适配，如 loadPixi → 全局 PIXI）
for rep in CFG.get('replacements', []):
    blob = blob.replace(rep[0], rep[1], 1)
open(MODE + '-engine.js', 'w', encoding='utf-8', newline='\n').write(blob)
print('engine:', len(blob), 'bytes')

# ------------------------------------------------------------------
# 6) finish 后处理（部署适配脚本，按配置依次执行）
# ------------------------------------------------------------------
for script in CFG.get('finish', []):
    rr = subprocess.run('python ' + script, shell=True, capture_output=True, text=True)
    print('[' + script + ']', rr.stdout.strip(), rr.stderr.strip()[:400])

# ------------------------------------------------------------------
# 7) deploy（配置了 deploy.target 时直接落到 public）
# ------------------------------------------------------------------
dep = CFG.get('deploy')
if dep:
    target = os.path.join('..', dep['target'])
    os.makedirs(os.path.dirname(target), exist_ok=True)
    shutil.copyfile(MODE + '-engine.js', target)
    print('deployed →', dep['target'], 'v=' + str(dep.get('version', 1)))
