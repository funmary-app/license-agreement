-- ライセンスへの同意の記録。リポジトリごと、人ごと、同意した文面の版ごとに 1 行。
-- リポジトリと人は ID で見分ける (名前を変えたり、移管したりしても、記録が切れないように)。名前は、あとで読むための控え
CREATE TABLE agreements (
	repository_id INTEGER NOT NULL,
	repository_name TEXT NOT NULL,
	github_user_id INTEGER NOT NULL,
	github_login TEXT NOT NULL,
	version TEXT NOT NULL,
	agreed_at TEXT NOT NULL,
	PRIMARY KEY (repository_id, github_user_id, version)
);
