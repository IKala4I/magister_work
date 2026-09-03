// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '.claude/**', // harness agent worktrees live inside the repo dir

      '**/node_modules/**',
      '**/.expo/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.config.js',
      'specs/**',
      'services/**',
      'training/**',
      'supabase/functions/**', // Deno toolchain: deno lint / deno fmt / deno check (CI `edge` job)
      'packages/shared/src/database.ts',
      'apps/mobile/drizzle/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node tooling scripts (generators, verification harnesses) run under plain node.
    files: ['scripts/**/*.mjs', 'docs/verification/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        crypto: 'readonly',
        performance: 'readonly',
      },
    },
  },
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
    // Catches raw JSX text, string-literal children, and template-literal children.
    // String-valued props (placeholders, a11y labels) are uncatchable without type-aware
    // linting — covered by the review checklist in docs/checklists/ui-review.md.
    files: ['apps/mobile/app/**/*.tsx', 'apps/mobile/src/**/*.tsx'],
    ignores: ['apps/mobile/src/**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/[A-Za-z]/]',
          message:
            'User-facing text must come from the i18n catalog: t(...) from src/i18n (decision 6).',
        },
        {
          selector:
            ':matches(JSXElement, JSXFragment) > JSXExpressionContainer > Literal[value=/[A-Za-z]/]',
          message:
            'String-literal JSX children must come from the i18n catalog: t(...) from src/i18n (decision 6).',
        },
        {
          selector: ':matches(JSXElement, JSXFragment) > JSXExpressionContainer > TemplateLiteral',
          message:
            'Template-literal JSX children must come from the i18n catalog with {params}: t(...) from src/i18n (decision 6).',
        },
      ],
    },
  },
  prettier,
);
