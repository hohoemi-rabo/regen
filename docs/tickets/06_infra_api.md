# 06 D1/R2セットアップ + API Route Handlers

ステータス: 未着手
依存: なし(02〜05と並行可)。07/08/10 の前提
参照: 要件§6(データ設計) §7(API設計)、CLAUDE.md(バインディング)

## スコープ

- D1作成(`wrangler d1 create regen-db`)・R2作成(`regen-bundles`)は**ユーザー作業**(要件§11)。手順を提示して実行してもらう
- wrangler.jsonc のバインディングのコメントを外し database_id を設定
- Drizzleマイグレーション生成・適用(packages/db/schema.ts は作成済み。§6.1と突き合わせて過不足を直す)
- `wrangler types --env-interface CloudflareEnv` で型生成
- API実装(認証不要分):
  - GET /api/routes(絞り込み: 判定・事業者)
  - GET /api/routes/[id]
  - GET /api/routes/[id]/profile(R2から返す)
  - GET /api/vehicles
  - GET /api/meta(既存を D1参照に更新)
- 各GETに `export const revalidate` を明示(CLAUDE.md: Route Handlerは既定非キャッシュ)
- シードデータ投入スクリプト(data/seed → ローカルD1/R2)

## 受入条件

- next dev(initOpenNextCloudflareForDev)でローカルD1/R2が動く
- `pnpm --filter web preview` でWorkers環境でも動く
- サーバー専用モジュールに `import "server-only"`
- 接続文字列・シークレットがリポジトリに存在しない

## Todo

- [ ] ユーザーへD1/R2作成手順を提示(実行はユーザー)
- [ ] wrangler.jsonc バインディング有効化 + cf-typegen
- [ ] schema.ts を要件§6.1と突き合わせ(agencies/routes/vehicles/scenarios/batch_runs/feeds)
- [ ] マイグレーション生成・ローカル適用
- [ ] シード投入スクリプト(routes/agencies/vehicles、R2へprofile JSON)
- [ ] GET /api/routes(+絞り込みクエリ)
- [ ] GET /api/routes/[id]
- [ ] GET /api/routes/[id]/profile
- [ ] GET /api/vehicles
- [ ] GET /api/meta をD1参照に更新
- [ ] revalidate/キャッシュ方針を各ハンドラに明示
- [ ] previewでの動作確認
