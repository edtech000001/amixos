// Stub for @react-native/assets-registry on web. The real module ships
// untranspiled Flow which Next.js SWC can't parse, but on web (rendering
// react-native-svg via react-native-web) we don't need a real asset
// registry — icon SVGs are inline, not file references.
'use strict';
module.exports = {
  registerAsset: () => 0,
  getAssetByID: () => null,
};
