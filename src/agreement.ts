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
 * PR の作者に同意を求めなくてよいか。書き込み権限のある人 (author_association で判断する) と Bot は求めない。
 * author_association は GitHub の Webhook が付ける値 (OWNER、MEMBER、COLLABORATOR、CONTRIBUTOR、NONE など)
 */
export function isExempt(author: { readonly type: string; readonly association: string }): boolean {
	return author.type === 'Bot' || ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(author.association);
}

export function requestComment(login: string, repo: string, agreeUrl: string): string {
	return [
		MARKER,
		`@${login} PR をありがとうございます。`,
		'',
		`${repo} では、外部の方から変更を受け取る前に、ライセンスへの同意をお願いしています (このリポジトリで 1 回です)。次のページで内容を確かめ、GitHub でログインして同意してください。同意すると、このコメントが書き換わり、検査「${STATUS_CONTEXT}」が通ります。`,
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
