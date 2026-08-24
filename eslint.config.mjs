// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.expo/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.config.js',
      'specs/**',
      'services/**',
      'training/**',
      'packages/shared/src/database.ts',
      'apps/mobile/drizzle/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Decision 6: no hardcoded user-facing strings in components from P2 onward.
    // Catches raw JSX text; string-valued props (placeholders, a11y labels) are covered by
    // the review checklist in docs/traceability.md.
    files: ['apps/mobile/app/**/*.tsx', 'apps/mobile/src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/[A-Za-z]/]',
          message:
            'User-facing text must come from the i18n catalog: t(...) from src/i18n (decision 6).',
        },
      ],
    },
  },
  prettier,
);
