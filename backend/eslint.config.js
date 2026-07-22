const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      // caughtErrors: 'none' — this codebase has many intentional `catch (err) {}` swallows
      // (e.g. best-effort cleanup); flagging every one would mean touching ~10 unrelated
      // files in a CI-setup change. Genuinely dead args/vars elsewhere still get flagged.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    ignores: ['node_modules/**', 'coverage/**'],
  },
];
