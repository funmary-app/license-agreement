// Worker の入口。秘密の値と D1 から依存を組み立て、Hono のアプリに渡す
import { parseAllowedOwners } from './agreement.ts';
import { createApp } from './app.ts';
import { createGitHubClient } from './github.ts';
import { createD1Store } from './store.ts';

export default {
	fetch(request, env, ctx) {
		const app = createApp({
			github: createGitHubClient({
				appId: env.GITHUB_APP_ID,
				privateKey: env.GITHUB_APP_PRIVATE_KEY,
				clientId: env.GITHUB_CLIENT_ID,
				clientSecret: env.GITHUB_CLIENT_SECRET,
			}),
			store: createD1Store(env.DB),
			signingKey: env.SIGNING_KEY,
			webhookSecret: env.GITHUB_WEBHOOK_SECRET,
			clientId: env.GITHUB_CLIENT_ID,
			allowedOwners: parseAllowedOwners(env.ALLOWED_OWNERS),
			now: () => Math.floor(Date.now() / 1000),
		});
		return app.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
