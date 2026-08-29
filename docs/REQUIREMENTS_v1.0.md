# 要件定義書 v1.0 — Regen(地域公共交通のEV化適地診断)

- 作品名(仮): **Regen** ― 下り坂は、燃料になる。
- 応募先: 公共交通オープンデータチャレンジ2026(締切 2027-01-11 23:59 JST)
- 作成日: 2026-08-29 / 作成: まさゆき
- 関連文書: 企画書 v0.2、技術検証レポート(2026-08-28)、南信州46路線診断(2026-08-29)

---

## 1. 目的とスコープ

### 1.1 目的

路線バスの車両更新において「この路線をEVバスに置き換えて成立するか」を、公開データのみで診断し、事業者・自治体の意思決定材料を提供する。

### 1.2 スコープ(本リリースで作るもの)

- 南信州14市町村・46路線を対象とした診断結果の公開Webサービス
- 路線のEV適性を俯瞰するマップと、路線ごとの診断書
- 車両を替えて比較するシミュレータ
- 実測データによる補正(ブラウザ内処理)

### 1.3 スコープ外(本リリースでは作らない)

- 任意の出発地→目的地の経路探索(トラック版で扱う将来機能)
- リアルタイム運行情報の利用(南信州のフィードにGTFS-RTが存在しないため)
- 会員登録を伴う一般ユーザー向け機能
- 課金・決済

### 1.4 用語

| 用語 | 定義 |
|---|---|
| 路線 | GTFSのroute。診断の単位 |
| 代表trip | 路線内で最長の形状を持つtrip。診断の対象経路 |
| 勾配プロファイル | 経路に沿って25m間隔で標高を並べた配列 |
| 力行 | 走行のために消費する電力量(kWh) |
| 回生 | 減速・降坂時に回収する電力量(kWh) |
| 精度ランクA | GTFSのshapes.txtによる実形状で診断した路線 |
| 精度ランクB | shapes.txtがなく、停留所を結んだ近似形状で診断した路線 |
| 追加充電回数 | 朝満充電から始めて、1日のダイヤを走り切るために日中必要となる充電回数 |
| 診断バンドル | 事前計算済みの路線別診断結果(JSON)。R2に置き配信する |

---

## 2. 技術スタック(確定)

| 層 | 技術 | 補足 |
|---|---|---|
| フロントエンド | **Next.js**(App Router / TypeScript) | 地図は MapLibre GL JS、グラフは自前SVG |
| API | **Next.js Route Handlers**(`app/api/**/route.ts`) | 別サーバーは立てない |
| データベース | **Cloudflare D1**(SQLite互換) | ORMは Drizzle |
| デプロイ | **Cloudflare Workers** | `@opennextjs/cloudflare`(OpenNextアダプタ)経由 |
| 認証 | **Better Auth**(管理画面のみ) | 一般利用者側は認証なし |
| ストレージ | **Cloudflare R2** | 診断バンドルJSON、生成画像 |
| バッチ | GitHub Actions(Node/TypeScript) | GTFS取得→診断計算→R2アップロード |

### 2.1 Supabase経験者向けの対応表

これまでのSupabase構成と、今回の構成の対応は次のとおり。

| やりたいこと | Supabaseでは | 今回は |
|---|---|---|
| DBを使う | Supabase Postgres | **Cloudflare D1**(SQLite互換。Postgresではないので、配列型やJSONB、複雑なウィンドウ関数は使えない) |
| DBに接続する | `createClient()` でURLとキーを渡す | **接続情報を持たない**。Workerに「バインディング」としてDBが刺さっており、`getCloudflareContext().env.DB` で取り出す |
| SQLを書く | supabase-js のクエリビルダ | **Drizzle**(TypeScriptでスキーマを定義し、型付きでクエリを書く) |
| マイグレーション | Supabase CLI / ダッシュボード | `drizzle-kit generate` でSQLを生成 → `wrangler d1 migrations apply` で適用 |
| 認証 | Supabase Auth | **Better Auth**(セッションはD1に保存)。管理画面だけに使う |
| ファイル保管 | Supabase Storage | **R2**(S3互換。`env.BUCKET.get()/put()` で読み書き) |
| ホスティング | Vercel等 | **Cloudflare Workers**(OpenNextがNext.jsをWorkers用に変換する) |

