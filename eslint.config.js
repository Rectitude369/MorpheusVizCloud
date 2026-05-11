/**
 * ESLint flat config (v9+).
 *
 * Strategy:
 *   • TypeScript-first with type-aware rules where the perf cost is worth it.
 *   • React + react-hooks for the renderer.
 *   • Different strictness profiles for source vs. tests vs. configs.
 *   • Prettier disables every formatting rule so we don't fight it.
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const sharedTsRules = {
  '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true, allowTypedFunctionExpressions: true }],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
  '@typescript-eslint/no-non-null-assertion': 'warn',
  'no-console': ['error', { allow: ['error', 'warn'] }],
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['/Users/**', '/home/**', 'C:\\\\**'],
          message: 'Absolute paths to a developer machine are forbidden — use the @shared/* alias instead.',
        },
      ],
    },
  ],
  curly: 'error',
  eqeqeq: ['error', 'always'],
  'no-var': 'error',
  'prefer-const': 'error',
  radix: 'error',
};

export default tseslint.config(
  { ignores: ['dist/**', 'release/**', 'node_modules/**', 'coverage/**', 'build/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Renderer / TypeScript / TSX
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactPlugin.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...sharedTsRules,
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Tests — relax `any` to a warning, but keep everything else strict.
  {
    files: ['tests/**/*.{ts,tsx}', 'e2e/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      ...sharedTsRules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Config files (CommonJS or build scripts)
  {
    files: ['*.cjs', '*.config.{js,cjs,ts}', 'build/**/*.{js,cjs}'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },

  prettier,
);
