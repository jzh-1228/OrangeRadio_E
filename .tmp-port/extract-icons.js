const fs = require('fs');
const icons = {};
const names = ['flower', 'star', 'sparkles', 'sun', 'moon', 'cloud', 'heart', 'music', 'leaf', 'bird', 'feather', 'waves'];
const cap = { flower: 'Flower' };
for (const n of names) {
  const p = 'D:/ZCodeWP/.research/folia-major/node_modules/lucide-react/dist/esm/icons/' + n + '.mjs';
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  const i = src.indexOf('const __iconData = ');
  const start = src.indexOf('{', i);
  let depth = 0, end = -1;
  for (let k = start; k < src.length; k++) {
    const ch = src[k];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  if (i < 0 || end < 0) { console.log('nomatch', n); continue; }
  const body = src.slice(start, end + 1);
  const data = eval('(' + body + ')');
  icons[cap[n] || n[0].toUpperCase() + n.slice(1)] = data.node.map(function (node) {
    const b = Object.assign({}, node[1]); delete b.key; return [node[0], b];
  });
}
fs.writeFileSync('D:/ZCodeWP/MineRadio/.tmp-port/icons.json', JSON.stringify(icons));
console.log(Object.keys(icons).length, 'icons ok');
