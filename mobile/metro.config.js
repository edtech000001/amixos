// Metro config — supports the npm workspaces setup so RN can resolve @amixos/shared.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo so changes in shared/ trigger Metro reloads.
config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), workspaceRoot]));

// Resolve modules from both the local node_modules and the workspace root,
// since npm workspaces hoist most deps to the root.
config.resolver.nodeModulesPaths = Array.from(new Set([
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
  ...(config.resolver.nodeModulesPaths ?? []),
]));

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

// Mobile's own copies always win. Mobile runs React 19 / RN 0.81 (SDK 54)
// while web stays on React 18 / RN 0.74, so the workspace root holds WEB's
// versions of several native libraries (reanimated 3, safe-area-context 4,
// svg 15.2…). Any package mobile has its own copy of must resolve to that
// copy — whichever file imports it (a hoisted library, shared/src…) — or the
// bundle gets two Reacts ("Invalid hook call") or JS that doesn't match the
// native module compiled into the app.
const mobileOrigin = path.join(projectRoot, 'package.json');
const pkgName = (name) => (name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]);
const mobileHasCache = new Map();
const mobileHas = (pkg) => {
  if (!mobileHasCache.has(pkg)) {
    mobileHasCache.set(pkg, fs.existsSync(path.join(projectRoot, 'node_modules', pkg, 'package.json')));
  }
  return mobileHasCache.get(pkg);
};

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // `@/…` → mobile/… (the one app alias). Metro no longer reads tsconfig
  // `paths` (experiments.tsconfigPaths=false in app.json): those also hold
  // TYPE-ONLY mappings (react → @types/react) that must never reach runtime.
  if (moduleName.startsWith('@/')) {
    return context.resolveRequest(context, path.join(projectRoot, moduleName.slice(2)), platform);
  }
  // Bare imports from shared/src resolve exactly as mobile's own code would —
  // otherwise they walk up to the root node_modules and get WEB's versions
  // (e.g. react-native-svg 15.2 JS against mobile's 15.12 native module).
  const fromShared = context.originModulePath.startsWith(sharedSrc + path.sep);
  const bare = !moduleName.startsWith('.') && !path.isAbsolute(moduleName) && !moduleName.startsWith('@amixos/shared');
  if (bare && (fromShared || mobileHas(pkgName(moduleName))) && context.originModulePath !== mobileOrigin) {
    return context.resolveRequest({ ...context, originModulePath: mobileOrigin }, moduleName, platform);
  }
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
