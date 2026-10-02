# AI エージェントへの指示

このリポジトリで作業する AI エージェント (Claude Code、Codex など) への指示です。人間の開発者向けの決まりは [CONTRIBUTING.md](CONTRIBUTING.md) にあり、この文書と同じく守ってください。

## プロジェクトの概要

Funmary のリポジトリ (組織 funmary-app) で、PR の作者にライセンスへの同意を求める Cloudflare Worker です。GitHub App の Webhook で PR を見張り、同意のページで GitHub のログインと同意を受け付け、D1 に記録します。経路は Hono で作ります。仕組みと準備の手順は [README.md](README.md) にあります。

## 言語

このプロジェクトは日本語で運営しています。

- 文書、コードのコメント、コミットメッセージ、Issue、PR、テストの名前 (`it('...')`) は日本語で書く
- コミットメッセージの接頭辞 (`feat:` など) と、コードの識別子は英語にする
- 日本語の文の途中で改行しない。改行は段落や箇条書きの区切りだけにする
- 全角の記号は使わない (！と？を除く)。括弧は `()`、コロンは `:` のように半角にする
- GitHub のアラート (`> [!NOTE]` など) の中に空行を入れるときは、`>` の後ろに半角の空白を 3 つ置く

## コマンド

| コマンド           | 内容                                                     |
| ------------------ | -------------------------------------------------------- |
| `pnpm install`     | 依存を入れる                                             |
| `pnpm dev`         | 手元で動かす (秘密の値は `.dev.vars` に書く)             |
| `pnpm format`      | Prettier で整形する                                      |
| `pnpm typecheck`   | `tsc` (TypeScript 7)                                     |
| `pnpm test`        | Vitest                                                   |
| `pnpm build:check` | Cloudflare に送らずに、組み立てられるかを確かめる        |
| `pnpm types`       | `wrangler.jsonc` から `worker-configuration.d.ts` を作る |

変更を終えたら、`pnpm format:check`、`pnpm typecheck`、`pnpm test`、`pnpm build:check` がすべて通ることを確かめてください。

Windows で開発しているので、npm scripts に POSIX シェル前提の書き方 (`VAR=x cmd`、`rm -rf`) を使わないでください。

## 作業の進め方

- 作業は GitHub の Issue に対応させる
- main からブランチを切って作業し、PR にする。main に直接 push しない
- コミットメッセージとブランチ名は CONTRIBUTING.md の決まりに従う。commitlint が検査する
- 分からないことや、作者が決めるべきことは、推測で進めずに質問する
- 各自の手元だけの指示は、Git の管理対象外の `CLAUDE.local.md` (Claude Code) や `AGENTS.local.md` に書く。これらはコミットしない

## 守ること

- 秘密情報 (GitHub App の秘密鍵、Client secret、Webhook secret、署名の鍵、API トークン) と個人情報を、コード、テストのデータ、ログ、コミットに入れない。テストで鍵が要るときは、テストの中でその場で作る
- Worker の本番の URL (`workers.dev` のサブドメイン) を書かない。例には `license.example.workers.dev` のような架空の値を使う
- 同意の文面など、GitHub から読んだ文字列は HTML として解釈しない。画面に出すときは `hono/html` のエスケープに任せる
- 受け付けるリポジトリは、持ち主 (`ALLOWED_OWNERS`) で限る。持ち主の確かめを外す変更はしない
- 同意の記録は、リポジトリと人の ID で持つ。名前 (`owner/repo`、ログイン名) をキーにしない
- 外部 (GitHub、D1、時刻) との接続は `createApp` の引数で受け取り、テストで差し替えられるようにする
- 依存を足すときは、なるべく小さく、保守が続いていて、非推奨になっていないものを選ぶ

## スキル

`.agents/skills/` に、作業に使うスキルを入れています。該当する作業では、対応するスキルを読んでから始めてください。

| スキル                                         | 使うとき                                               |
| ---------------------------------------------- | ------------------------------------------------------ |
| `hono`                                         | Hono の経路を書くとき                                  |
| `pnpm`                                         | 依存の追加や、workspace の設定を変えるとき             |
| `vitest`                                       | 単体テストを書くとき                                   |
| `tdd`                                          | 機能を足す、不具合を直すとき。テストを先に書く         |
| `code-review`                                  | ブランチや PR の変更を見直すとき                       |
| `diagnosing-bugs`                              | 原因の分からない不具合を調べるとき                     |
| `codebase-design`、`typescript-design`         | モジュールの分け方、型、エラーの扱いを考えるとき       |
| `hush-review`、`hush-fix`                      | コードのコメントの質を確かめる、直すとき               |
| `natural-japanese`、`stop-ai-slop-jp`          | README、Issue、PR などの日本語の文章を書く、直すとき   |
| `fix-unnatural-line-breaks`                    | 文の途中の不自然な改行を直すとき                       |
| `token-saver-claude-code`、`token-saver-codex` | 使用量の上限に近いとき、指示ファイルや設定を見直すとき |

スキルは [skills CLI](https://github.com/vercel-labs/skills) で管理しています。足すときは `npx skills add <owner/repo> -s <スキル名> -a codex -a claude-code -y` を使い、`.agents/skills/` と `skills-lock.json` をコミットします。`.claude/` と `.agent/` は各自の手元の設定なので、コミットしません。
