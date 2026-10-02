// 同意の記録 (D1 の agreements)。リポジトリごと、人ごと、同意した文面の版ごとに 1 行持つ。
// リポジトリと人は ID で見分ける (名前を変えたり、リポジトリを移管したりしても、記録が切れないように)。

export interface AgreementKey {
	readonly repositoryId: number;
	readonly githubUserId: number;
	readonly version: string;
}

export interface AgreementStore {
	hasAgreed(key: AgreementKey): Promise<boolean>;
	/** 同意を記録する。同じリポジトリ、同じ人、同じ版の記録が既にあれば、何もしない */
	record(
		entry: AgreementKey & {
			readonly repositoryName: string;
			readonly githubLogin: string;
			readonly agreedAt: Date;
		},
	): Promise<void>;
}

export function createD1Store(db: D1Database): AgreementStore {
	return {
		async hasAgreed(key) {
			const row = await db
				.prepare(
					'SELECT 1 FROM agreements WHERE repository_id = ? AND github_user_id = ? AND version = ?',
				)
				.bind(key.repositoryId, key.githubUserId, key.version)
				.first();
			return row !== null;
		},
		async record(entry) {
			await db
				.prepare(
					'INSERT OR IGNORE INTO agreements (repository_id, repository_name, github_user_id, github_login, version, agreed_at) VALUES (?, ?, ?, ?, ?, ?)',
				)
				.bind(
					entry.repositoryId,
					entry.repositoryName,
					entry.githubUserId,
					entry.githubLogin,
					entry.version,
					entry.agreedAt.toISOString(),
				)
				.run();
		},
	};
}
