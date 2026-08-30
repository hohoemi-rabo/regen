# CLAUDE.md — Regen 開発ガイド

## プロジェクト概要

路線バスのEV化適性を診断するWebサービス「Regen」。
公共交通オープンデータチャレンジ2026応募作品(締切 2027-01-11、提出目標 1/4)。
仕様の正本は `docs/REQUIREMENTS_v1.0.md`(機能はF-1〜F-8、アルゴリズムは§9)。
**UIの正本は `docs/DESIGN.md`**(色・文字・余白・コンポーネント)。
実装単位は `docs/tickets/`(00〜12、番号順=依存順)。着手前に該当チケットとDESIGN.mdの参照節を読むこと。

## 絶対に守ること

1. **Next.js 15.5.24 / Tailwind CSS 3.4.17 に固定。** アップグレードしない。Tailwind v4は使わない。
2. **診断アルゴリズム(packages/core)を変更したら必ず `pnpm test` を通す。**
   ゴールデンテスト(46路線)はPython検証版との一致を保証する回帰テスト。
   意図的にアルゴリズムを変える場合は、変更理由をコミットに書き、フィクスチャを再生成する。
3. **診断の既定パラメータ(core/src/params.ts)を勝手に変えない。** 要件定義書§9.2と対応している。
4. **一般利用者側に認証・会員登録を入れない。** Better Authは管理画面(F-7)のみ。
5. **F-4のCSVはサーバーに送らない。** アップロード経路を作らない(要件§5.3)。
6. **色・余白・文字はDESIGN.mdのトークン経由で使う。**コンポーネントに生のhexを書かない。
7. 判定は意味色3色 + 記号 + ラベルの3重で伝える(適=●#0ca30c / 条件付き=▲#fab219 / 要検討=■#d03b3b)。
   条件付きの**文字色だけは #b45309**(アンバーは明るい面でコントラスト不足のため。DESIGN.md §2.3)。
8. 新しい色を足さない。足す必要が出たらDESIGN.mdを更新してから実装する。
9. **チケットのTodoを必ず更新する。** 各チケット(docs/tickets/NN_*.md)のタスクは `- [ ]` で管理し、
   完了したら `- [x]` に書き換える。チケット全体が終わったら冒頭のステータスを「完了」にする。

## コマンド

```bash
pnpm install         # 依存インストール(ルートで)
pnpm dev             # apps/web を next dev で起動
pnpm test            # 診断エンジンのゴールデンテスト
pnpm batch           # F-8バッチ: GTFS取得→診断→R2/D1(ローカル)。更新が無ければ即終了
pnpm batch -- --remote          # 本番のD1/R2へ公開
pnpm batch -- --allow-changes   # 公開値の変化を承認して公開(既定は変化を見つけたら止まる)
pnpm batch -- --skip-fetch --no-publish   # 取得も書き込みもせず成果物だけ再生成(オフライン確認)
pnpm --filter @regen/db generate                   # スキーマ差分からマイグレーション生成
pnpm --filter web exec wrangler d1 migrations apply regen-db --local   # ローカルD1へ適用(--remoteで本番)
pnpm --filter web preview   # Workers環境でのローカル確認(OpenNext)
pnpm --filter web deploy    # Cloudflare Workersへデプロイ
```

## アーキテクチャの要点

- **重い計算はバッチで事前実行、画面は表示だけ**(要件§3.2)。
  例外はF-3車両比較とF-4実測補正で、これらは packages/core をブラウザで直接実行する。
- packages/core はUI非依存・依存ゼロ。ブラウザ/Node/バッチの3か所から同じコードを使う。
- D1はシナリオ共有(F-6)・車両マスタ・路線メタ用。プロファイル本体はR2のJSON。
- バインディングは `getCloudflareContext().env` から取得(接続文字列は存在しない)。
  next dev でも next.config.ts の initOpenNextCloudflareForDev() でローカルバインディングが使える。

## Next.js App Router(15.5.24)の作法

Context7で取得した公式ドキュメント(v15系)に基づく。App Routerの書き方で迷ったらこの節に従う。

### ファイル規約

- `apps/web/app/` 配下。`page.tsx` / `layout.tsx` / `loading.tsx` / `error.tsx` / `not-found.tsx` /
  `route.ts`(Route Handler)。`error.tsx` は `"use client"` 必須。
- 画面専用のUI部品は同じセグメント配下の `_components/` (アンダースコア = プライベートフォルダ)に置き、
  ルートを増やさない。複数画面で使うものだけ `app/_components/` に上げる。
- F-1マップ・F-2診断書のように失敗し得る画面には `error.tsx` と `loading.tsx` を必ず置く。

### params / searchParams は Promise(v15の破壊的変更)

```tsx
// Server Component
export default async function Page(props: {
  params: Promise<{ routeId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { routeId } = await props.params;
  const { mode = "A" } = await props.searchParams;
}
```

- `generateMetadata` も同じく `await` が必要。
- Client Component は async にできないので `use(params)` / `use(searchParams)` で解く。
- `cookies()` / `headers()` / `draftMode()` も非同期。同期アクセスのコードを書かない。

### Server / Client の境界

- **既定はServer Component。`"use client"` はツリーの葉に、最小範囲で置く。**
  MapLibre(F-1)、車両比較スライダー(F-3)、CSV読み込み(F-4)のようにブラウザAPIか状態が要る所だけ。
- サーバーで取得・整形し、Clientには**シリアライズ可能な値だけ**をpropsで渡す。
  関数・クラスインスタンス・Mapなどは渡らない。
- サーバー専用モジュール(D1/R2アクセス、`getCloudflareContext()`)の先頭に `import "server-only"` を書く。
  クライアントから誤importした時にビルドで落ちる(Nextがクライアントビルドで空モジュールに差し替える)。
- MapLibreのようにSSRできないライブラリは `next/dynamic` の `{ ssr: false }` で読み込む
  (`ssr: false` はClient Componentからのみ指定可)。
- packages/core はUI非依存なので両側から使える。ブラウザで動かす前提のコード(F-3/F-4)に
  Node専用APIを持ち込まない。

### データ取得とキャッシュ

- **`fetch` の既定はキャッシュしない**(v15で `no-store` 相当に変更)。キャッシュしたいときだけ明示する。

  ```ts
  await fetch(url, { cache: "force-cache" });       // 手動で無効化するまで保持
  await fetch(url, { next: { revalidate: 3600 } }); // 秒指定で再検証
  ```

- **GET Route Handler も既定で非キャッシュ。** `app/api/meta/route.ts` のように内容が滅多に変わらない
  ものは `export const revalidate = <秒>` を明示する。
- セグメント設定でレンダリング戦略を宣言する:
  `export const dynamic = "auto" | "force-static" | "force-dynamic" | "error"` / `export const revalidate`。
- 動的パスは `generateStaticParams()` で事前生成する。**46路線と件数が少ないので、F-2診断書は全件
  プリレンダリングを既定方針とする**(要件§3.2「重い計算はバッチ、画面は表示だけ」の延長)。
- 診断プロファイル(R2のJSON)は事実上イミュータブル。リクエストごとに再取得・再計算しない。

### ストリーミング

- 遅い部分は `loading.tsx` か `<Suspense>` で切り出し、ページ全体をブロックさせない。
- さらに細かく制御したいときは、サーバーで**awaitせずPromiseをpropsで渡し**、Client側で `use(promise)`
  で受ける(RSCペイロードを先に流せる)。

### Cloudflare Workers(OpenNext)固有の制約

- **`export const runtime = "edge"` を書かない。** OpenNextアダプタはNode.jsランタイム(既定)前提。
- `getCloudflareContext().env` はServer Component / Route Handler / Server Actionからのみ呼ぶ。
- `next/image` の既定の画像最適化ローダーはWorkers上でそのままは動かない。画像を使うなら
  静的アセット + 明示的な `width`/`height`、またはローダー設定をチケット12で決めてから。
- フォントは `next/font` でセルフホストし、外部リクエストとCLSを避ける(指定はDESIGN.mdに従う)。

### Server Actions

- 一般利用者側に認証がない(「絶対に守ること」#4)ため、**Server Actionは誰でも叩ける公開エンドポイント**と
  同じ。引数を信用せず、型と値域を検証してからD1に書く。サイズ上限も設ける。
- 使うのはF-6シナリオ共有の保存など**書き込みが必要な所だけ**。読み取りにServer Actionを使わない。
- **F-4のCSVはServer Action / Route Handlerに渡さない**(「絶対に守ること」#5)。
  パースも再診断もブラウザ内で完結させる。

### メタデータ

- `export const metadata: Metadata` / `generateMetadata` でtitle・description・OGを付ける。
  路線ページは路線名と判定を含める。共有される画面(F-6)ほど重要。

### やらないこと(アンチパターン)

- Client Componentで `useEffect` + `fetch` して描画する(サーバーで取ってpropsで渡す)。
- `map_data.json` のような大きなJSONをServer ComponentからClientへ丸ごとprops渡しする
  → RSCペイロードが膨張。**サーバー側で必要なフィールドだけに絞る**か、静的アセットとして
  クライアントから取得する。
- `"use client"` を `layout.tsx` やページ最上位に置き、配下を全部クライアント化する。
- キャッシュ挙動を暗黙に任せる。意図はセグメント設定かfetchオプションで**明示**する。

## 診断エンジン(packages/core)の処理順序 — 要件§9.1

resample(25m) → fillNulls → smooth(175m) →
モードA: slopeLimit(勾配12%上限でトンネル/高架補正) → smooth(125m)
モードB: anchorInterp(停留所間を線形補間)
→ エネルギー積算(力行/回生) → 空調加算 → 充電計画

## 現状(2026-08-30)

- 完了: 診断エンジンTS移植 + ゴールデンテスト(86件通過)、DBスキーマ、
  企画書v0.2 / 要件定義v1.0 / DESIGN.md v1.0、**チケット00〜08**
  (00トークン / 01共通UI / 02 F-1マップ / 03 F-5一覧 / 04 F-2診断書 / 05 F-3車両比較 /
  06 D1・R2・API / 07 F-6シナリオ共有 / 08 F-8データ更新バッチ。詳細は各チケット参照)
- **D1 `regen-db`(98dc019f-ee56-4e89-9ff5-4ad0062cf0dd)と R2 `regen-bundles` は作成・投入済み**
  (ローカル・本番とも)。要件§11-1〜3は完了。§11-4以降(GitHub Actionsのシークレット等)はチケット12
- GitHub: https://github.com/hohoemi-rabo/regen (main直コミット・直push)
- **次: チケット09(F-4 実測補正 `/calibrate`)。** 以降は docs/tickets/README.md 参照
- **本番D1/R2は新版 `20260818-c2bb49ee` に切替済み**(2026-08-30、GitHub Actionsの手動実行で公開)。
  要件§11-4のシークレットも登録済みで、週次(月曜05:00 JST)の自動実行が生きている。
  **ワークフローは Node 22。** pnpm 11 が Node 22.13以上を要求する(Node 20では setup で落ちる)
- 各チケットの進捗はチケット内のステータス行とTodoチェックボックスが正(この節は概況のみ)
- PC表示: 一覧(F-5)・比較(F-3)は最大幅1200px、診断書は900px(DESIGN §4.1)
- 未確定事項は要件定義書§13(車両マスタの車種、TCOの項目など)

### 実装済みの資産(再利用する)

- **共通UI** `apps/web/app/_components/`: VerdictChip / ConclusionBadge / StatTile(+Grid) /
  Button / DataTable(ソート・行クリック対応) / FilterRow / verdict.ts(判定の記号・色の単一情報源)。
  数値は `apps/web/lib/format.ts`(電費2桁/距離1桁/整数3桁区切り)経由で出す
- **診断書の部品** `apps/web/app/routes/[id]/_components/`: ElevationChart(自前SVG、補正区間の帯+破線、
  ホバーで距離・標高・勾配) / sections.tsx(Section / Bar / DefinitionRow)
- **coreの追加API**(アルゴリズム本体は不変): `Diagnosis.correctedIdx`(補正位置) /
  `cruiseSpeedKmh()` / `CO2` / `compareDiesel()` / `chargingPlan()`(実ダイヤ充電計画。
  1便が使用可能容量を超える車両は表現不可 — `simulateVehicle()` が先に成立性を判定して `infeasible` を返す)
- **車両比較の部品** `packages/core/`: `vehicles.ts`(車両マスタの型 + 初期4件。**画面はD1から読む**ので
  ここはシードの入力) / `simulate.ts`(`simulateVehicle` / `tcoSeries` / `breakEvenYear`) /
  `scenario.ts`(共有シナリオの保存形式・検証・ID生成)。
  画面側は `apps/web/app/routes/[id]/compare/_components/` に Slider / NumberField / TcoChart /
  VehicleColumn / ShareButton、`apps/web/app/s/[id]/_components/ScenarioSheet.tsx` が共有ページ
- **データ更新バッチ**(`batch/`、入口は `pnpm batch` の1本。生成物はコミット済み)。
  **出力先はすべて `data/bundle/`**(アプリはこれを直接読まない。読むのはD1/R2):
  `feeds.ts`(gtfs-data.jp API・zip取得・展開・版の算出・更新検出)/
  `pipeline.ts`(GTFS+標高→`diagnose()`→ map.geojson / routes_summary.json / profiles.json /
  profiles25.json / schedules.json / agencies.json / feeds.json)/
  `verify.ts`(変化ガード)/ `publish.ts`(R2→D1→版切替、batch_runs)/ `cf.ts`(wrangler越しのD1・R2)
- **路線ID**は `feed_route_id`(例 `Minamishinshuseibu1_13`)で全データ共通

### データ更新バッチの作法(チケット08で確定)

- **版は入力から導出する。** `<全フィードの公開日の最大 YYYYMMDD>-<sha256(feed_uid列 + 診断パラメータ)の先頭8桁>`
  (例 `20260818-c2bb49ee`)。同一入力なら同一版になるので、再実行は版を積まず冪等な上書きになる。
  **D1の `bundles` が版の正本**(`apps/web/lib/site.ts` は廃止。フッタもD1から読む)
- **公開の順序を崩さない。** R2を全部書く(`meta.json` を最後に置いて完了印にする)→ D1の行を更新
  (新版は `is_current=0`)→ **最後に `is_current` を付け替える**。どこで失敗しても、配信中の版は
  必ず「R2に全部揃っている版」を指す。**旧版のR2キーは消さない**
  (`/s/[id]` が `bundleVersion` を固定して読むため、消すと過去の共有URLの数字が動く)
- **R2アップロードは直列。** 並列にするとローカル(miniflare)で各wranglerプロセスが同じSQLiteを掴んで
  `SQLITE_BUSY` で落ちる(`next build` を `cpus: 1` にしているのと同じ理由)
- **変化ガード。** 公開値が前回(`data/bundle/routes_summary.json`)と1つでも変わったら、
  R2にもD1にも書かずに止まる。承認は `--allow-changes`。
  `data/bundle/` は**公開に成功したあとに書く**ので、常に「いま配信されている内容」と一致する
- **対象フィードの正本は `data/feeds.source.json`。** gtfs-data.jp の `feed_id` はハイフン入り
  (`Minamishinshu-takagi-1`)、こちらのIDはハイフン無し(`Minamishinshutakagi1`)。
  路線IDは `<feedId>_<route_id>` なので、**ここを機械変換に任せると共有URLが壊れる**。対応表は人が管理する
- 標高タイルのキャッシュは `batch/.cache/dem/`(gitignore)。404も `.miss` で記録して取り直さない。
  Actionsは `actions/cache` でこのディレクトリを持ち回す
- **喬木村フィードは2026-12-15期限。** 差し替わると変化ガードで週次実行が落ちるので、
  差分を見てから手動実行(`workflow_dispatch` の `allow_changes`)で通す

### 公開の書き込み口(チケット07で確定)

- **書き込みは `POST /api/scenarios` だけ。** 認証がないので、引数を信用せず
  `normalizeScenarioParams()`(packages/core)でホワイトリスト詰め替えしてからD1に入れる。
  **受け取ったJSONをそのまま保存しない**
- レート制限は `wrangler.jsonc` の `ratelimits` バインディング(`SCENARIO_LIMITER`、IPあたり10件/60秒)。
  miniflareにローカル実装があるので `preview` でも効く。**IPは制限キーに使うだけで保存しない**
- **共有シナリオは解決済みの値を丸ごと保存する**(車両スペック・出典・バンドル版)。
  IDだけ保存すると、車両マスタを直したときに共有URLの数字が動く
- `/s/[id]` は noindex(要件§5.3)。`generateStaticParams` は使わず revalidate で on-demand ISR

### D1/R2の作法(チケット06で確定)

- **D1/R2へのアクセスは `apps/web/lib/data.ts` に集約**(先頭に `import "server-only"`)。
  ここ以外から `getCloudflareContext()` を呼ばない
- **必ず `getCloudflareContext({ async: true })` を使う。** 46路線を全件プリレンダリングしており、
  静的生成コンテキストでは同期版が throw する
- **ビルドにはシード済みのローカルD1/R2が要る**(`.wrangler/state` はgitignore)。
  クリーンクローンでは `pnpm batch` を先に流す(ネットワークが無いときは
  `pnpm batch -- --skip-fetch` でコミット済みzipから作れる)。
  ビルドワーカーを並列にすると同じSQLiteを掴んで `SQLITE_BUSY` で落ちるため
  `next.config.ts` で `cpus: 1 / workerThreads: false` に固定してある
- **`generateStaticParams` のページはOpenNextでは incremental cache 経由で配信される。**
  `open-next.config.ts` の `r2IncrementalCache` を外すとプリレンダリング済みでも404になる
- **検証は `pnpm --filter web preview`(Workersランタイム)を使う。**
  `scripts/preview.sh` は素の `next start` でバインディングが無く、`getCloudflareContext()` が throw する
- 単位: D1の `max_grade` は**分数**(0.106)、`length_m` は**メートル**。
  画面表示の%やkmへの変換はページ側で行う

### ブラウザ再計算に使うプロファイル(チケット05で確定)

- **F-3/F-4がブラウザで再計算するときは25m間隔・補正後の標高を使う。**
  実行時はR2のプロファイル(`profile.elev25`)、バッチ側は `data/bundle/profiles25.json`。
  表示用の `elev` は最大400点へ間引いてあり `stepM` が路線ごとに25〜150mと変わる。
  そちらで `energyForProfile()` を回すと冬電力量が最大1.55%ずれ、診断書と数値が食い違う
- 単位の罠: `data/bundle/routes_summary.json` の `gmax` は**%表記**・`L` は**km**。
  D1の `max_grade` は**分数**・`length_m` は**メートル**。`judge()` と `SimInput.gmax` は分数
- 25m配列は1路線分だけをServer→Clientのpropsで渡す(全路線分を渡さない)

### 便数と充電計画の方針(チケット04で確定)

- GTFSの `trips` は**ダイヤ種別をまたいだ合計便数**(46路線中13路線で実日次と乖離)。
  一覧・マップ・判定の日次kWh/充電回数はこの合計値のまま(ゴールデンテスト固定)。
  診断書の充電計画だけ**代表運行日**(最多便数の曜日)の実ダイヤで算出し、乖離は画面で開示する。
  この二本立てを崩さない

### 検証の作法

- **本番相当の確認は `pnpm --filter web preview`(Workersランタイム・ポート8787)を使う。**
  D1/R2バインディングが要る画面とAPIは、これでしか正しく動かない。
  `./scripts/preview.sh` は素の `next start` でバインディングが無く `getCloudflareContext()` が throw するので、
  06以降は使わない(残してあるが用途がない)
- 起動し直すときは先にポートを解放する。**WSLでは `lsof -ti` が効かないので `ss -tlnp` からPIDを取る**。
  `.next` / `.open-next` を残した再ビルドは避け、`rm -rf` してから建て直す
- ヘッドレス確認: `~/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`。
  MapLibreには `--enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader` が必須。
  ただし**MapLibreの描画内容はヘッドレスでは撮れない**(`preserveDrawingBuffer: false` のため
  canvasが白く写る)。地図の見た目はブラウザで確認してもらう。
  印刷は `--print-to-pdf` → `pdftoppm -png` で目視。**`--virtual-time-budget=15000` を必ず付ける**
  (付けないとフォント読み込みや動的ルートのストリーミング前に印刷され、ページ数が run ごとに
  39〜43枚目でぶれる。動的ルートではローディングのスケルトンだけが印刷されることもある)。コンソールエラーは `--enable-logging=stderr --log-level=0`
- 診断書の印刷はA4縦1枚が原則(46路線中39路線が1枚、補正・充電の多い7路線は2枚で許容済み。
  この39/7は `--virtual-time-budget` を付けて測った値。付けずに測ると run ごとにぶれる)。
  共有シナリオ(F-6)もA4縦1枚に収まる

## データ

**D1とR2が正本**(チケット06以降)。`data/bundle/*` はバッチの生成物で、シードの入力に使う。
画面もAPIもD1/R2から読む。`apps/web/data/` と `public/map_data.json` はもう無い。

- D1: agencies / routes / vehicles / scenarios / batch_runs / feeds / **bundles** +
  Better Auth(user/session/account/verification)。スキーマは `packages/db/src/schema.ts`
- R2 `regen-bundles`: `bundles/<version>/routes.json`(マップ用GeoJSON)/
  `bundles/<version>/profile/<route_id>.json`(1路線の全て)/ `bundles/<version>/meta.json`。
  配信する版は D1 `bundles.is_current` だけで切り替える(旧版のキーは消さない)
- `data/bundle/` — **バッチの出力はすべてここ**(map.geojson / routes_summary / profiles /
  profiles25 / schedules / agencies / feeds)。次回の変化ガードの基準でもあるので、
  **公開に成功した内容と一致している**ことが前提
- `data/feeds.source.json` — 診断対象フィードの正本(手で管理。gtfs-data.jp のIDとの対応表)
- GTFS原本は `data/gtfs_zips/`(バッチが取得して更新)。展開先 `data/gtfs/` はgitignore。
  フィード更新日に注意(喬木村は2026-12-15期限)
- 標高タイルのキャッシュは `batch/.cache/dem/`(gitignore)
- **`data/seed/` は08で廃止した。** Python時代の凍結成果物(map_data / dem_all_routes / routes_meta)は
  パイプラインが再生成するので入力として不要になった
