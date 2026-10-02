import { describe, expect, it } from 'vitest';
import { MARKER } from './agreement.ts';
import { createApp } from './app.ts';
import { GitHubError, type GitHubClient } from './github.ts';
import { signToken } from './signing.ts';
import type { AgreementKey, AgreementStore } from './store.ts';

const ORIGIN = 'https://license.example.workers.dev';
const WEBHOOK_SECRET = 'webhook-secret';
const NOW = 1_800_000_000;
const REPO = 'funmary-app/funmary';
const REPO_ID = 1001;
const TEXT = {
	body: 'BSD-3-Clause か Apache-2.0 で提供します。<b>太字にしない</b>',
	version: 'blob-v1',
};

const keyOf = (key: AgreementKey) => `${key.repositoryId}:${key.githubUserId}:${key.version}`;

function setup(
	options: {
		agreed?: AgreementKey[];
		pulls?: { number: number; headSha: string }[];
		installed?: boolean;
	} = {},
) {
	const calls: { method: string; args: unknown[] }[] = [];
	const agreed = new Set((options.agreed ?? []).map(keyOf));
	const records: unknown[] = [];
	const github: GitHubClient = {
		installationToken: (repo) => {
			calls.push({ method: 'installationToken', args: [repo] });
			if (options.installed === false) {
				return Promise.reject(new GitHubError(404, 'GitHub の API が 404 を返しました'));
			}
			return Promise.resolve('installation-token');
		},
		repository: (_token, repo) => Promise.resolve({ id: REPO_ID, fullName: repo }),
		agreementText: () => Promise.resolve(TEXT),
		openPullsBy: (_token, repo, userId) => {
			calls.push({ method: 'openPullsBy', args: [repo, userId] });
			return Promise.resolve((options.pulls ?? []).map((pull) => ({ ...pull, authorId: userId })));
		},
		setStatus: (_token, repo, sha, status) => {
			calls.push({ method: 'setStatus', args: [repo, sha, status] });
			return Promise.resolve();
		},
		upsertComment: (_token, repo, number, body, upsert) => {
			calls.push({ method: 'upsertComment', args: [repo, number, body, upsert] });
			return Promise.resolve();
		},
		exchangeCode: (code) => Promise.resolve(`user-token-for-${code}`),
		currentUser: () => Promise.resolve({ id: 42, login: 'student' }),
	};
	const store: AgreementStore = {
		hasAgreed: (key) => Promise.resolve(agreed.has(keyOf(key))),
		record: (entry) => {
			records.push(entry);
			return Promise.resolve();
		},
	};
	const app = createApp({
		github,
		store,
		signingKey: 'signing-key',
		webhookSecret: WEBHOOK_SECRET,
		clientId: 'client-id',
		allowedOwners: ['funmary-app'],
		now: () => NOW,
	});
	return { app, calls, records };
}

