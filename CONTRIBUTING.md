# 開発への参加

license-agreement の開発に参加する人に向けた決まりと手順です。文書、コードのコメント、コミットメッセージ、Issue、PR は日本語で書きます。

## 手元で動かす

### 用意するもの

- Git
- [fnm](https://github.com/Schniz/fnm) (Node.js の版の管理)。シェルの設定に `fnm env --use-on-cd` を入れておくと、リポジトリに入ったときに `.nvmrc` の版 (24 系) へ自動で切り替わります
- [pnpm](https://pnpm.io/ja/installation)。版は `package.json` の `packageManager` に書いたものが使われます

### 初回の手順

```sh
git clone https://github.com/funmary-app/license-agreement.git
cd license-agreement
fnm install
fnm use
pnpm install
pnpm test
```

`pnpm install` のときに、コミット前の検査を行う Git のフック (simple-git-hooks) も入ります。手元で Worker を動かすとき (`pnpm dev`) は、秘密の値を `.dev.vars` に書きます (README.md の「開発」)。

### よく使うコマンド

| コマンド           | 内容                                                                    |
| ------------------ | ----------------------------------------------------------------------- |
| `pnpm dev`         | 手元で Worker を動かす                                                  |
| `pnpm format`      | Prettier で整形する。`pnpm format:check` は確認だけ                     |
| `pnpm typecheck`   | TypeScript 7 の `tsc` で型を検査する                                    |
| `pnpm test`        | Vitest で単体テストを実行する                                           |
| `pnpm build:check` | Cloudflare に送らずに、Worker を組み立てられるかを確かめる              |
| `pnpm types`       | `wrangler.jsonc` を変えたあとに、`worker-configuration.d.ts` を作り直す |

## 作業の流れ

1. 作業は Issue から始めます。Issue がなければ、テンプレート (不具合の報告、機能の提案、作業) を選んで作ります。
2. main からブランチを切ります。main に直接 push はしません。
3. 変更をコミットし、PR を作ります。PR の本文に `Closes #123` のように Issue の番号を書くと、マージしたときに Issue が閉じます。
4. このリポジトリでも、初めての PR のときに、ライセンスへの同意をお願いしています (Bot を除くすべての人。リポジトリごとに 1 人 1 回で、同意の文面を変えたときは、もう一度お願いします)。PR に届く案内のコメントのリンクから、GitHub でログインして同意してください。同意すると、検査「ライセンスへの同意」が通ります。
5. 必須の検査 (「検査とテスト」、「コミットメッセージの検査」、「秘密情報の混入検査」、「ライセンスへの同意」) がすべて通ったら、merge commit でマージします。PR の中のコミットはそのまま main の履歴に残り、merge commit のメッセージには PR のタイトルと本文が入ります。そのため、各コミットと PR のタイトルの両方をコミットメッセージの決まりに合わせます。main にマージすると、Cloudflare に自動で反映されます。

### ブランチ名

`<種類>/<内容>` の形で、英小文字の単語をハイフンでつなぎます。種類はコミットメッセージの種類と同じものを使います。

```
feat/allowed-owners
fix/agreement-text-base64
docs/contributing
```

## コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/ja/v1.0.0/) の形に合わせます。接頭辞 (種類とスコープ) は英語、説明は日本語で書きます。スコープは省いてかまいません。

```
<種類>(<スコープ>): <説明>

<本文 (任意)>

<フッター (任意)>
```

例:

```
feat: 受け付けるリポジトリの持ち主を限る
fix: 同意の文面の Base64 から、空白だけを取り除く
docs: GitHub App の権限の表を直す
chore(deps): 依存を更新: hono → ^4.14.0
```

### 種類

| 種類       | 使うとき                                          |
| ---------- | ------------------------------------------------- |
| `feat`     | 機能を足す、変える                                |
| `fix`      | 不具合を直す                                      |
| `docs`     | 文書だけを変える                                  |
| `style`    | 動きを変えない見た目の整形 (空白、セミコロンなど) |
| `refactor` | 動きを変えずにコードの構造を直す                  |
| `perf`     | 速さや軽さを改善する                              |
| `test`     | テストを足す、直す                                |
| `build`    | ビルドの仕組みや依存を変える                      |
| `ci`       | CI の設定を変える                                 |
| `chore`    | 上のどれにも当てはまらない雑務                    |
| `revert`   | 以前のコミットを取り消す                          |

### スコープ

付けるときは、`deps`、`ci`、`repo`、`docs` のどれかにします。

### 説明の書き方

- 何をしたかを日本語で簡潔に書きます。目安は全角 30 字程度で、ヘッダー全体は 100 文字までです。
- 文末に句点 (。) を付けません。
- 本文には、なぜその変更をしたかを書きます。
- 互換性を壊す変更は、種類の後ろに `!` を付け (`feat!: ...`)、フッターに `BREAKING CHANGE: <内容>` を書きます。

コミットメッセージは commitlint で検査します。コミットのときには Git のフックが、PR では各コミットとタイトルを CI が検査します。

## コードの書き方

- 整形は Prettier に任せます。コミットのときに、変更したファイルだけ自動で整形されます。
- 秘密情報 (GitHub App の秘密鍵、Client secret、Webhook secret、API トークン) と個人情報は、コード、テストのデータ、ログに入れません。テストで鍵が要るときは、テストの中でその場で作ります。CI の「秘密情報の混入検査」(gitleaks) が調べます。
- Worker の本番の URL を書きません。README.md では `<アカウントのサブドメイン>` と書きます。
- GitHub から読んだ文字列 (同意の文面など) は HTML として解釈しません。
- ほかのプロジェクトのコードをコピーしません。

## テスト

- 単体テストは Vitest で書き、対象のファイルと同じ場所に `*.test.ts` として置きます。
- GitHub、D1、時刻は `createApp` の引数で差し替えます。テストから本物の API を呼びません。
- 不具合を直すときは、先にその不具合を再現するテストを書きます。

## 依存の更新

依存の更新は Renovate が PR を作ります。自分で依存を上げる PR は作らなくてかまいません。

- 第 1 と第 3 月曜の 10 時台 (日本時間) に、パッチとマイナーの更新を 1 つの PR にまとめます。
- メジャーの更新は、同じ時刻にパッケージごとの PR になります。変更点を読んでから手でマージします。
- 公開から 3 日たっていない版は取り込みません。
- 脆弱性の修正は、時刻を待たずに PR になります。

## AI エージェントを使うとき

AI エージェントへの指示は [AGENTS.md](AGENTS.md) にまとめています。エージェント向けのスキルは `.agents/skills/` にあり、[skills CLI](https://github.com/vercel-labs/skills) で管理しています。`skills-lock.json` から復元するには `npx skills experimental_install` を実行します。
