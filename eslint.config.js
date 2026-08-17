import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Ported verbatim from Seer's web/netlify/functions/utils so the P/L numbers stay
    // identical (see netlify/functions/utils/pnl/README.md). Kept close to upstream on
    // purpose — reformatting it would make the next re-sync a manual merge.
    files: ['netlify/functions/utils/pnl/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // Upstream discards fields by destructuring them into `_name`.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
])
