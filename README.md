# Regen ― 下り坂は、燃料になる。

路線バスのEV化適性を、公共交通オープンデータ(GTFS)と国土地理院の標高データだけで診断する
意思決定支援サービス。公共交通オープンデータチャレンジ2026 応募作品。

- 企画書: `docs/企画書_v0.2.md`
- 要件定義: `docs/REQUIREMENTS_v1.0.md`
- 動くプロトタイプ(検証時のもの): `docs/prototype/` をブラウザで開く

## セットアップ(初回のみ)

Node 20以上とpnpmが必要。pnpmが無ければ:

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
batch/           診断バンドル生成バッチ(GTFS→標高→診断→JSON)
data/gtfs_zips/  南信州11フィードのGTFS(取得日: 2026-08-29)
data/seed/       実診断済みデータ(46路線)。画面開発はまずこれを使う
docs/            企画書・要件定義・検証プロトタイプ
```

## バッチを動かす(任意・画面開発だけなら不要)

GTFSを展開してから実行する。標高タイルは国土地理院から取得し `.cache/dem/` にキャッシュされる。

```bash
cd data/gtfs_zips
for z in *.zip; do d="../gtfs/$(basename "$z" .zip)"; mkdir -p "$d"; unzip -o "$z" -d "$d"; done
cd ../..
pnpm batch       # → batch/out/bundles/ に routes.json と profile/*.json が生成される
```

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
- 国土地理院 標高タイル(10mメッシュ)
