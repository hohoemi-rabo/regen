# Regen ― 下り坂は、燃料になる。

路線バスのEV化適性を、公共交通オープンデータ(GTFS)と国土地理院の標高データだけで診断する
意思決定支援サービス。公共交通オープンデータチャレンジ2026 応募作品。

- 公開サイト: https://regen.rabo-hohoemi.workers.dev
- **手法・仮定・出典・限界の説明: https://regen.rabo-hohoemi.workers.dev/about**
  (どのデータをどう計算し、どこまで信用してよいかを1ページにまとめてある)
- 企画書: `docs/企画書_v0.2.md`
- 要件定義: `docs/REQUIREMENTS_v1.0.md`
- 動くプロトタイプ(検証時のもの): `docs/prototype/` をブラウザで開く

## セットアップ(初回のみ)

Node 22.13以上とpnpmが必要(pnpm 11 が Node 22.13+ を要求する)。pnpmが無ければ:

```bash
npm install -g pnpm
```

依存のインストールとテスト:

```bash
pnpm install
pnpm seed:local  # ビルド用のローカルD1/R2を data/bundle/ から復元(オフライン・約70秒)
pnpm test        # ゴールデンテスト(46路線がPython版と一致)+ CSVパーサ等の単体テスト
pnpm dev         # http://localhost:3000
```

**`pnpm seed:local` は初回に必ず要る。** 画面もAPIもD1/R2から読み、46路線の診断書は
ビルド時に事前生成されるので、ローカルD1が空だとビルドが落ちる。`.wrangler/` は
gitignoreなのでクローン直後は空。診断は回さずコミット済みの成果物を書き戻すだけなので、
ネットワークに繋がっていなくても通る。

`pnpm test` が全部緑なら、診断エンジンのTypeScript移植は成功している。

## バージョン方針

- Next.js **15.5.24** に固定(勝手に上げない)
- Tailwind CSS **3.4.17** に固定(v4は使わない)

## リポジトリ構成

```
apps/web/        Next.js(画面 + Route Handlers) → Cloudflare Workersへデプロイ
packages/core/   診断エンジン(UI非依存TS。ブラウザ/Node両対応)
packages/db/     Drizzleスキーマ(Cloudflare D1)
batch/           データ更新バッチ(GTFS取得→標高→診断→R2/D1)
data/gtfs_zips/  南信州11フィードのGTFS原本(バッチが取得して更新)
data/bundle/     バッチの生成物8ファイル(46路線の診断結果・プロファイル・ダイヤ +
                 d1.json = ローカルD1/R2を復元するための版・距離・勾配)
docs/            企画書・要件定義・検証プロトタイプ・サンプルCSV
apps/web/public/about/  /about に載せる図版(46路線マップのSVG・画面写真)
```

## バッチを動かす

GTFSの取得・展開から公開まで1コマンドで通る。標高タイルは国土地理院から取得し
`batch/.cache/dem/` にキャッシュされる(2回目以降は取り直さない)。

```bash
pnpm batch                    # 取得 → 診断 → ローカルD1/R2へ公開
pnpm batch -- --remote        # 本番へ公開
```

フィードが更新されていなければ、再計算せず数秒で終わる。
前回と公開値が変わった場合は**公開せずに差分を出して止まる**ので、内容を確認してから
`pnpm batch -- --allow-changes` で通す。

ネットワークに触らず成果物だけ作り直したいとき:

```bash
pnpm batch -- --skip-fetch --no-publish
```

週次(月曜05:00 JST)の自動実行は `.github/workflows/batch.yml`
(`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` の登録が必要)。

## Cloudflareへのデプロイ(後日)

要件定義書 §10-11 を参照。おおまかには:

```bash
npx wrangler login
npx wrangler d1 create regen-db        # → database_id を apps/web/wrangler.jsonc に貼る
npx wrangler r2 bucket create regen-bundles
pnpm --filter web run deploy   # ルートで実行。`run` を省くとpnpm組み込みのdeployが動いてしまう
```

## CI / デプロイ

| ワークフロー | トリガ | 内容 |
|---|---|---|
| `ci` | PR / main以外へのpush | 型チェック・Lint・テスト |
| `deploy` | **mainへのpush** / 手動 | `ci` → ローカルD1/R2をシード → build → 本番D1マイグレーション → deploy → 疎通確認 |
| `batch` | 週次(月曜05:00 JST)/ 手動 | GTFS取得→診断→R2/D1。更新があれば `data/bundle/` をmainに戻し、deployを起こす |

**mainにpushすれば本番に出る。** 手でデプロイしたいときだけ `pnpm --filter web run deploy`
(`run` を省くとpnpm組み込みの `deploy` が動いてしまう)。
CIが落ちているとデプロイのジョブはスキップされる。

## データ出典

- GTFSデータリポジトリ(gtfs-data.jp) 南信州11フィード
  — 取得API: `https://api.gtfs-data.jp/v2/files`(対象は `data/feeds.source.json`)
- 国土地理院 標高タイル(10mメッシュ、z14)
  — `https://cyberjapandata.gsi.go.jp/xyz/dem/`
