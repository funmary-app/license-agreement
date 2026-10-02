// ライセンスへの同意の判断と、PR に送る文面。I/O は持たない。
// 同意はリポジトリごとに 1 回求める。同意してもらう文面は、各リポジトリの AGREEMENT_FILE に書く。

/** 検査の名前 (コミットの状態の context)。各リポジトリの ruleset の必須の検査に、この名前を足す */
export const STATUS_CONTEXT = 'ライセンスへの同意';

/** Bot の案内のコメントを見分ける印 (画面には出ない) */
export const MARKER = '<!-- funmary-license-agreement -->';

/** 各リポジトリの、同意してもらう文面のファイル。既定のブランチのものを読む */
export const AGREEMENT_FILE = '.github/license-agreement.md';

/**
 * 同意してもらう文面と、その版。版は文面のファイルの Git の blob の SHA なので、文面を変えると版が変わり、
 * 前の版に同意した人にも、もう一度同意を求める
 */
export interface AgreementText {
	readonly body: string;
	readonly version: string;
}

/**
 * AGREEMENT_FILE がないリポジトリの文面。GitHub が判定したライセンスを示す。
 * 版は、ライセンスのファイルの SHA (ライセンスがなければ none) にする
 */
export function defaultAgreementText(
	repo: string,
	license: { readonly name: string; readonly url: string; readonly sha: string } | null,
): AgreementText {
	const lines = license
		? [
				`${repo} に送る変更 (コード、文書など) を、このリポジトリのライセンス (${license.name}) で、追加の条件なしに提供します。`,
				'送る変更は、自分が作ったもの、またはそのライセンスで提供してよいものです。',
				'',
				`ライセンス: ${license.url}`,
			]
		: [
				`${repo} に送る変更 (コード、文書など) を、このリポジトリの管理者が定める条件で提供することに同意します。`,
				'送る変更は、自分が作ったもの、またはそのように提供してよいものです。',
			];
	return { body: lines.join('\n'), version: license ? `license:${license.sha}` : 'none' };
}

/**
 * PR の作者に同意を求めなくてよいか。Bot (Renovate など) だけ求めない。
 * リポジトリの持ち主やメンバーにも、ほかの人と同じく、リポジトリごとに 1 回求める
 */
export function isExempt(author: { readonly type: string }): boolean {
	return author.type === 'Bot';
}

export function requestComment(login: string, repo: string, agreeUrl: string): string {
	return [
		MARKER,
		`@${login} PR をありがとうございます。`,
		'',
		`${repo} では、変更を受け取る前に、ライセンスへの同意をお願いしています (このリポジトリで 1 回です)。次のページで内容を確かめ、GitHub でログインして同意してください。同意すると、このコメントが書き換わり、検査「${STATUS_CONTEXT}」が通ります。`,
		'',
		`- [ライセンスへの同意のページ](${agreeUrl})`,
	].join('\n');
}

export function confirmedComment(login: string): string {
	return [
		MARKER,
		`@${login} さんの、ライセンスへの同意を確かめました。ありがとうございます。`,
	].join('\n');
}

/** owner/repo の形か (URL の引数から受け取る値を確かめる) */
export function isRepositoryName(value: string): boolean {
	return /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(value);
}

/**
 * 受け付けてよい持ち主 (組織かユーザー) のリポジトリか。GitHub の名前は大文字と小文字を区別しない。
 * App を公開にすると、だれでも自分のリポジトリにインストールできるので、ほかの持ち主のものは断る
 */
export function isAllowedRepository(repo: string, allowedOwners: readonly string[]): boolean {
	const owner = repo.split('/')[0]?.toLowerCase();
	return allowedOwners.some((allowed) => allowed.toLowerCase() === owner);
}

/** カンマ区切りの持ち主の一覧 (Worker の変数 ALLOWED_OWNERS) を読む */
export function parseAllowedOwners(value: string): string[] {
	return value
		.split(',')
		.map((owner) => owner.trim())
		.filter((owner) => owner !== '');
}

/** URL の引数の PR の番号を読む。正の整数でなければ undefined */
export function parsePullNumber(value: string | undefined): number | undefined {
	if (value === undefined || !/^[1-9][0-9]{0,9}$/.test(value)) return undefined;
	return Number(value);
}
