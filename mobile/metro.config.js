// Metro config — supports the npm workspaces setup so RN can resolve @amixos/shared.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo so changes in shared/ trigger Metro reloads.
config.watchFolders = [workspaceRoot];

// Resolve modules from both the local node_modules and the workspace root,
// since npm workspaces hoist most deps to the root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Avoid duplicate React copies (mobile + web both have it as a dep).
config.resolver.disableHierarchicalLookup = false;

module.exports = withNativeWind(config, { input: './global.css' });
