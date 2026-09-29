module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // babel-preset-expo only adds its expo-router plugin when it can
      // require('expo-router') from ITS OWN location. In this workspace the
      // preset is hoisted to the root while expo-router must stay in
      // mobile/node_modules (it pairs with mobile's React 19; the root holds
      // web's React 18), so the check fails silently and the router can't
      // find app/ ("First argument of require.context should be a string").
      require('babel-preset-expo/build/expo-router-plugin').expoRouterBabelPlugin,
    ],
  };
};