要点は「**接続文字列ではなくバインディング**」という点。ローカル開発では `wrangler` がD1/R2をローカルにエミュレートするので、開発中に本番DBを触ることはない。

---

## 3. アーキテクチャ

### 3.1 全体構成

```
[GitHub Actions バッチ(週次 + 手動)]
    GTFS取得 → 診断計算 → 診断バンドルJSON生成
        ↓ アップロード                    ↓ メタ情報を書き込み
      [R2]                            [D1]
        ↓ 署名なし配信(Worker経由)        ↓
    ┌─────────────────────────────────────┐
    │  Cloudflare Workers (Next.js/OpenNext) │
    │  - 画面(App Router)                    │
    │  - API(Route Handlers)                │
    └─────────────────────────────────────┘
                    ↓
               [ブラウザ]
        地図描画・診断書表示・実測補正(ローカル計算)
```

### 3.2 「重い計算はバッチ、画面は表示だけ」の原則

勾配プロファイルの生成と電費計算は**バッチで事前に済ませ**、閲覧時は計算しない。理由は3つ。

1. 標高タイルの取得は路線あたり数十リクエストかかり、閲覧のたびに実行できない
2. Workersには実行時間の制約があり、重い数値計算は向かない
3. 診断結果は入力(GTFS・標高・車両スペック)が変わらない限り不変

例外は**F-3車両比較**と**F-4実測補正**で、これはユーザーが係数を変える機能なので、事前計算した勾配プロファイルを使ってブラウザ内で再計算する(計算コアはブラウザでもNodeでも動くTypeScriptパッケージとして共有する)。

### 3.3 モノレポ構成

```
regen/
├─ apps/
│  └─ web/                    Next.js(画面 + Route Handlers)
│     ├─ app/
│     ├─ wrangler.jsonc       バインディング定義(D1/R2)
│     └─ open-next.config.ts
├─ packages/
│  ├─ core/                   診断エンジン(UI非依存・ブラウザ/Node両対応)
│  │  ├─ profile.ts           リサンプル・標高補間・平滑化
│  │  ├─ correction.ts        トンネル補正・精度ランクB処理
│  │  ├─ energy.ts            力行/回生/空調の物理モデル
│  │  ├─ charging.ts          ダイヤからの充電計画
│  │  └─ vehicles.ts          車両マスタ型定義
│  └─ db/                     Drizzleスキーマとマイグレーション
├─ batch/                     GitHub Actionsから実行するバッチ
│  ├─ fetch-gtfs.ts
│  ├─ fetch-dem.ts
│  └─ build-bundle.ts
└─ docs/                      企画書・要件定義・設計
```

`packages/core` を独立させる理由は、(a) バッチとブラウザで同じ計算を使うため、(b) 将来のトラック版・ネイティブアプリで再利用するため。

---

## 4. 機能要件

優先度: **Must**=応募までに必須 / **Should**=あると強い / **Could**=余力があれば

### F-1 EV適性マップ(Must)

| ID | 要件 |
|---|---|
| F-1-1 | 対象地域の全路線を地図上にポリラインで描画する |
| F-1-2 | 各路線をEV適性判定(適/条件付き/要検討)で色分けする。色は意味色3色とし、凡例を常時表示する |
| F-1-3 | 路線をタップ/クリックすると要約(路線名・事業者・距離・便数・往復電池使用率・追加充電回数)をポップアップ表示する |
| F-1-4 | ポップアップから路線診断書(F-2)へ遷移できる |
| F-1-5 | 事業者・判定・精度ランクで絞り込みができる |
| F-1-6 | 色だけに依存しないよう、凡例にラベルと記号を併記し、一覧表(F-5)への導線を置く |

