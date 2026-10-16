export default [
  {
    ignores: [
      '**/node_modules/**',
      'catalog/**',
      'docs/**',
      'packages/core/catalog.js',
      'packages/byokit/catalog.js',
      'packages/byokit/enums.js',
      'packages/byokit/enums.d.ts',
      'packages/core/enums.js',
      'packages/core/enums.d.ts',
      'packages/python/**',
      'spec/**',
      'examples/generated/**',
      'build/**',
      'dist/**',
    ],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      'no-undef': 'off',
      'no-constant-condition': 'warn',
    },
  },
];
