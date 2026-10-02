import { defineConfig } from 'vitest/config';

// 判断、署名、経路を Node.js で試す (Web Crypto は Node.js にもある)。GitHub と D1 は偽物に差し替える
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
	},
});