判定基準(初期値、設定で変更可)

- **適**: 冬季往復のバッテリー使用率 60%未満 **かつ** 最急持続勾配(500m窓)10%未満
- **条件付き**: 使用率 60〜85%、または急勾配区間あり
- **要検討**: 使用率 85%以上

### F-2 路線診断書(Must)

| ID | 要件 |
|---|---|
| F-2-1 | 結論バッジ(判定と一行要約)を最上部に表示する |
| F-2-2 | 勾配プロファイルを折れ線グラフで表示し、主要停留所・最高地点を注記する |
| F-2-3 | ホバー/タップで任意地点の距離・標高・勾配を表示する |
| F-2-4 | 数値タイルを表示する: 距離、累積上り/下り、最高/最低標高、最急勾配、電費(夏/冬)、回生回収量、往復バッテリー使用率 |
| F-2-5 | **充電計画**を表示する: 1日の便数と必要電力量、追加充電回数、充電が必要になる時間帯の目安 |
| F-2-6 | ディーゼル車との比較(燃料費・CO2)を表示する |
| F-2-7 | 精度ランク(A/B)と、その意味を明示する |
| F-2-8 | **補正区間を明示する**: トンネル・高架として補正した区間を、位置と延長とともに開示する |
| F-2-9 | 試算の全仮定(車両スペック・表定速度・空調・単価)を同一画面で開示する |

### F-3 車両比較シミュレータ(Must・簡易版)

| ID | 要件 |
|---|---|
| F-3-1 | 車両マスタから2車種を選び、同一路線で診断値を左右比較する |
| F-3-2 | 電池容量・車両重量・空調負荷・電力/軽油単価をスライダー等で変更でき、結果が即時に再計算される(ブラウザ内計算、300ms以内) |
| F-3-3 | 車両価格・補助金額を入力すると、ディーゼル車とのTCO(総保有コスト)の損益分岐年数を表示する |
| F-3-4 | 変更した条件は診断シナリオとして保存でき、共有URLが発行される(F-6) |

### F-4 実測補正「じぶん補正」(Should・実証デモとして提示)

| ID | 要件 |
|---|---|
| F-4-1 | 実走行データのCSV(日付・走行距離・燃料/電力消費量が最低限)を画面にドロップして読み込む |
| F-4-2 | **CSVはサーバーに送信せず、ブラウザ内でのみ処理する**。その旨を画面に明示する |
| F-4-3 | 推定値と実測値を突き合わせ、車両効率・空調負荷の係数を補正する |
| F-4-4 | 補正前後の推定誤差を提示する |
| F-4-5 | 補正係数はブラウザのローカル保存にとどめ、以後の診断に適用する。破棄操作を用意する |

### F-5 路線一覧(Must)

| ID | 要件 |
|---|---|
| F-5-1 | 全路線の診断値を表で一覧表示する(判定・路線・事業者・距離・便数・累積上り・最急勾配・電費・往復使用率・日次電力量・追加充電回数・精度ランク) |
| F-5-2 | 任意の列で並べ替えできる |
| F-5-3 | CSVとしてダウンロードできる |
| F-5-4 | 色覚に依存せず情報が読めること(F-1-6の代替表示を兼ねる) |

### F-6 診断シナリオの保存・共有(Should)

| ID | 要件 |
|---|---|
| F-6-1 | 路線・車両・条件の組み合わせを保存し、短いURLを発行する(D1に保存) |
| F-6-2 | 発行URLを開くと同じ条件の診断が再現される |
| F-6-3 | 保存に会員登録を要さない。保存者の個人情報を収集しない |
| F-6-4 | 保存内容は補助金申請や社内説明にそのまま使えるよう、印刷レイアウトを持つ |

補足: この機能がD1を使う主目的である。事業者が「この条件で試算した」という結果を上司や自治体に渡せることは、意思決定支援サービスとして実利がある。

