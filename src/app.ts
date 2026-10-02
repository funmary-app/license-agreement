// 経路 (Hono)。GitHub App の Webhook で PR を見張り、同意の画面で GitHub のログインと同意を受け付ける。
// 同意はリポジトリごとに 1 回。文面は各リポジトリの .github/license-agreement.md から読む。
// 依存 (GitHub、記録、鍵、時刻) は外から受け取る (テストで差し替えるため)
import { Hono } from 'hono';
import { confirmedComment, isExempt, isRepositoryName, requestComment } from './agreement.ts';
import type { GitHubClient } from './github.ts';
import { agreePage, confirmPage, donePage, errorPage } from './pages.ts';
import { signToken, verifyToken, verifyWebhookSignature } from './signing.ts';
import type { AgreementStore } from './store.ts';

export interface AppDeps {
	readonly github: GitHubClient;
	readonly store: AgreementStore;
	/** OAuth の state と、同意のフォームの値に署名する鍵 */
	readonly signingKey: string;
	readonly webhookSecret: string;
	readonly clientId: string;
	/** UNIX 秒 */
	readonly now: () => number;
}

/** OAuth の state と、同意のフォームの値の有効な時間 (秒) */
const TOKEN_TTL_S = 10 * 60;

interface PullRequestEvent {
	readonly action: string;
	readonly repository: { readonly id: number; readonly full_name: string };
	readonly pull_request: {
		readonly number: number;
		readonly head: { readonly sha: string };
		readonly author_association: string;
		readonly user: { readonly id: number; readonly login: string; readonly type: string };
	};
}

/** 外部の人の PR を見張るアクション。編集やラベルの付け外しでは、状態は変わらない */
const WATCHED_ACTIONS = new Set(['opened', 'reopened', 'synchronize']);

const INVALID_REPOSITORY = 'リポジトリの指定が正しくありません。';

