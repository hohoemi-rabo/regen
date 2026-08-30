# Regen ― 下り坂は、燃料になる。

路線バスのEV化適性を、公共交通オープンデータ(GTFS)と国土地理院の標高データだけで診断する
意思決定支援サービス。公共交通オープンデータチャレンジ2026 応募作品。

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
pnpm test        # ゴールデンテスト: 南信州46路線の診断結果がPython版と一致することを確認
pnpm dev         # http://localhost:3000 (仮トップページ: 実診断データの一覧が出る)
```

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
data/bundle/     バッチの生成物(46路線の診断結果・プロファイル・ダイヤ)
docs/            企画書・要件定義・検証プロトタイプ
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

## データ出典

- GTFSデータリポジトリ(gtfs-data.jp) 南信州11フィード
  — 取得API: `https://api.gtfs-data.jp/v2/files`(対象は `data/feeds.source.json`)
- 国土地理院 標高タイル(10mメッシュ、z14)
  — `https://cyberjapandata.gsi.go.jp/xyz/dem/`
