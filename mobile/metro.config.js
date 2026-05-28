// Metro config — supports the npm workspaces setup so RN can resolve @amixos/shared.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');
const fs = require('fs');

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

// Map @amixos/shared subpath imports straight into shared/src. The
// workspace symlink points at shared/ (package root) but the actual
// source files live in shared/SRC/. Without this aliasing imports like
// `@amixos/shared/screens/dashboard/X` silently fail and render blank.
//
// We do explicit file-existence checks across the candidate extensions
// Metro understands and return a direct sourceFile result. This avoids
// any reliance on Metro's internal subpath-resolution behavior.
const sharedSrc = path.resolve(workspaceRoot, 'shared/src');
const SHARED_EXT_CANDIDATES = ['.ts', '.tsx', '.js', '.jsx', '.json',
  '/index.ts', '/index.tsx', '/index.js'];

const resolveSharedSubpath = (subpath) => {
  for (const ext of SHARED_EXT_CANDIDATES) {
    const filePath = path.join(sharedSrc, subpath + ext);
    if (fs.existsSync(filePath)) {
      return { type: 'sourceFile', filePath };
    }
  }
  return null;
};

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@amixos/shared') {
    const hit = resolveSharedSubpath('index');
    if (hit) return hit;
  }
  if (moduleName.startsWith('@amixos/shared/')) {
    const subpath = moduleName.slice('@amixos/shared/'.length);
    const hit = resolveSharedSubpath(subpath);
    if (hit) return hit;
  }
  return originalResolveRequest
    ? originalResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

// Avoid duplicate React copies (mobile + web both have it as a dep).
config.resolver.disableHierarchicalLookup = false;

module.exports = withNativeWind(config, { input: './global.css' });