export function createApp(deps: AppDeps): Hono {
	const app = new Hono();

	const agreeUrl = (origin: string, repo: string) =>
		`${origin}/agree?repo=${encodeURIComponent(repo)}`;

	app.get('/', (c) =>
		c.text('Funmary のリポジトリで、ライセンスへの同意を受け付ける Worker です。'),
	);

	app.post('/webhook', async (c) => {
		const body = await c.req.text();
		const valid = await verifyWebhookSignature(
			deps.webhookSecret,
			body,
			c.req.header('X-Hub-Signature-256') ?? null,
		);
		if (!valid) return c.text('署名が違います', 401);
		if (c.req.header('X-GitHub-Event') !== 'pull_request') return c.body(null, 204);

		const event = JSON.parse(body) as PullRequestEvent;
		if (!WATCHED_ACTIONS.has(event.action)) return c.body(null, 204);
		const repo = event.repository.full_name;
		const pull = event.pull_request;
		const token = await deps.github.installationToken(repo);

		if (isExempt({ type: pull.user.type, association: pull.author_association })) {
			await deps.github.setStatus(token, repo, pull.head.sha, {
				state: 'success',
				description: 'メンテナーか Bot の PR なので、同意は要りません',
			});
			return c.body(null, 204);
		}

		const text = await deps.github.agreementText(token, repo);
		const agreed = await deps.store.hasAgreed({
			repositoryId: event.repository.id,
			githubUserId: pull.user.id,
			version: text.version,
		});
		if (agreed) {
			await deps.github.setStatus(token, repo, pull.head.sha, {
				state: 'success',
				description: `${pull.user.login} さんは同意済みです`,
			});
			await deps.github.upsertComment(token, repo, pull.number, confirmedComment(pull.user.login), {
				create: false,
			});
		} else {
			const url = agreeUrl(new URL(c.req.url).origin, repo);
			await deps.github.upsertComment(
				token,
				repo,
				pull.number,
				requestComment(pull.user.login, repo, url),
				{ create: true },
			);
			await deps.github.setStatus(token, repo, pull.head.sha, {
				state: 'pending',
				description: 'PR の作者の、ライセンスへの同意を待っています',
				targetUrl: url,
			});
		}
		return c.body(null, 204);
	});

	app.get('/agree', async (c) => {
		const repo = c.req.query('repo') ?? '';
		if (!isRepositoryName(repo)) return c.html(errorPage(INVALID_REPOSITORY), 400);
		const token = await deps.github.installationToken(repo);
		const text = await deps.github.agreementText(token, repo);
		return c.html(agreePage({ repo, text, loginUrl: `/login?repo=${encodeURIComponent(repo)}` }));
	});

	app.get('/login', async (c) => {
		const repo = c.req.query('repo') ?? '';
		if (!isRepositoryName(repo)) return c.html(errorPage(INVALID_REPOSITORY), 400);
		const state = await signToken(deps.signingKey, { repo }, deps.now() + TOKEN_TTL_S);
		const authorize = new URL('https://github.com/login/oauth/authorize');
		authorize.searchParams.set('client_id', deps.clientId);
		authorize.searchParams.set('redirect_uri', new URL('/callback', c.req.url).toString());
		authorize.searchParams.set('state', state);
		return c.redirect(authorize.toString());
	});

	app.get('/callback', async (c) => {
		const state = await verifyToken(deps.signingKey, c.req.query('state') ?? '', deps.now());
		const code = c.req.query('code');
		const repo = state?.['repo'];
		if (!code || typeof repo !== 'string' || !isRepositoryName(repo)) {
			return c.html(
				errorPage('ログインの期限が切れたか、正しくありません。もう一度お試しください。'),
				400,
			);
		}
		const user = await deps.github.currentUser(await deps.github.exchangeCode(code));
		const token = await deps.github.installationToken(repo);
		const repository = await deps.github.repository(token, repo);
		const text = await deps.github.agreementText(token, repo);
		// 同意するのは、この画面で見せた版の文面。フォームの値に入れて署名する
		const formToken = await signToken(
			deps.signingKey,
			{
				repo: repository.fullName,
				repositoryId: repository.id,
				userId: user.id,
				login: user.login,
				version: text.version,
			},
			deps.now() + TOKEN_TTL_S,
		);
		return c.html(
			confirmPage({ repo: repository.fullName, text, login: user.login, token: formToken }),
		);
	});

	app.post('/agree', async (c) => {
		// ほかのサイトから送らせる攻撃 (CSRF) を防ぐ。フォームの値も署名で確かめる
		if (c.req.header('Origin') !== new URL(c.req.url).origin) {
			return c.html(errorPage('このページから送ってください。'), 403);
		}
		const form = await c.req.formData();
		const formToken = form.get('token');
		const payload = await verifyToken(
			deps.signingKey,
			typeof formToken === 'string' ? formToken : '',
			deps.now(),
		);
		const repo = payload?.['repo'];
		const repositoryId = payload?.['repositoryId'];
		const userId = payload?.['userId'];
		const login = payload?.['login'];
		const version = payload?.['version'];
		if (
			typeof repo !== 'string' ||
			!isRepositoryName(repo) ||
			typeof repositoryId !== 'number' ||
			typeof userId !== 'number' ||
			typeof login !== 'string' ||
			typeof version !== 'string'
		) {
			return c.html(errorPage('期限が切れたか、正しくありません。もう一度お試しください。'), 400);
		}

		await deps.store.record({
			repositoryId,
			repositoryName: repo,
			githubUserId: userId,
			githubLogin: login,
			version,
			agreedAt: new Date(deps.now() * 1000),
		});

		// 同意した人が作った、そのリポジトリの開いている PR の検査を通す
		const token = await deps.github.installationToken(repo);
		const pulls = await deps.github.openPullsBy(token, repo, userId);
		for (const pull of pulls) {
			await deps.github.setStatus(token, repo, pull.headSha, {
				state: 'success',
				description: `${login} さんの同意を確かめました`,
			});
			await deps.github.upsertComment(token, repo, pull.number, confirmedComment(login), {
				create: false,
			});
		}
		return c.html(donePage({ repo, login, updated: pulls.length }));
	});

	app.onError((error, c) => {
		console.error(
			JSON.stringify({ message: 'request failed', path: c.req.path, error: String(error) }),
		);
		return c.html(
			errorPage('うまく処理できませんでした。時間をおいて、もう一度お試しください。'),
			500,
		);
	});

	return app;
}
