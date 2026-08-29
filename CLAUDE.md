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
pnpm batch           # 診断バンドル生成(要: data/gtfs/ 展開済み)
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

- 完了: 診断エンジンTS移植 + ゴールデンテスト(47件通過)、DBスキーマ、バッチv0、
  企画書v0.2 / 要件定義v1.0 / DESIGN.md v1.0、**チケット00〜04**
  (00トークン / 01共通UI / 02 F-1マップ / 03 F-5一覧 / 04 F-2診断書。詳細は各チケット参照)
- GitHub: https://github.com/hohoemi-rabo/regen (main直コミット・直push)
- **次: チケット05(F-3 車両比較 `/routes/[id]/compare`)。** 以降 06 → … は docs/tickets/README.md 参照
- 各チケットの進捗はチケット内のステータス行とTodoチェックボックスが正(この節は概況のみ)
- PC表示: 一覧(F-5)・比較(F-3)は最大幅1200px、診断書は900px(DESIGN §4.1)
- 未確定事項は要件定義書§13(車両マスタの車種、TCOの項目など)

### 実装済みの資産(05以降で再利用する)

- **共通UI** `apps/web/app/_components/`: VerdictChip / ConclusionBadge / StatTile(+Grid) /
  Button / DataTable(ソート・行クリック対応) / FilterRow / verdict.ts(判定の記号・色の単一情報源)。
  数値は `apps/web/lib/format.ts`(電費2桁/距離1桁/整数3桁区切り)経由で出す
- **診断書の部品** `apps/web/app/routes/[id]/_components/`: ElevationChart(自前SVG、補正区間の帯+破線、
  ホバーで距離・標高・勾配) / sections.tsx(Section / Bar / DefinitionRow)
- **coreの追加API**(アルゴリズム本体は不変): `Diagnosis.correctedIdx`(補正位置) /
  `cruiseSpeedKmh()` / `CO2` / `compareDiesel()` / `chargingPlan()`(実ダイヤ充電計画。
  1便が使用可能容量を超える車両は表現不可 — F-3で車両を差し替える際は先に成立性判定)
- **データ生成**(`batch/`、生成物はコミット済み): `seed-map`(→ public/map_data.json + data/routes_summary.json、
  id = `feed_route_id`) / `seed-profiles`(→ data/profiles.json: 表示用標高・補正区間・夏冬kWh) /
  `seed-schedule`(→ data/schedules.json: 代表運行日ダイヤ。要 `data/gtfs/` 展開)
- **路線ID**は `feed_route_id`(例 `Minamishinshuseibu1_13`)で全データ共通

### 便数と充電計画の方針(チケット04で確定)

- GTFSの `trips` は**ダイヤ種別をまたいだ合計便数**(46路線中13路線で実日次と乖離)。
  一覧・マップ・判定の日次kWh/充電回数はこの合計値のまま(ゴールデンテスト固定)。
  診断書の充電計画だけ**代表運行日**(最多便数の曜日)の実ダイヤで算出し、乖離は画面で開示する。
  この二本立てを崩さない

### 検証の作法

- 本番ビルド確認は **`./scripts/preview.sh [ポート]`** を使う(devサーバー停止→ポート解放待ち→
  クリーンビルド→起動を自動化)。`next dev` 起動中の `next build`、`.next` を残した再ビルド、
  kill漏れ(WSLでは `lsof -ti` が効かないので `ss -tlnp` からPIDを取る)はすべて画面が壊れる
- ヘッドレス確認: `~/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`。
  MapLibreには `--enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader` が必須。
  印刷は `--print-to-pdf` → `pdftoppm -png` で目視。コンソールエラーは `--enable-logging=stderr --log-level=0`
- 診断書の印刷はA4縦1枚が原則(46路線中39路線が1枚、補正・充電の多い7路線は2枚で許容済み)

## データ

- `data/seed/map_data.json` — 46路線の診断結果+簡略ポリライン(F-1の初期データ)
- `data/seed/dem_all_routes.json` + `routes_meta.json` — 生標高とメタ(再診断の入力)
- `apps/web/data/routes_summary.json` — 一覧用サマリー(座標なし)
- GTFS原本は `data/gtfs_zips/`。フィード更新日に注意(喬木村は2026-12-15期限)