### F-7 管理画面(Should)

| ID | 要件 |
|---|---|
| F-7-1 | **Better Auth**による認証で保護する(管理者のみ) |
| F-7-2 | 車両マスタ(車種・電池容量・重量・効率等)を追加・編集できる |
| F-7-3 | 診断バッチの実行状況と最終更新日時を確認できる |
| F-7-4 | 判定しきい値の初期値を変更できる |

### F-8 データ更新バッチ(Must)

| ID | 要件 |
|---|---|
| F-8-1 | GTFSフィードを取得し、更新があれば診断を再計算する |
| F-8-2 | 標高タイルは取得結果をキャッシュし、同一タイルを再取得しない |
| F-8-3 | 診断バンドルをR2にアップロードし、メタ情報(生成日時・フィード版・件数)をD1に記録する |
| F-8-4 | 週次自動実行と手動実行の両方に対応する |
| F-8-5 | フィードの有効期限切れを検出し、管理画面に警告を出す |

---

## 5. 非機能要件

### 5.1 性能

| 項目 | 目標 |
|---|---|
| 初回表示(マップ) | 3秒以内(3G相当を除く) |
| 路線診断書の表示 | 1秒以内 |
| 条件変更時の再計算(F-3) | 300ms以内 |
| 診断バンドル(全46路線) | gzip後 1.5MB以下 |
| バッチ全実行 | 15分以内 |

### 5.2 可用性・運用

- チャレンジ期間中(〜2027-03-12)、誰でも無償でアクセスできる状態を維持する
- 動的サーバーへの依存を最小化し、Cloudflareの無料枠内で運用する
- **応募締切(2027-01-11)以降は機能追加を凍結**し、障害修正のみ行う

### 5.3 セキュリティ・プライバシー

- 一般利用者の個人情報を収集しない(アカウント登録なし)
- F-4のCSVは**ブラウザ外に出さない**。実装上もアップロード経路を持たない
- 管理画面は認証必須。認証情報・APIキーはWorkersのシークレットで管理し、リポジトリに含めない
- 共有URL(F-6)は推測困難なIDとし、検索エンジンにインデックスさせない

### 5.4 アクセシビリティ・UI方針

- 判定は色のみで伝えない(記号・ラベル・一覧表を併用)
- ライト基調。OS設定のダークモードに追随する
- タップファースト、登録不要、説明書なしで使える
- 年齢を問わず読める見た目とする(シニア特化UIにはしない)

### 5.5 データの透明性

- すべての診断値について、算出根拠(仮定・補正)を画面上で確認できること
- 「一次診断であり、実測補正で精度が上がる」という位置づけを明示すること
- 出典(GTFSデータリポジトリ、国土地理院)を全画面のフッターに表示すること

---

## 6. データ設計

### 6.1 D1(リレーショナルに持つもの)

