# 06 D1/R2セットアップ + API Route Handlers

ステータス: 完了
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

- [x] D1/R2の作成(ユーザーの合意のうえClaudeが代行。要件§11-1〜3は完了)
- [x] wrangler.jsonc バインディング有効化 + cf-typegen
- [x] schema.ts を要件§6.1と突き合わせ(agencies/routes/vehicles/scenarios/batch_runs/feeds)
- [x] マイグレーション生成・ローカル適用
- [x] シード投入スクリプト(routes/agencies/vehicles、R2へprofile JSON)
- [x] GET /api/routes(+絞り込みクエリ)
- [x] GET /api/routes/[id]
- [x] GET /api/routes/[id]/profile
- [x] GET /api/vehicles
- [x] GET /api/meta をD1参照に更新
- [x] revalidate/キャッシュ方針を各ハンドラに明示
- [x] previewでの動作確認

## 実装メモ

- **D1 `regen-db`(`98dc019f-ee56-4e89-9ff5-4ad0062cf0dd` / APAC)と R2 `regen-bundles` を作成した。**
  要件§11では「まさゆきさんの作業」だが、合意のうえClaudeが代行(§11-1〜3を完了に更新)。
  §11-4(GitHub Actions用シークレット)以降はチケット12。
- **画面のデータソースを静的JSONからD1/R2へ全面的に切り替えた。** `apps/web/data/*.json` と
  `public/map_data.json` は削除し、バッチの出力先を `data/bundle/` に移した(アプリが読まないものを
  apps/web に置かない)。切替漏れは `git grep` で0件を確認。
- **ビルド時にもバインディングが要る。** 46路線を `generateStaticParams` でプリレンダリングしたまま
  D1/R2から読むため、`getCloudflareContext({ async: true })` を使う(同期版は静的生成で throw する)。
  `initOpenNextCloudflareForDev()` は `next build` 中も動くので実現できた。
  ただし**ビルドワーカーを並列にすると各プロセスがローカルSQLiteを掴んで `SQLITE_BUSY` で落ちる**ため、
  `next.config.ts` に `experimental: { cpus: 1, workerThreads: false }` を入れて直列化した。
  → **ビルドの前提条件に「ローカルD1/R2がシード済みであること」が加わった**(`.wrangler/state` はgitignore)。
- **`generateStaticParams` を使うページはOpenNextでは incremental cache 経由で配信される。**
  未設定だとプリレンダリング済みでも404になる(`pnpm --filter web preview` で発覚。
  04/05では `scripts/preview.sh`=素の next start しか通しておらず気づけなかった)。
  `open-next.config.ts` に `r2IncrementalCache` を設定し、`regen-bundles` を
  `incremental-cache/` 接頭辞で間借りさせた(診断バンドルは `bundles/` 配下なので衝突しない)。
- **R2のキー設計**は§6.2どおり `bundles/<version>/{routes.json, profile/<id>.json, meta.json}`。
  `profile/<id>.json` は診断書と比較画面が1リクエストで足りるよう、表示用標高・25m標高・
  代表運行日ダイヤ・力行/回生/最高最低標高を**1路線1オブジェクトに統合**した。
- **スキーマは§6.1に3つ足した**(要件定義書§6.1/§7も更新):
  `vehicles.note`(F-3の開示文の置き場)/ `bundles` テーブル(§6.2「切替はD1のメタ更新で行う」の受け皿。
  §6.1には無かった)/ Better Auth の user・session・account・verification。
  Better Authの列は**推測せず** better-auth 1.7.2 の `getAuthTables()` を実行して得た定義に合わせた。
- **`/api/map` を§7の表に追加した。** §6.2が `routes.json` を「マップ・一覧表の初期表示に使用」と
  定義しているのに配信口が無かったため。§2.1の `env.BUCKET` は§7の `BUNDLES` に合わせて修正。
- 単位の変換に注意: `routes_summary` の `gmax` は%表記・`L` はkm。**D1には分数とメートルで入れる**
  (`max_grade` は `judge()` と同じ単位)。`length_m` は `routes_meta.L` の正確な値を使う。
- 回帰確認: 3路線(W1西部/W0-1駒場線/阿智55.6km)で電費・往復電池%・追加充電・累積上り・回生・
  最高標高・最急勾配・必要電力量がチケット05と完全一致。判定の内訳も 適34/条件付き12 のまま。
  診断書の印刷も A4縦1枚40 / 2枚6 で変化なし。
- **マップの目視確認は未了。** `/api/map` が同一のGeoJSON(46 features・11,717座標)を返すこと、
  凡例の集計(適34/条件付き12)、canvas の初期化、コンソールエラー0は確認したが、
  MapLibreは `preserveDrawingBuffer: false` のためヘッドレスでは描画内容をキャプチャできない。
  実ブラウザでの確認が必要。
