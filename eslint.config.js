// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  { ignores: ['**/dist/**', '**/dist-*/**', '**/tmp/**', '**/.expo/**'] },
  expoConfig,
  {
    rules: {
      // React Native Animated values are intentionally read while styles are composed.
      // These compiler-oriented React rules currently flag that supported API pattern.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/use-memo': 'off',
    },
  },
]);