```sql
-- 事業者
CREATE TABLE agencies (
  id TEXT PRIMARY KEY,           -- feed_id + agency_id
  name TEXT NOT NULL,
  feed_id TEXT NOT NULL
);

-- 路線(診断済みメタ。詳細プロファイルはR2)
CREATE TABLE routes (
  id TEXT PRIMARY KEY,           -- feed_id + route_id + direction
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  name TEXT NOT NULL,
  length_m REAL NOT NULL,
  trips_per_day INTEGER NOT NULL,
  climb_m REAL NOT NULL,
  max_grade REAL NOT NULL,
  kwh_per_km REAL NOT NULL,
  roundtrip_batt_pct REAL NOT NULL,
  daily_kwh REAL NOT NULL,
  extra_charges INTEGER NOT NULL,
  verdict TEXT NOT NULL,          -- 適 / 条件付き / 要検討
  accuracy TEXT NOT NULL,         -- A / B
  corrected_m REAL NOT NULL DEFAULT 0,
  bundle_key TEXT NOT NULL,       -- R2上のプロファイルJSONキー
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_routes_verdict ON routes(verdict);
CREATE INDEX idx_routes_agency ON routes(agency_id);

-- 車両マスタ
CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  powertrain TEXT NOT NULL,       -- ev / diesel
  mass_kg REAL NOT NULL,
  battery_kwh REAL,
  drive_eff REAL,
  regen_eff REAL,
  cda REAL NOT NULL,
  crr REAL NOT NULL,
  fuel_km_per_l REAL,             -- ディーゼルのみ
  price_yen INTEGER,
  subsidy_yen INTEGER,
  source_url TEXT,
  is_public INTEGER NOT NULL DEFAULT 1
);

-- 診断シナリオ(F-6)
CREATE TABLE scenarios (
  id TEXT PRIMARY KEY,            -- 推測困難なランダムID
  route_id TEXT NOT NULL REFERENCES routes(id),
  params_json TEXT NOT NULL,      -- 車両・単価・空調などの条件
  created_at INTEGER NOT NULL,
  expires_at INTEGER              -- 任意。既定はnull(無期限)
);

-- バッチ実行記録(F-8)
CREATE TABLE batch_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL,           -- running / success / failed
  feeds INTEGER, routes INTEGER,
  message TEXT
);

-- フィード管理(有効期限監視)
CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  feed_start TEXT, feed_end TEXT,
  fetched_at INTEGER
);
```

Better Authが必要とするテーブル(user / session / account / verification)は同じD1に作成する。Drizzleスキーマから生成する。

### 6.2 R2(ファイルで持つもの)

| キー | 内容 |
|---|---|
| `bundles/<version>/routes.json` | 全路線の一覧用サマリー(マップ・一覧表の初期表示に使用) |
| `bundles/<version>/profile/<route_id>.json` | 路線ごとの勾配プロファイル(距離・標高配列)・補正区間・停留所位置 |
| `bundles/<version>/meta.json` | 生成日時、フィード版、件数、計算パラメータ |

バージョンをキーに含めることで、バッチ実行中も旧版が壊れない。切替はD1のメタ更新で行う。

### 6.3 標高タイルキャッシュ(バッチ内)

標高タイルはバッチ実行環境にキャッシュし、GitHub Actionsのキャッシュ機構で再利用する。R2に保存してもよい(タイル1枚約500KB、南信州全域で155枚)。

---

## 7. API設計(Next.js Route Handlers)

すべて `apps/web/app/api/` 配下。バインディングは `getCloudflareContext().env` から取得する。

| メソッド | パス | 用途 | 認証 |
|---|---|---|---|
| GET | `/api/routes` | 路線一覧(判定・事業者で絞り込み可) | 不要 |
| GET | `/api/routes/[id]` | 路線1件の診断値 | 不要 |
| GET | `/api/routes/[id]/profile` | 勾配プロファイル(R2から返す) | 不要 |
| GET | `/api/vehicles` | 公開車両マスタ | 不要 |
| POST | `/api/scenarios` | 診断シナリオを保存しIDを返す | 不要(レート制限あり) |
| GET | `/api/scenarios/[id]` | 保存済みシナリオを取得 | 不要 |
| GET | `/api/meta` | データ生成日時・出典 | 不要 |
| POST | `/api/admin/vehicles` | 車両マスタ追加・更新 | 必要 |
| GET | `/api/admin/batch` | バッチ実行状況 | 必要 |

実装例(D1バインディングの使い方):

```ts
// apps/web/app/api/routes/route.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { routes } from "@regen/db/schema";

export async function GET() {
  const { env } = getCloudflareContext();
  const db = drizzle(env.DB);
  const rows = await db.select().from(routes);
  return Response.json(rows);
}
```

`wrangler.jsonc` にバインディングを宣言する:

```jsonc
{
  "name": "regen",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-08-01",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [{ "binding": "DB", "database_name": "regen-db", "database_id": "<作成後に取得>" }],
  "r2_buckets": [{ "binding": "BUNDLES", "bucket_name": "regen-bundles" }]
}
```

