import nextVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = [
  // 使用 Next.js 的核心配置
  ...nextVitals,
  
  // 添加自定义规则（不重复定义插件）
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unnecessary-type-constraint': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      'no-console': 'off',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      '@next/next/no-img-element': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/await-thenable': 'off',
    },
  },
  // 全局忽略
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'node_modules/**',
      'dist/**',
      'public/**',
      '*.config.js',
      '*.config.ts',
      '*.lock',
      '*.log',
      'coverage/**',
      '.nyc_output/**',
      '.turbo/**',
      '.vercel/**',
      '.env*',
      '!env.example',
      'scripts/**',
      '*.js',
      'tmp_read_excel.js',
      'check-messages.js',
      'check-messages-for-conversation.js',
      'read_excel.js',
    ],
  },
];

export default eslintConfig;
