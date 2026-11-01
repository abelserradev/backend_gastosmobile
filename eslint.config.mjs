// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'prisma.config.ts'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  // Los tests usan mocks de Prisma/Jest con tipos any; relajamos reglas de type-safety
  // en specs para no forzar anotaciones de bajo valor en código legacy.
  {
    files: ['src/payment-comparison/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  // SonarJS en código nuevo de comparaciones; me.service.ts se excluye hasta T4 split (SonarCloud).
  {
    files: [
      'src/me/expense-comparison-rules.service.ts',
      'src/payment-comparison/exchange.client.ts',
      'src/payment-comparison/payment-comparison.service.ts',
      'src/payment-comparison/exchange.errors.ts',
      'src/payment-comparison/payment-comparison.config.ts',
      'src/payment-comparison/payment-comparison.module.ts',
    ],
    plugins: { sonarjs },
    rules: {
      'sonarjs/cognitive-complexity': ['error', 12],
      complexity: ['error', 10],
    },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
