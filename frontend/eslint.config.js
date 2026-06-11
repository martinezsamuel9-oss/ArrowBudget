import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}', '*.js'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      // Errores reales (rompen en producción): variables inexistentes, hooks mal usados
      'no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react/jsx-no-undef': 'error',
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      // Señales útiles pero no bloqueantes en una base existente
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'react-hooks/exhaustive-deps': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-irregular-whitespace': 'warn',
      'no-useless-escape': 'warn',
      'no-control-regex': 'off',
    },
  },
]