型定義は `npx wrangler types --env-interface CloudflareEnv` で生成する。

---

## 8. 画面一覧

| # | 画面 | パス | 主機能 |
|---|---|---|---|
| 1 | マップ | `/` | F-1 |
| 2 | 路線診断書 | `/routes/[id]` | F-2 |
| 3 | 車両比較 | `/routes/[id]/compare` | F-3 |
| 4 | 実測補正 | `/calibrate` | F-4 |
| 5 | 路線一覧 | `/routes` | F-5 |
| 6 | 共有シナリオ | `/s/[id]` | F-6 |
| 7 | このサービスについて | `/about` | 手法・仮定・出典・マニュアル(応募要件の「マニュアルURL」を兼ねる) |
| 8 | 管理 | `/admin/*` | F-7 |

---

## 9. 診断エンジン仕様(`packages/core`)

技術検証および46路線診断で確定済みのアルゴリズムを移植する。

### 9.1 処理順序

1. **リサンプル**: 経路を25m間隔に等間隔化。形状点間隔が100mを超える区間にフラグを立てる
2. **標高取得**: 国土地理院標高タイル(ズーム14)から双線形補間で取得
3. **平滑化**: 175m移動平均(7点)
4. **補正**:
   - 精度ランクA → **勾配上限フィルタ**。前方・後方の両方向スイープで「勾配12%以下では到達できない標高」を削り、トンネル・高架でDEMが地表を拾った箇所の縦断線を復元する。緩やかに登って到達する実在の峠は保持される
   - 精度ランクB → **停留所アンカー補間**。停留所地点の標高のみを信頼し、区間は線形補間する
5. **エネルギー積算**: 各25m区間について
   `F = m·g·Crr + ½·ρ·CdA·v² + m·g·(dh/dx)`
   `W > 0` なら力行に `W/η_drive` を加算、`W < 0` なら回生に `|W|·η_regen` を加算
6. **空調負荷加算**: 走行時間 × 空調電力(夏3kW / 冬8kW)
7. **充電計画**: 1日の便数 × 片道電力量 を求め、電池の80%を使用可能として追加充電回数を算出

### 9.2 既定パラメータ

| 項目 | 値 |
|---|---|
| 車両総重量 | 8,500 kg |
| CdA | 5.0 |
| 転がり抵抗係数 | 0.008 |
| 駆動効率 | 0.85 |
| 回生効率 | 0.62 |
| 電池容量 | 105 kWh(使用可能 80%) |
| 表定速度 | 32 km/h(路線長10km未満は30 km/h) |
| 空調 | 夏 3 kW / 冬 8 kW |
| 電力単価 / 軽油単価 | 30 円/kWh / 165 円/L |
| 勾配上限(補正しきい値) | 12% |

すべて設定で変更可能とし、既定値は画面上で開示する。

### 9.3 ゴールデンテスト

2026-08-29の46路線診断の結果を固定値としてテストに埋め込み、移植後も同じ結果が出ることを保証する。代表例:

| 路線 | 累積上り | 電費(冬) | 往復電池 | 日次kWh | 追加充電 |
|---|---|---|---|---|---|
| W1 西部コミュニティバス(根羽村) | 981 m | 0.85 kWh/km | 59% | 497 | 5回 |
| W0-1 駒場線(信南交通) | 258 m | 0.75 kWh/km | 26% | 772 | 9回 |
| E1 遠山郷線(信南交通) | 1,137 m | 0.82 kWh/km | 74% | 390 | 4回 |

加えて次を回帰テストとする。

- E1遠山郷線でトンネル補正が働き、最急勾配が69.9%→12.0%以下に収まること
- 精度ランクBの11路線で停留所アンカー補間が適用されること
- 全46路線の判定が 適34 / 条件付き12 / 要検討0 であること

---

## 10. 開発・デプロイ

