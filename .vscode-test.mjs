import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/integration/**/*.test.js',
	// Resolving completion previews builds SVGs; the 2s mocha default is too
	// tight on shared CI runners.
	mocha: { timeout: 10000 },
});
