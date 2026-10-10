# 引擎部署后处理（幂等）：bundle.py 产物 → public 适配版
import re

src = open('.tmp-port/sonnet-engine.js', encoding='utf-8').read()

# 裸副作用 import 剥除
src = re.sub(r"^import\s+'[^']+';?\s*$", '', src, flags=re.M)
# tuning 注册器残段删除
src = re.sub(r'// default export: defineVisualizerTuning\(\{[\s\S]*?\}\);',
             '// tuning 注册器——本项目 tuning 由 26a 桥直供，略', src, count=1)
# loadPixi → 全局 PIXI
src = src.replace('const pixi = await loadPixi();', 'const pixi = await Promise.resolve(PIXI);', 1)
# lucide/react → 垫片
src = src.replace('const markup = renderToStaticMarkup(React.createElement(Icon, {', 'const markup = renderToStaticMarkupShim(Icon({', 1)

# re-export 别名注入（export { A as B } from './x' 的绑定恢复）
injections = []
for orig, alias in [
    ('destroyPixiContainerChildren', 'destroySonnetContainerChildren'),
    ('destroyPixiDisplayTree', 'destroySonnetDisplayTree'),
    ('unloadPixiDisplayTree', 'unloadSonnetDisplayTree'),
]:
    marker = 'var ' + alias + ' = ' + orig + ';'
    if marker not in src:
        injections.append(marker)
if injections:
    src = src.replace('})(typeof PIXI', '\n'.join(injections) + '\n})(typeof PIXI', 1)

open('public/js/modules/10-shell-sonnet-engine/sonnet-engine.js', 'w', encoding='utf-8', newline='\n').write(src)
print('deployed', len(src), '| aliases:', len(injections))
