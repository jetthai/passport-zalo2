import typescriptEslint from '@typescript-eslint/eslint-plugin';
import eslintComments from 'eslint-plugin-eslint-comments';
import promise from 'eslint-plugin-promise';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all,
});

export default [
	...compat.extends(
		'plugin:@typescript-eslint/recommended',
		'plugin:@typescript-eslint/recommended-requiring-type-checking',
		'plugin:eslint-comments/recommended',
		'plugin:promise/recommended',
		'plugin:prettier/recommended',
	),
	{
		plugins: {
			'@typescript-eslint': typescriptEslint,
			'eslint-comments': eslintComments,
			promise,
			unicorn,
		},

		languageOptions: {
			globals: {
				...globals.node,
			},

			parser: tsParser,
			ecmaVersion: 'latest',
			sourceType: 'module',

			parserOptions: {
				project: 'tsconfig.json',
				tsconfigRootDir: __dirname,
			},
		},

		rules: {
			'@typescript-eslint/require-await': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/restrict-template-expressions': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-floating-promises': 'off',
			'@typescript-eslint/no-misused-promises': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/unbound-method': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'no-prototype-builtins': 'off',
			'import/prefer-default-export': 'off',
			'unicorn/import-style': 'off',

			'no-use-before-define': [
				'error',
				{
					functions: false,
					classes: true,
					variables: true,
				},
			],

			'@typescript-eslint/explicit-function-return-type': 'off',

			'@typescript-eslint/no-use-before-define': [
				'error',
				{
					functions: false,
					classes: true,
					variables: true,
					typedefs: true,
				},
			],

			'unicorn/prevent-abbreviations': 'off',
			'unicorn/no-array-for-each': 'off',
			'unicorn/prefer-module': 'off',
			'unicorn/prefer-top-level-await': 'off',
			'import/no-extraneous-dependencies': 'off',
			'no-console': 'off',
		},
	},
];