async function sign(body: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(WEBHOOK_SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
	return `sha256=${Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function pullRequestEvent(
	overrides: {
		action?: string;
		association?: string;
		type?: string;
		repositoryId?: number;
		repo?: string;
	} = {},
) {
	return JSON.stringify({
		action: overrides.action ?? 'opened',
		repository: { id: overrides.repositoryId ?? REPO_ID, full_name: overrides.repo ?? REPO },
		pull_request: {
			number: 7,
			head: { sha: 'abc123' },
			author_association: overrides.association ?? 'FIRST_TIME_CONTRIBUTOR',
			user: { id: 42, login: 'student', type: overrides.type ?? 'User' },
		},
	});
}

async function webhook(app: ReturnType<typeof setup>['app'], body: string, event = 'pull_request') {
	return app.request(`${ORIGIN}/webhook`, {
		method: 'POST',
		body,
		headers: { 'X-GitHub-Event': event, 'X-Hub-Signature-256': await sign(body) },
	});
}

describe('Webhook', () => {
	it('署名が違えば、何もせずに 401 を返す', async () => {
		const { app, calls } = setup();
		const response = await app.request(`${ORIGIN}/webhook`, {
			method: 'POST',
			body: pullRequestEvent(),
			headers: { 'X-GitHub-Event': 'pull_request', 'X-Hub-Signature-256': 'sha256=00' },
		});
		expect(response.status).toBe(401);
		expect(calls).toEqual([]);
	});

	it('まだ同意していなければ、案内のコメントを送り、検査を「待ち」にして、同意のページへつなぐ', async () => {
		const { app, calls } = setup();
		expect((await webhook(app, pullRequestEvent())).status).toBe(204);
		const comment = calls.find((call) => call.method === 'upsertComment');
		expect(comment?.args[2]).toContain(MARKER);
		expect(comment?.args[3]).toEqual({ create: true });
		expect(calls.find((call) => call.method === 'setStatus')?.args).toEqual([
			REPO,
			'abc123',
			{
				state: 'pending',
				description: 'PR の作者の、ライセンスへの同意を待っています',
				targetUrl: `${ORIGIN}/agree?repo=funmary-app%2Ffunmary&pr=7`,
			},
		]);
	});

	it('このリポジトリの今の文面に同意済みの人の PR は、検査を通す (案内のコメントは、あるときだけ書き換える)', async () => {
		const { app, calls } = setup({
			agreed: [{ repositoryId: REPO_ID, githubUserId: 42, version: TEXT.version }],
		});
		await webhook(app, pullRequestEvent({ action: 'synchronize' }));
		expect(calls.find((call) => call.method === 'setStatus')?.args[2]).toMatchObject({
			state: 'success',
		});
		expect(calls.find((call) => call.method === 'upsertComment')?.args[3]).toEqual({
			create: false,
		});
	});

	it('ほかのリポジトリでの同意や、前の版の文面への同意では、通さない', async () => {
		for (const key of [
			{ repositoryId: 2002, githubUserId: 42, version: TEXT.version },
			{ repositoryId: REPO_ID, githubUserId: 42, version: 'blob-old' },
		]) {
			const { app, calls } = setup({ agreed: [key] });
			await webhook(app, pullRequestEvent());
			expect(calls.find((call) => call.method === 'setStatus')?.args[2]).toMatchObject({
				state: 'pending',
			});
		}
	});

	it('Bot の PR は、同意を求めずに検査を通す', async () => {
		const { app, calls } = setup();
		await webhook(app, pullRequestEvent({ type: 'Bot' }));
		expect(calls.map((call) => call.method)).toEqual(['installationToken', 'setStatus']);
	});

	it('リポジトリの持ち主やメンバーの PR でも、まだ同意していなければ、同意を求める', async () => {
		const { app, calls } = setup();
		await webhook(app, pullRequestEvent({ association: 'OWNER' }));
		expect(calls.find((call) => call.method === 'setStatus')?.args[2]).toMatchObject({
			state: 'pending',
		});
	});

	it('見張らないアクションとイベントでは、何もしない', async () => {
		const { app, calls } = setup();
		await webhook(app, pullRequestEvent({ action: 'labeled' }));
		await webhook(app, '{}', 'ping');
		expect(calls).toEqual([]);
	});

	it('受け付ける持ち主のものでないリポジトリでは、何もしない (App を公開にしても、ほかの人のリポジトリでは動かない)', async () => {
		const { app, calls } = setup();
		expect((await webhook(app, pullRequestEvent({ repo: 'someone/fork' }))).status).toBe(204);
		expect(calls).toEqual([]);
	});
});

describe('同意のページ', () => {
	it('リポジトリの文面を、HTML として解釈せずに出す。リポジトリの指定が正しくなければ 400 を返す', async () => {
		const { app } = setup();
		expect((await app.request(`${ORIGIN}/agree?repo=../etc`)).status).toBe(400);
		const response = await app.request(`${ORIGIN}/agree?repo=${REPO}`);
		expect(response.status).toBe(200);
		const page = await response.text();
		expect(page).toContain('&lt;b&gt;太字にしない&lt;/b&gt;');
		expect(page).not.toContain('<b>太字にしない</b>');
	});

	it('受け付ける持ち主のものでないリポジトリは、404 を返す', async () => {
		const { app, calls } = setup();
		for (const path of ['/agree?repo=someone/fork', '/login?repo=someone/fork']) {
			expect((await app.request(`${ORIGIN}${path}`)).status).toBe(404);
		}
		expect(calls).toEqual([]);
		// 大文字と小文字は区別しない
		expect((await app.request(`${ORIGIN}/agree?repo=Funmary-App/funmary`)).status).toBe(200);
	});

	it('App がまだ入っていないリポジトリは、500 ではなく 404 を返し、受け付けていないことを伝える', async () => {
		const { app } = setup({ installed: false });
		const response = await app.request(`${ORIGIN}/agree?repo=funmary-app/new-repository`);
		expect(response.status).toBe(404);
		expect(await response.text()).toContain('ライセンスへの同意を受け付けていません');
	});

	it('ログインでは、署名した state を付けて GitHub の認可の画面へ送り、戻ってきたら確認の画面を出す', async () => {
		const { app } = setup();
		const login = await app.request(`${ORIGIN}/login?repo=${REPO}`);
		expect(login.status).toBe(302);
		const location = new URL(login.headers.get('Location') ?? '');
		expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
		expect(location.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/callback`);

		const state = location.searchParams.get('state') ?? '';
		const callback = await app.request(`${ORIGIN}/callback?code=c1&state=${state}`);
		expect(callback.status).toBe(200);
		expect(await callback.text()).toContain('@student として');

		const forged = await app.request(`${ORIGIN}/callback?code=c1&state=forged`);
		expect(forged.status).toBe(400);
	});

	it('同意すると、リポジトリと版を付けて記録し、その人の開いている PR の検査を通す。ほかのサイトから送られたものは受け付けない', async () => {
		const { app, calls, records } = setup({ pulls: [{ number: 7, headSha: 'abc123' }] });
		const token = await signToken(
			'signing-key',
			{ repo: REPO, repositoryId: REPO_ID, userId: 42, login: 'student', version: TEXT.version },
			NOW + 600,
		);
		const form = () => {
			const data = new FormData();
			data.set('token', token);
			return data;
		};

		const crossSite = await app.request(`${ORIGIN}/agree`, {
			method: 'POST',
			body: form(),
			headers: { Origin: 'https://evil.example.com' },
		});
		expect(crossSite.status).toBe(403);
		expect(records).toEqual([]);

		const response = await app.request(`${ORIGIN}/agree`, {
			method: 'POST',
			body: form(),
			headers: { Origin: ORIGIN },
		});
		expect(response.status).toBe(200);
		expect(records).toEqual([
			{
				repositoryId: REPO_ID,
				repositoryName: REPO,
				githubUserId: 42,
				githubLogin: 'student',
				version: TEXT.version,
				agreedAt: new Date(NOW * 1000),
			},
		]);
		expect(calls.find((call) => call.method === 'setStatus')?.args.slice(0, 2)).toEqual([
			REPO,
			'abc123',
		]);
	});

	it('案内のリンクに PR の番号があれば、ログインと確認の画面を通して引き継ぎ、同意したらその PR のページに戻す', async () => {
		const { app } = setup();
		const agree = await (await app.request(`${ORIGIN}/agree?repo=${REPO}&pr=250`)).text();
		expect(agree).toContain(`/login?repo=funmary-app%2Ffunmary&amp;pr=250`);

		const login = await app.request(`${ORIGIN}/login?repo=${REPO}&pr=250`);
		const state = new URL(login.headers.get('Location') ?? '').searchParams.get('state') ?? '';
		const confirm = await (await app.request(`${ORIGIN}/callback?code=c1&state=${state}`)).text();
		const token = /name="token" value="([^"]+)"/.exec(confirm)?.[1] ?? '';

		const data = new FormData();
		data.set('token', token);
		const response = await app.request(`${ORIGIN}/agree`, {
			method: 'POST',
			body: data,
			headers: { Origin: ORIGIN },
		});
		expect(response.status).toBe(303);
		expect(response.headers.get('Location')).toBe(
			'https://github.com/funmary-app/funmary/pull/250',
		);
	});

	it('PR の番号が正の整数でなければ、無視する', async () => {
		const { app } = setup();
		for (const pr of ['0', '-1', '1e3', 'abc', '12345678901']) {
			const agree = await (await app.request(`${ORIGIN}/agree?repo=${REPO}&pr=${pr}`)).text();
			expect(agree).toContain('/login?repo=funmary-app%2Ffunmary"');
		}
	});
});
