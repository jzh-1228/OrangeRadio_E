# 通用移植管线：mode 目录 + 依赖闭包 → tsc → 拓扑拼接 → 部署适配
# 用法: python port-mode.py tempera
import re, os, glob, sys, subprocess, shutil, json

MODE = sys.argv[1] if len(sys.argv) > 1 else 'tempera'
RESEARCH = 'D:/ZCodeWP/.research/folia-major/src'
SRC = f'src'          # .tmp-port/src（已含 sonnet 全量 + utils）
OUT = 'out'

# 1) 拷模式目录 + 新发现的依赖
def cp(rel):
    s = os.path.join(RESEARCH, rel)
    d = os.path.join('src', rel)
    if os.path.isdir(s):
        if os.path.exists(d): shutil.rmtree(d)
        shutil.copytree(s, d)
    else:
        os.makedirs(os.path.dirname(d), exist_ok=True)
        shutil.copy(s, d)

cp(f'components/visualizer/{MODE}')  # 目录
# 共享依赖（tempera/lumiere 需要）
for extra in ['components/visualizer/colorMix.ts', 'components/visualizer/wordColoring.ts',
              'services/temperaLayerImages.ts']:
    if os.path.exists(os.path.join(RESEARCH, extra)):
        cp(extra)

# 2) tsc
r = subprocess.run('tsc -p tsconfig.json', shell=True, capture_output=True, text=True)
errs = r.stderr.count('error')
print('tsc errors (non-fatal):', errs)

# 3) 拓扑拼接（只收本模式闭包）
files = {}
for p in glob.glob('out/**/*.js', recursive=True):
    rel = os.path.relpath(p, OUT).replace(os.sep, '/').replace('.js', '')
    files[rel] = open(p, encoding='utf-8').read()

def deps_of(rel):
    out = []
    for m in re.finditer(r"import[^'\"]*from\s*'(\.{1,2}/[^']*)'", files[rel]):
        tgt = os.path.normpath(os.path.join(os.path.dirname(rel), m.group(1))).replace(os.sep, '/')
        if tgt in files and tgt != rel:
            out.append(tgt)
    return out

# 收集模式闭包
entry = f'components/visualizer/{MODE}/create{MODE[0].upper()}{MODE[1:]}PixiRuntime'
if entry not in files:
    cand = [k for k in files if f'/{MODE}/create' in k and 'Runtime' in k]
    entry = cand[0] if cand else entry
print('entry:', entry)
closure = set()
def collect(rel):
    if rel in closure: return
    closure.add(rel)
    for d in deps_of(rel): collect(d)
collect(entry)
# 跨目录共享模块（colorMix 经 '../colorMix' 引用，deps_of 已解析并把它们带进闭包——
# 但若 entry 文件的 import 被 strip 顺序影响，兜底显式纳入）
for shared in ['components/visualizer/colorMix', 'components/visualizer/wordColoring']:
    if shared in files and shared not in closure and any(shared in deps_of(c) for c in closure):
        collect(shared)
order = []
def visit(rel):
    if rel in order: return
    for d in deps_of(rel): visit(d)
    order.append(rel)
for f in sorted(closure): visit(f)
print('closure size:', len(order))

# 重名处理
decl = {}
for rel in order:
    for m in re.finditer(r'^(?:export )?(?:async )?(?:function|const|let|class) (\w+)', files[rel], re.M):
        decl.setdefault(m.group(1), []).append(rel)
dupes = {k for k, v in decl.items() if len(v) > 1}
print('dupes:', sorted(dupes)[:8])

# —— 跨文件一致的改名：先记录 import 绑定（本地名 → 源模块），再分配唯一名 ——
# 符号真名：file_key(rel, name) = 唯一标识；decl_owner[(name, rel)] 分配 name__N
# 引用解析：文件里名字 X → 若 import 自 S 则 S 的 X，否则本文件的 X
import_bindings = {}   # rel -> {local: source_module_key}
for rel in order:
    binds = {}
    for m in re.finditer(r"import\s*\{([^}]*)\}\s*from\s*'(\.{1,2}/[^']*)'", files[rel]):
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
                binds[local] = (tgt, orig)
    import_bindings[rel] = binds

# 唯一名分配：dupes 符号按 (声明文件) 编号
unique_name = {}   # (rel, name) -> new name
counters = {}
for rel in order:
    for m in re.finditer(r'^(?:export )?(?:async )?(?:function|const|let|class) (\w+)', files[rel], re.M):
        name = m.group(1)
        if name not in dupes: continue
        counters[name] = counters.get(name, 0) + 1
        unique_name[(rel, name)] = name + '__' + str(counters[name]) if counters[name] > 1 or True else name

def resolve_target(rel, name):
    """文件 rel 里的裸名 name 解析到声明（文件, 名）→ 唯一名。"""
    b = import_bindings.get(rel, {}).get(name)
    if b: return unique_name.get((b[0], b[1]), name)
    return unique_name.get((rel, name), name)

chunks = ['// OrangeSea ' + MODE.upper() + ' ENGINE (AGPL-3.0, from folia-major) -- no-build bundle',
          '(function (PIXI, pretext, env) {', '"use strict";']
