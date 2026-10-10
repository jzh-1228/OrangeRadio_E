import re, os, glob

files = {}
for p in glob.glob('out/**/*.js', recursive=True):
    rel = os.path.relpath(p, 'out').replace(os.sep, '/').replace('.js', '')
    files[rel] = open(p, encoding='utf-8').read()

def deps(rel):
    out = []
    for m in re.finditer(r"import[^'\"]*from\s*'(\./[^']*)'", files[rel]):
        tgt = os.path.normpath(os.path.join(os.path.dirname(rel), m.group(1))).replace(os.sep, '/')
        if tgt in files and tgt != rel:
            out.append(tgt)
    return out

order, seen = [], set()
def visit(rel):
    if rel in seen: return
    seen.add(rel)
    for d in deps(rel):
        visit(d)
    order.append(rel)
for f in sorted(files): visit(f)
print('topo order:', len(order))

decl = {}
for rel in order:
    for m in re.finditer(r'^(?:export )?(?:async )?(?:function|const|let|class) (\w+)', files[rel], re.M):
        decl.setdefault(m.group(1), []).append(rel)
dupes = {k: v for k, v in decl.items() if len(v) > 1}
print('dupes:', list(dupes.keys())[:10])

# 重名冲突处理：每个重名标识符只在「首个声明文件」保留原名，后续文件内
# 声明+引用都改为 <name>__<n>（同文件作用域替换，跨文件引用经 import 已并入同作用域）
import collections
owner = {}
counter = collections.defaultdict(int)
rename_by_file = {}
for rel in order:
    ren = {}
    for m in re.finditer(r'^(?:export )?(?:async )?(?:function|const|let|class) (\w+)', files[rel], re.M):
        name = m.group(1)
        if name in dupes:
            if name not in owner:
                owner[name] = rel
            elif owner[name] != rel:
                counter[name] += 1
                ren[name] = name + '__' + str(counter[name])
    if ren:
        rename_by_file[rel] = ren

chunks = ['// OrangeSea SONNET-PORTEE (AGPL-3.0, from folia-major) -- no-build bundle',
          '(function (PIXI, pretext, env) {', '"use strict";']
for rel in order:
    src = files[rel]
    src = re.sub(r"^import\s+type[^;]*;?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import\s*\{[^}]*\}\s*from\s*'(\./[^']*)';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import\s+type\s*\{[^}]*\}\s*from\s*'[^']*';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import[^;]*from\s*'pixi\.js';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import[^;]*from\s*'@chenglou/pretext';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import[^;]*from\s*'framer-motion';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import[^;]*from\s*'lucide-react';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import[^;]*from\s*'react-dom/server';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import[^;]*from\s*'react';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import[^;]*from\s*'\.\./\.\./\.\./types';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import\s*\{[^}]*\}\s*from\s*'\.\./\.\./\.\./utils/[^']*';?\s*$", '', src, flags=re.M)
    src = re.sub(r"^import\s*\{[^}]*\}\s*from\s*'\.\./[^']*';?\s*$", '', src, flags=re.M)
    src = re.sub(r'^export \{([^}]*)\} from.*$', '', src, flags=re.M)
    src = re.sub(r'^export (async function)', r'\1', src, flags=re.M)
    src = re.sub(r'^export (function)', r'\1', src, flags=re.M)
    src = re.sub(r'^export const', 'const', src, flags=re.M)
    src = re.sub(r'^export let', 'let', src, flags=re.M)
    src = re.sub(r'^export class', 'class', src, flags=re.M)
    src = re.sub(r'^export default', '// default export:', src, flags=re.M)
    ren = rename_by_file.get(rel)
    if ren:
        # 词边界替换（跳过字符串/注释的风险可接受：标识符形如 tracePolygon 足够特异）
        for old_name, new_name in ren.items():
            src = re.sub(r'(?<![\w.$])' + old_name + r'(?![\w$])', new_name, src)
    chunks.append('// ======== ' + rel + ' ========')
    chunks.append(src)
chunks.append('env.SonnetPixiRuntime = (typeof SonnetPixiRuntime !== "undefined") ? SonnetPixiRuntime : null;')
chunks.append('env.compileSonnetProgram = (typeof compileSonnetProgram !== "undefined") ? compileSonnetProgram : null;')
chunks.append('})(typeof PIXI !== "undefined" ? PIXI : null, typeof pretext !== "undefined" ? pretext : null, typeof window !== "undefined" ? window : this);')
blob = '\n'.join(chunks)
open('sonnet-engine.js', 'w', encoding='utf-8', newline='\n').write(blob)
print('engine:', len(blob), 'bytes')
