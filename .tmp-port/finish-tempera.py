import re
src = open('tempera-engine.js', encoding='utf-8').read()
# 1) loadPixi 适配
src = src.replace('const pixi = await loadPixi();', 'const pixi = await Promise.resolve(PIXI);', 1)
# 2) 注入 sonnet 滤镜（重名 vertex/fragment 预改名）
if 'function createSonnetLensFilter' not in src and 'const createSonnetLensFilter' not in src:
    def strip_esm(s):
        s = re.sub(r'^import\s+type[^;]*;?\s*$', '', s, flags=re.M)
        s = re.sub(r"^import\s*\{[^}]*\}\s*from\s*'(\.{1,2}/[^']*)';?\s*$", '', s, flags=re.M)
        s = re.sub(r'^export (async )?function', r'\1function', s, flags=re.M)
        s = re.sub(r'^export const', 'const', s, flags=re.M)
        return s
    # 滤镜源文件重名预防（vertex/fragment 是 GLSL 模板名，跨段冲突）
    lens = strip_esm(open('out/sonnet/sonnetLensFilter.js', encoding='utf-8').read())
    pf = strip_esm(open('out/sonnet/sonnetPrintFilters.js', encoding='utf-8').read())
    lens = re.sub(r'(?<![\w.$])vertex(?![\w$])', 'vertexL', lens)
    lens = re.sub(r'(?<![\w.$])fragment(?![\w$])', 'fragmentL', lens)
    pf = re.sub(r'(?<![\w.$])vertex(?![\w$])', 'vertexP', pf)
    pf = re.sub(r'(?<![\w.$])fragment(?![\w$])', 'fragmentP', pf)
    inj = '\n// ======== sonnetLensFilter/sonnetPrintFilters（tempera 后期复用，vertex/fragment 防冲突改名） ========\n' + lens + '\n' + pf + '\n'
    src = src.replace('})(typeof PIXI', inj + '})(typeof PIXI', 1)
open('tempera-engine.js', 'w', encoding='utf-8', newline='\n').write(src)
print('tempera finished:', len(src))
