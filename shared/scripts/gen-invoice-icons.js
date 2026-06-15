const fs = require('fs');
const path = require('path');
const repo = path.resolve(__dirname, '..', '..');
const presets = fs.readFileSync(path.join(repo, 'shared/src/lib/mapPinPresets.ts'), 'utf8');
const iconsDir = path.join(repo, 'node_modules/lucide-react/dist/esm/icons');

const names = [];
const seen = new Set();
for (const block of presets.matchAll(/icons:\s*\[([\s\S]*?)\]/g)) {
  for (const tok of block[1].matchAll(/'([a-z0-9-]+)'/g)) {
    if (!seen.has(tok[1])) { seen.add(tok[1]); names.push(tok[1]); }
  }
}

function loadNodes(name, depth = 0) {
  if (depth > 4) return null;
  const file = path.join(iconsDir, name + '.js');
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, 'utf8');
  const alias = src.match(/export\s*\{\s*default\s*\}\s*from\s*'\.\/([a-z0-9-]+)\.js'/);
  if (alias) return loadNodes(alias[1], depth + 1);
  const m = src.match(/createLucideIcon\(\s*"[^"]*",\s*([\s\S]*?)\);/);
  if (!m) return null;
  let arr;
  try { arr = (0, eval)('(' + m[1] + ')'); } catch (e) { return null; }
  return arr.map(([t, a]) => {
    const o = { t };
    for (const [k, v] of Object.entries(a)) if (k !== 'key') o[k] = String(v);
    return o;
  });
}

const out = {};
const missing = [];
for (const name of names) {
  const nodes = loadNodes(name);
  if (!nodes) { missing.push(name); continue; }
  out[name] = nodes;
}

const lines = Object.entries(out).map(([k, v]) => `  ${/^[a-z0-9]+$/.test(k) ? k : `'${k}'`}: ${JSON.stringify(v)},`);
const ts = `// AUTO-GENERATED — do not edit by hand. Geometry for the invoice freeform icon
// catalog, extracted from lucide-react (v0.378.0) for the same icon set the map
// pins use (see mapPinPresets.ts). Each entry is the icon's SVG child elements
// (24×24 viewBox); renderers stroke them in the element color. Regenerate with
// shared/scripts/gen-invoice-icons.js.

/** One SVG child element: \`t\` is the tag (path/circle/line/rect/polyline/
 *  polygon/ellipse); the remaining keys are that tag's geometry attributes. */
export type InvoiceIconNode = { t: string } & Record<string, string>;

export const INVOICE_ICON_NODES: Record<string, InvoiceIconNode[]> = {
${lines.join('\n')}
};
`;
fs.writeFileSync(path.join(repo, 'shared/src/lib/invoiceIconNodes.ts'), ts);
console.log('wrote shared/src/lib/invoiceIconNodes.ts | icons:', Object.keys(out).length, '| missing:', missing.join(',') || '(none)', '| bytes:', ts.length);
