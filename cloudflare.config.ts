import { bindings, defineConfig } from 'cf/config';

/**
 * This migration needs manual work. Resolve every TODO in this file, then remove the error below.
 */
/**
 * TODO(@cloudflare): cf migrate: d1_databases.0: The options `migrations_dir` at `d1_databases.0` require manual migration.
 */
throw new Error('Migration incomplete. Resolve every cf migrate TODO in `cloudflare.config.ts`.');

export default defineConfig({
	worker: {
		name: 'funmary-license-agreement',
		compatibilityDate: '2026-10-02',
		entrypoint: 'src/index.ts',
		workersDev: true,
		observability: {
			enabled: true,
			traces: {
				enabled: true,
			},
		},
		env: {
			GITHUB_APP_ID: bindings.secret(),
			GITHUB_APP_PRIVATE_KEY: bindings.secret(),
			GITHUB_WEBHOOK_SECRET: bindings.secret(),
			GITHUB_CLIENT_ID: bindings.secret(),
			GITHUB_CLIENT_SECRET: bindings.secret(),
			SIGNING_KEY: bindings.secret(),
			DB: bindings.d1({
				name: 'funmary-license-agreement',
				id: '00000000-0000-0000-0000-000000000000',
			}),
		},
		/**
		 * TODO(@cloudflare): cf migrate: The options `migrations_dir` at `d1_databases.0` require manual migration.
		 */
	},
});
