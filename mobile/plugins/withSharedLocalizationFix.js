// @bacons/apple-targets lists each `_shared/<lang>.lproj` folder separately
// when it adds targets/ami-widget/_shared to the main app target. Xcode then
// registers the same localized file once per language and the build fails
// ("PIFLoader: GUID … has already been registered"). Xcode's own format is a
// single "/Localized: _shared/<file>" entry per localized file, so rewrite to
// that after every other mod has written the project. Also drops a duplicate
// exception-set reference a second local prebuild can leave behind.
const fs = require('fs');
const path = require('path');
const { withFinalizedMod } = require('expo/config-plugins');

function fixPbxproj(text, sharedDir) {
  // Localized files that live in _shared/<lang>.lproj/.
  const names = new Set();
  if (fs.existsSync(sharedDir)) {
    for (const dir of fs.readdirSync(sharedDir)) {
      if (!dir.endsWith('.lproj')) continue;
      for (const f of fs.readdirSync(path.join(sharedDir, dir))) names.add(f);
    }
  }
  let out = text;
  // Replace the per-language entries with one Xcode-style entry per file.
  out = out.replace(
    /((?:\t+)_shared\/[A-Za-z_-]+\.lproj,\n)+/g,
    (block) => {
      const indent = block.match(/^\t+/)[0];
      return [...names].map((n) => `${indent}"/Localized: _shared/${n}",\n`).join('');
    },
  );
  // De-duplicate repeated lines inside `exceptions = ( … );` lists.
  out = out.replace(/exceptions = \(\n([\s\S]*?)\);/g, (m, body) => {
    const seen = new Set();
    const lines = body.split('\n').filter((l) => {
      if (!l.trim()) return true;
      if (seen.has(l)) return false;
      seen.add(l);
      return true;
    });
    return `exceptions = (\n${lines.join('\n')});`;
  });
  return out;
}

module.exports = function withSharedLocalizationFix(config) {
  return withFinalizedMod(config, [
    'ios',
    async (cfg) => {
      const iosDir = cfg.modRequest.platformProjectRoot;
      const proj = fs.readdirSync(iosDir).find((f) => f.endsWith('.xcodeproj'));
      if (!proj) return cfg;
      const file = path.join(iosDir, proj, 'project.pbxproj');
      const shared = path.join(cfg.modRequest.projectRoot, 'targets', 'ami-widget', '_shared');
      const before = fs.readFileSync(file, 'utf8');
      const after = fixPbxproj(before, shared);
      if (after !== before) fs.writeFileSync(file, after);
      return cfg;
    },
  ]);
};

module.exports.fixPbxproj = fixPbxproj;
