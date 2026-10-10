const fs = require('fs');
const path = require('path');
const files = {};
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) {
      const rel = p.slice(4).split(path.sep).join('/').replace('.js', '');
      files[rel] = fs.readFileSync(p, 'utf8');
    }
  }
};
walk('out');
const depsOf = (rel) => {
  const out = [];
  const src = files[rel] || '';
  const re = /import[^']*from\s*'(\.{1,2}\/[^']*)'/g;
  let m;
  while ((m = re.exec(src))) {
    const tgt = path.normalize(path.join(path.dirname(rel), m[1])).split(path.sep).join('/');
    if (files[tgt] && tgt !== rel) out.push(tgt);
  }
  return out;
};
for (const rel of Object.keys(files)) {
  if (rel.includes('lumiere') && files[rel].includes('colorMix')) {
    console.log(rel, '→', JSON.stringify(depsOf(rel).slice(0, 5)));
  }
}