### 10.1 環境

| 環境 | 用途 | DB |
|---|---|---|
| ローカル | `wrangler dev`(D1/R2をローカルエミュレート) | ローカルD1 |
| 本番 | Cloudflare Workers | 本番D1 |

締切直前の事故を避けるため、**本番URLとは別に予備の公開先(GitHub Pages等の静的スナップショット)を用意**し、応募URLが常に生きている状態を保つ。

### 10.2 CI/CD(GitHub Actions)

| ワークフロー | トリガ | 内容 |
|---|---|---|
| `ci` | push / PR | 型チェック、Lint、ユニットテスト(ゴールデンテスト含む) |
| `deploy` | main への push | `opennextjs-cloudflare build` → `wrangler deploy` |
| `batch` | 週次(月曜) / 手動 | GTFS取得→診断計算→R2アップロード→D1更新 |

### 10.3 マイグレーション

```bash
pnpm drizzle-kit generate            # スキーマ差分からSQL生成
wrangler d1 migrations apply regen-db --local   # ローカル適用
wrangler d1 migrations apply regen-db --remote  # 本番適用
```

---

## 11. まさゆきさんの作業(私が代行できないもの)

事前に済ませておくとスムーズなもの。いずれもCloudflareのダッシュボードまたはCLIでの操作。

1. **Cloudflareアカウントでのログイン**: `npx wrangler login`(ブラウザが開いて認可)
2. **D1データベースの作成**: `npx wrangler d1 create regen-db` → 出力される `database_id` を `wrangler.jsonc` に貼る
3. **R2バケットの作成**: `npx wrangler r2 bucket create regen-bundles`(R2は初回にダッシュボードでの有効化が必要な場合がある)
4. **GitHubリポジトリの作成**とActions用シークレット登録: `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`
   - APIトークンはCloudflareダッシュボードの「My Profile → API Tokens」から、Workers・D1・R2の編集権限を付けて発行
5. **Better Authのシークレット生成と登録**: `npx wrangler secret put BETTER_AUTH_SECRET`
6. **管理者アカウントの初期登録**(F-7の初回のみ)

必要になったタイミングで、コマンドと画面の手順を都度お渡しします。

---

## 12. マイルストーン

| 時期 | 完了条件 |
|---|---|
| 9月上旬 | モノレポ初期化、`packages/core` へのアルゴリズム移植、ゴールデンテスト通過 |
| 9月下旬 | バッチ完成(GTFS→診断→R2/D1)、46路線のバンドル生成 |
| 10月中旬 | F-1マップ + F-5一覧 が本番URLで動作、無償公開開始 |
| 10月下旬 | F-2診断書 完成 |
| 11月中旬 | F-3車両比較、F-6シナリオ共有、F-7管理画面 |
| 11月下旬 | F-4実測補正、実家デジタコでの補正実証 |
| 12月中旬 | UI磨き込み、他地域フィードでの動作確認、`/about`(マニュアル)完成 |
| 12月下旬 | 紹介動画(2分以内)、紹介資料PDF、スクリーンショット5枚 |
| 1月4日 | **応募提出**(締切1/11、提出後修正不可のため1週間の余裕を確保) |

---

## 13. 未確定事項

| # | 事項 | 判断時期 |
|---|---|---|
| 1 | 車両マスタに載せる具体的な車種と出典 | 9月 |
| 2 | 充電計画の提示粒度(回数のみ / 時間帯まで踏み込むか) | F-2実装時 |
| 3 | 対象地域を南信州以外にも広げるか(汎用性の証明として何地域か) | 12月 |
| 4 | 作品名を「Regen」で確定するか | 11月まで |
| 5 | TCO計算に含める項目(電気代・燃料費・車両価格・補助金の他に整備費を入れるか) | F-3実装時 |

---

*本要件定義書は、技術検証(2026-08-28)および南信州46路線の実診断(2026-08-29)で動作確認済みのアルゴリズムを前提としている。*
