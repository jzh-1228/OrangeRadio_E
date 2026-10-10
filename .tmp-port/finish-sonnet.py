import re
src = open('sonnet-engine.js', encoding='utf-8').read()
src = src.replace('const pixi = await loadPixi();', 'const pixi = await Promise.resolve(PIXI);', 1)
src = re.sub(r"^import\s*\*\s*as\s+(\w+)\s+from\s*'lucide-react';?\s*$", r'var \1 = (typeof LucideIcons !== "undefined") ? LucideIcons : {};', src, flags=re.M)
src = re.sub(r"^import[^;]*from\s*'react-dom/server';?\s*$", "var renderToStaticMarkup = (typeof renderToStaticMarkupShim !== 'undefined') ? renderToStaticMarkupShim : function(){ return ''; };", src, flags=re.M)
src = re.sub(r"^import\s+'[^']+';?\s*$", '', src, flags=re.M)
src = src.replace('const markup = renderToStaticMarkup(React.createElement(Icon, {', 'const markup = renderToStaticMarkupShim(Icon({', 1)
src = re.sub(r'^import[^;]*;\s*$', '', src, flags=re.M)  # 兜底
open('sonnet-engine.js', 'w', encoding='utf-8', newline='\n').write(src)
print('sonnet finished:', len(src))