for rel in order:
    src = files[rel]
    src = re.sub(r"^import\s+type[^;]*;?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import\s*\{[^}]*\}\s*from\s*'(\.{1,2}/[^']*)';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import\s*\{[^}]*\}\s*from\s*'(\.{3}/[^']*)';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import\s*\*\s*as\s+(\w+)\s+from\s*'pixi\.js';?\s*$", r'var \1 = PIXI;', src, flags=re.M)
    src = re.sub(r"^import\s*\{([^}]*)\}\s*from\s*'pixi\.js';?\s*$",
                 lambda m: 'var ' + m.group(1).replace(' as ', ': ') + ' = PIXI;', src, flags=re.M)
    src = re.sub(r"^import\s*\{([^}]*)\}\s*from\s*'@chenglou/pretext';?\s*$",
                 lambda m: 'var ' + m.group(1).replace(' as ', ': ') + ' = pretext;', src, flags=re.M)
    src = re.sub(r"^import\s+type\s*\{[^}]*\}\s*from\s*'[^']*';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import\s*\{([^}]*)\}\s*from\s*'@chenglou/pretext/rich-inline';?\s*$",
                 lambda m: 'var ' + m.group(1).replace(' as ', ': ') + ' = pretext;', src, flags=re.M)
    src = re.sub(r"^import[^;]*from\s*'framer-motion';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import[^;]*from\s*'react';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import[^;]*from\s*'\.\./\.\./\.\./types';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import[^;]*from\s*'(\.\./)+tuningRegistry';?\s*$",
                 'var defineVisualizerTuning = function (x) { return x; };', src, flags=re.M)
    src = re.sub(r"^import[^;]*from\s*'(\.\./)+sonnet/[^']*';?\s*$", '', src, flags=re.M)  # 跨模式（lens/print 滤镜）后处理注入
    src = re.sub(r"^export \{([^}]*)\} from.*$", '', src, flags=re.M)
    src = re.sub(r"^export \{[^}]*\};?\s*$", '', src, flags=re.M)
    src = re.sub(r'^export (async function)', r'\1', src, flags=re.M)
    src = re.sub(r'^export (function)', r'\1', src, flags=re.M)
    src = re.sub(r'^export const', 'const', src, flags=re.M)
    src = re.sub(r'^export let', 'let', src, flags=re.M)
    src = re.sub(r'^export class', 'class', src, flags=re.M)
    src = re.sub(r'^export default\s+(\w+);?', r'var __default = \1;', src, flags=re.M)
    # 重名符号替换（属性名安全版）：
    # 1) 对象字面量简写 { name, / { name } → { name: <目标名>,（key 保持原名，Pixi 等 API 按 key 取值）
    # 2) 全局裸名替换时跳过 key 位（后随 : 的位置）——`vertex: vertex__2` 的 key 不改
    for name in sorted(dupes, key=len, reverse=True):
        tgt = resolve_target(rel, name)
        if tgt == name:
            continue
        # 简写属性 → 显式（key 原名 : 目标名）
        src = re.sub(r'([{,]\s*)' + name + r'(\s*[,}])',
                     lambda mm, _t=tgt: mm.group(1) + name + ': ' + _t + mm.group(2), src)
        # 裸名 → 目标名；后随 : 的 key 位除外（含上一步产出的显式 key）
        src = re.sub(r'(?<![\w.$])' + name + r'(?![\w$])(?!\s*:)',
                     lambda mm, _t=tgt: _t, src)
    chunks.append('// ======== ' + rel + ' ========')
    chunks.append(src)

# 跨模式符号（sonnet 滤镜）注入占位——sonnet 引擎 bundle 已先行加载则直接取
chunks.append('''
// 跨模式符号：tempera 复用 sonnet 的滤镜（引擎 bundle 全局先行加载）
var TemperaLensFilterMixin = null;   // 占位：actual classes injected via window.__sonnetFilters if present
''')
rtclass = None
for rel in order:
    m = re.search(r'class (\w*PixiRuntime)', files[rel])
    if m: rtclass = m.group(1); break
print('runtime class:', rtclass)
# 通用别名 re-export 注入：export { X as Y }(from './z') → var Y = <resolved X>
alias_injections = []
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
chunks.append(f'env.{rtclass} = (typeof {rtclass} !== "undefined") ? {rtclass} : null;')
# program 编译器导出（compileXxxProgram）
comp = None
for rel in order:
    m2 = re.search(r'const (compile\w*Program)', files[rel])
    if m2: comp = m2.group(1); break
print('program compiler:', comp)
if comp:
    chunks.append(f'env.{comp} = (typeof {comp} !== "undefined") ? {comp} : null;')
chunks.append('})(typeof PIXI !== "undefined" ? PIXI : null, typeof pretext !== "undefined" ? pretext : null, typeof window !== "undefined" ? window : this);')
blob = '\n'.join(chunks)
blob = re.sub(r"^import\s+'[^']+';?\s*$", '', blob, flags=re.M)
open(f'{MODE}-engine.js', 'w', encoding='utf-8', newline='\n').write(blob)
print('engine:', len(blob), 'bytes')
