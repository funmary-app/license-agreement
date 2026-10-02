# license-agreement

Funmary のリポジトリ (組織 [funmary-app](https://github.com/funmary-app)) で、外部の人 (リポジトリに書き込み権限のない人) の PR に、ライセンスへの同意を求める Cloudflare Worker です。

1. 外部の人が PR を開く (または push する) と、GitHub App の Webhook が届く
2. そのリポジトリでの同意の記録がなければ、PR に案内のコメント (同意のページへのリンク) を送り、検査「ライセンスへの同意」を「待ち」にする
3. 作者が同意のページで GitHub にログインし、「同意する」を押すと、D1 に記録し、その人がそのリポジトリで開いている PR の検査を通す

- 同意は**リポジトリごとに 1 回**です。同じ人でも、別のリポジトリでは、もう一度同意を求めます
- リポジトリの持ち主、組織のメンバー、共同作業者と、Bot (Renovate など) の PR には、同意を求めません
- 記録は、リポジトリと人の ID で持ちます。リポジトリの名前を変えたり、移管したりしても、記録は切れません

## 同意してもらう文面

各リポジトリの既定のブランチの `.github/license-agreement.md` を、そのまま同意のページに出します (HTML としては解釈せず、ただの文字として出します)。

- このファイルの版 (Git の blob の SHA) を、同意の版として記録します。文面を変えると、前の版に同意した人にも、もう一度同意を求めます
- ファイルがないリポジトリでは、GitHub が判定したそのリポジトリのライセンスへのリンクを出します。版は、ライセンスのファイルの SHA です

## リポジトリを対象に加える

1. そのリポジトリに `.github/license-agreement.md` を置く (書き方は、このリポジトリのものを参考にする)
2. GitHub App (下の「最初の準備」で作るもの) を、そのリポジトリにもインストールする
3. そのリポジトリの ruleset の必須の検査に「ライセンスへの同意」を足す (送り元を、この GitHub App に限る)

## 開発

```sh
pnpm install
pnpm dev            # 手元で動かす。秘密の値は .dev.vars (Git の管理対象外) に書く
pnpm format         # 整形
pnpm typecheck      # 型の検査
pnpm test           # テスト
pnpm build:check    # Cloudflare に送らずに、組み立てられるかを確かめる
```

`wrangler.jsonc` を変えたら、`pnpm types` で `worker-configuration.d.ts` を作り直します。

## 最初の準備 (作者の操作)

順番に行います。`wrangler.jsonc` の `secrets.required` にある秘密の値がそろうまで、Worker は反映できません。そのため、GitHub App を先に作り、秘密の値を置いてから反映します。

Worker の URL は `https://license-agreement.<アカウントのサブドメイン>.workers.dev` です。サブドメインは、Cloudflare のダッシュボードの Workers & Pages で確かめられます。反映の前から URL は決まっているので、1 の GitHub App の設定にそのまま使えます。

### 1. GitHub App

組織 `funmary-app` の Settings の Developer settings から、GitHub App を作ります。

| 項目                                                   | 値                                                                                                                                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Redirect URI                                           | `<Worker の URL>/callback`                                                                                                                                                                                |
| Request user authorization (OAuth) during installation | 外す                                                                                                                                                                                                      |
| Webhook URL                                            | `<Worker の URL>/webhook`                                                                                                                                                                                 |
| Webhook secret                                         | 推測できない長い文字列 (`openssl rand -hex 32` など)                                                                                                                                                      |
| Repository permissions                                 | Contents: Read-only (同意の文面とライセンスを読む)、Pull requests: Read and write (PR に案内のコメントを書く)、Issues: Read and write、Commit statuses: Read and write (Metadata: Read-only は自動で付く) |
| Subscribe to events                                    | Pull request                                                                                                                                                                                              |
| Where can this GitHub App be installed?                | Only on this account                                                                                                                                                                                      |

作ったら、次を行います。

1. Client secret を作って控える。Client ID も控える
2. 秘密鍵 (Private key) を作ってダウンロードする。GitHub が配る鍵は PKCS#1 の形なので、Worker で読める PKCS#8 の形に変換する

   ```sh
   openssl pkcs8 -topk8 -nocrypt -in ダウンロードした鍵.pem -out key-pkcs8.pem
   ```

3. App を、対象のリポジトリ (`funmary-app/funmary` と、このリポジトリ) にインストールする

### 2. Worker の秘密の値と、最初の反映

`pnpm exec wrangler login` でログインしてから、秘密の値を置きます。Worker がまだないときは、最初の `wrangler secret put` が「Worker を作るか」を聞くので、作ります (中身が空の Worker ができます)。

```sh
pnpm exec wrangler secret put GITHUB_APP_ID           # App の ID (App の設定画面の上にある数字)
pnpm exec wrangler secret put GITHUB_APP_PRIVATE_KEY  # key-pkcs8.pem の中身 (BEGIN PRIVATE KEY の行から END の行まで)
pnpm exec wrangler secret put GITHUB_WEBHOOK_SECRET   # 1 の Webhook secret
pnpm exec wrangler secret put GITHUB_CLIENT_ID
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET
pnpm exec wrangler secret put SIGNING_KEY             # 推測できない長い文字列 (openssl rand -hex 32 など)
```

秘密鍵のファイル (`key-pkcs8.pem` とダウンロードした鍵) は、置いたら手元から消します。

6 つそろったら、`pnpm run deploy` で Worker と D1 のマイグレーションを反映します。

D1 は、初めての反映のときに Wrangler が作ります (`wrangler.jsonc` に `database_id` は書きません)。そのとき Wrangler が `wrangler.jsonc` に `database_id` を書き足しますが、コミットせずに戻して構いません。次からの反映も、同じ D1 につながります。fork して自分のアカウントで動かすときも、同じ手順で D1 ができます。

### 3. 自動の反映と、必須の検査

1. Cloudflare で API トークンを作る (権限: Account の Workers Scripts: Edit と D1: Edit)
2. このリポジトリの Settings で、環境 `production` を作り、secret の `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を置く。リポジトリの変数 (Variables) に `DEPLOY_ENABLED` (`true`) を置く。これで、main が変わるたびに反映される
3. 対象のリポジトリの ruleset の必須の検査に「ライセンスへの同意」を足す (送り元を、作った GitHub App に限る)
4. 書き込み権限のない別のアカウントで試しに PR を開き、案内のコメントと同意の流れを確かめる

## Wrangler の後継 (cf CLI)

Cloudflare は Wrangler の後継の CLI「cf」をオープンベータで出しています。cf の安定版が出たら移します (Issue で管理する)。

## ライセンス

BSD 3-Clause License ([LICENSE-BSD-3-CLAUSE](LICENSE-BSD-3-CLAUSE)) と Apache License, Version 2.0 ([LICENSE-APACHE-2.0](LICENSE-APACHE-2.0)) のデュアルライセンスです。外部の方の PR では、このリポジトリでも、初めての PR のときにライセンスへの同意をお願いしています。
