// GitHub App として GitHub の API を呼ぶ。App の JWT (RS256) で installation のトークンを取り、PR に状態とコメントを付ける。
// 利用者のログイン (OAuth) で、だれが同意したかも確かめる。fetch は差し替えられる (テストのため)
import {
	AGREEMENT_FILE,
	MARKER,
	STATUS_CONTEXT,
	defaultAgreementText,
	type AgreementText,
} from './agreement.ts';

const API = 'https://api.github.com';
const USER_AGENT = 'funmary-license-agreement';

const base64Url = (bytes: Uint8Array) =>
	btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '');

/**
 * GitHub App の JWT を作る。秘密鍵は PKCS#8 の PEM。
 * GitHub が配る鍵は PKCS#1 の PEM なので、置く前に openssl で変換する (README.md)
 */
export async function createAppJwt(
	appId: string,
	privateKeyPem: string,
	now: number,
): Promise<string> {
	const der = Uint8Array.from(
		// PEM の見出しの行 (BEGIN と END) を除き、残りの Base64 を読む
		atob(privateKeyPem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')),
		(char) => char.charCodeAt(0),
	);
	const key = await crypto.subtle.importKey(
		'pkcs8',
		der,
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const encoder = new TextEncoder();
	// 時計のずれに備えて、発行の時刻を 60 秒戻す。期限は GitHub の上限 (10 分) より短くする
	const header = base64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
	const payload = base64Url(
		encoder.encode(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId })),
	);
	const signature = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		key,
		encoder.encode(`${header}.${payload}`),
	);
	return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

export class GitHubError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = 'GitHubError';
	}
}

export interface PullRequestRef {
	readonly number: number;
	readonly headSha: string;
	readonly authorId: number;
}

export interface GitHubClient {
	/** App が入っているリポジトリの installation のトークン。入っていなければ GitHubError (404) */
	installationToken(repo: string): Promise<string>;
	/** リポジトリの ID (名前を変えたり移管したりしても変わらない) と、今の名前 */
	repository(token: string, repo: string): Promise<{ id: number; fullName: string }>;
	/** 同意してもらう文面。AGREEMENT_FILE があればその中身、なければ GitHub が判定したライセンスから作る */
	agreementText(token: string, repo: string): Promise<AgreementText>;
	/** そのリポジトリの、開いている PR のうち、その人が作ったもの */
	openPullsBy(token: string, repo: string, userId: number): Promise<PullRequestRef[]>;
	setStatus(
		token: string,
		repo: string,
		sha: string,
		status: { state: 'success' | 'pending'; description: string; targetUrl?: string },
	): Promise<void>;
	/** 印のある案内のコメントを書き換える。なければ、create が true のときだけ作る */
	upsertComment(
		token: string,
		repo: string,
		number: number,
		body: string,
		options: { create: boolean },
	): Promise<void>;
	/** OAuth の認可コードを、利用者のトークンに換える */
	exchangeCode(code: string): Promise<string>;
	/** 利用者のトークンで、ログインした人を取る */
	currentUser(userToken: string): Promise<{ id: number; login: string }>;
}

export interface GitHubConfig {
	readonly appId: string;
	readonly privateKey: string;
	readonly clientId: string;
	readonly clientSecret: string;
}

export function createGitHubClient(
	config: GitHubConfig,
	fetchImpl: typeof fetch = (input, init) => fetch(input, init),
	now: () => number = () => Math.floor(Date.now() / 1000),
): GitHubClient {
	async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
		const response = await fetchImpl(`${API}${path}`, {
			...init,
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${token}`,
				'User-Agent': USER_AGENT,
				'X-GitHub-Api-Version': '2022-11-28',
				...(init.body ? { 'Content-Type': 'application/json' } : {}),
			},
		});
		if (!response.ok) {
			throw new GitHubError(
				response.status,
				`GitHub の API が ${response.status} を返しました: ${path}`,
			);
		}
		if (response.status === 204) return undefined as T;
		return response.json<T>();
	}

	return {
		async installationToken(repo) {
			const jwt = await createAppJwt(config.appId, config.privateKey, now());
			const installation = await call<{ id: number }>(jwt, `/repos/${repo}/installation`);
			const token = await call<{ token: string }>(
				jwt,
				`/app/installations/${installation.id}/access_tokens`,
				{ method: 'POST' },
			);
			return token.token;
		},
		async repository(token, repo) {
			const result = await call<{ id: number; full_name: string }>(token, `/repos/${repo}`);
			return { id: result.id, fullName: result.full_name };
		},
		async agreementText(token, repo) {
			try {
				const file = await call<{ content: string; sha: string }>(
					token,
					`/repos/${repo}/contents/${AGREEMENT_FILE}`,
				);
				const bytes = Uint8Array.from(atob(file.content.replace(/s+/g, '')), (char) =>
					char.charCodeAt(0),
				);
				return { body: new TextDecoder().decode(bytes).trim(), version: file.sha };
			} catch (error) {
				if (!(error instanceof GitHubError && error.status === 404)) throw error;
			}
			try {
				const license = await call<{
					sha: string;
					html_url: string;
					license: { name: string } | null;
				}>(token, `/repos/${repo}/license`);
				return defaultAgreementText(repo, {
					name: license.license?.name ?? 'ライセンス',
					url: license.html_url,
					sha: license.sha,
				});
			} catch (error) {
				if (!(error instanceof GitHubError && error.status === 404)) throw error;
				return defaultAgreementText(repo, null);
			}
		},
		async openPullsBy(token, repo, userId) {
			const pulls = await call<{ number: number; head: { sha: string }; user: { id: number } }[]>(
				token,
				`/repos/${repo}/pulls?state=open&per_page=100`,
			);
			return pulls
				.filter((pull) => pull.user.id === userId)
				.map((pull) => ({ number: pull.number, headSha: pull.head.sha, authorId: pull.user.id }));
		},
		async setStatus(token, repo, sha, status) {
			await call(token, `/repos/${repo}/statuses/${sha}`, {
				method: 'POST',
				body: JSON.stringify({
					state: status.state,
					context: STATUS_CONTEXT,
					description: status.description,
					...(status.targetUrl ? { target_url: status.targetUrl } : {}),
				}),
			});
		},
		async upsertComment(token, repo, number, body, options) {
			const comments = await call<{ id: number; body: string | null }[]>(
				token,
				`/repos/${repo}/issues/${number}/comments?per_page=100`,
			);
			const existing = comments.find((comment) => comment.body?.includes(MARKER));
			if (existing) {
				if (existing.body !== body) {
					await call(token, `/repos/${repo}/issues/comments/${existing.id}`, {
						method: 'PATCH',
						body: JSON.stringify({ body }),
					});
				}
			} else if (options.create) {
				await call(token, `/repos/${repo}/issues/${number}/comments`, {
					method: 'POST',
					body: JSON.stringify({ body }),
				});
			}
		},
		async exchangeCode(code) {
			const response = await fetchImpl('https://github.com/login/oauth/access_token', {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
					'User-Agent': USER_AGENT,
				},
				body: JSON.stringify({
					client_id: config.clientId,
					client_secret: config.clientSecret,
					code,
				}),
			});
			const result: { access_token?: string } = await response.json();
			if (!response.ok || !result.access_token) {
				throw new GitHubError(response.status, 'GitHub のログインを完了できませんでした');
			}
			return result.access_token;
		},
		async currentUser(userToken) {
			const user = await call<{ id: number; login: string }>(userToken, '/user');
			return { id: user.id, login: user.login };
		},
	};
}
