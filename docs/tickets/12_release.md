# 12 CI/CD・本番公開・応募資材

ステータス: 前半(CI/CD・本番運用)完了(2026-08-30)/ 後半(応募資材)は2026-09-30以降
依存: 02, 03(最小公開)。全チケット(最終提出)
参照: 要件§10 §12、応募先: https://challenge2026.odpt.org/ja/outline.html (締切 2027-01-11、提出目標 1/4)

## スコープ

段階的に実施(10月中旬の最小公開 → 1月の提出)。

### CI/CD

- .github/workflows/ci.yml: 型チェック・Lint・ゴールデンテスト(push/PR)
- .github/workflows/deploy.yml: mainへのpushで opennextjs-cloudflare build → deploy
- シークレット CLOUDFLARE_API_TOKEN / ACCOUNT_ID はユーザー登録(要件§11-4)

### 本番公開

- 本番URL確定、カスタムドメイン要否の判断
- next/image のローダー方針決定(Workersでは既定ローダー不可 — CLAUDE.md)
- 予備公開先(静的スナップショット)の用意(要件§10.1)
- 無料枠内での運用確認(§5.2)

### 応募資材(12月下旬)

- 紹介動画(2分以内)
- 紹介資料PDF
- スクリーンショット5枚
- マニュアルURL(= /about)
- 応募フォーム下書き

## 受入条件

- mainへのpushだけで本番反映される
- CI落ちのままデプロイされない
- 応募URLが締切〜2027-03-12まで生存する構え(予備含む)

## Todo

### 前半 — CI/CD・本番運用(完了)

- [x] ci.yml(typecheck/lint/test)
- [x] deploy.yml(seed→build→本番マイグレーション→deploy→疎通確認)
- [x] シークレット登録手順の提示(4つとも登録済み。要件§11はすべて完了)
- [x] 本番デプロイ・動作確認(全画面・375px・印刷)
- [x] next/image ローダー方針決定・適用(**使わない**)
- [x] 性能計測(要件§5.1の5項目すべて達成)

### 後半 — 応募資材(**応募フォーム開設 2026-09-30 以降**)

- [ ] 予備公開先の作成 ← **12月に判断**(要件§10.1に理由を記載)
- [ ] 応募資材: スクリーンショット5枚
- [ ] 応募資材: 紹介資料PDF
- [ ] 応募資材: 作品の説明(日本語400文字程度)
- [ ] 応募資材: 紹介動画(2分・YouTube)← 撮影はまさゆきさん
- [ ] 応募フォーム記入 → 1/4 提出

## 実装メモ(前半)

### ビルドはクリーンチェックアウトでは通らない ―― だからシードが要る

`apps/web/app/routes/[id]/page.tsx` と `.../compare/page.tsx` の `generateStaticParams` が
D1を引く(46路線×2ページを事前生成)。`.wrangler/` はgitignoreなのでCIにはテーブルすら無い。
`opennextjs-cloudflare deploy` は内部で `next build` を回すので、deployジョブも同じ前提。

**バッチ(`pnpm batch -- --skip-fetch`)で代用しなかった理由は2つ。**

1. **オフラインにならない。** `--skip-fetch` はgtfs-data.jpを飛ばすだけで、標高タイルは
   国土地理院へ取りに行く(約159枚)。デプロイのたびに外部サイトの生死に依存する
2. **判定がずれうる。** しきい値は**対象のD1**から読む。CIの空のD1では既定値になるので、
   管理画面(F-7-4)でしきい値を変えていると、本番と違う判定を焼き込んだページを配信する

そこで `pnpm seed:local`(`batch/src/seed-local.ts`)を作り、コミット済み `data/bundle/` を
そのまま `publish()` に渡してローカルD1/R2を復元する。**完全オフライン・約70秒**、
書き込みの順序(R2→D1→版切替)は `publish.ts` のまま使うので複製が無い。

そのために `data/bundle/d1.json`(8つ目の成果物)を足した。他の7つから復元できないのは:

- **`lengthM`** — `routes_summary.json` の `L` はkm・小数1桁。`profiles.json` の `lengthM` は
  `(n-1)×25m` で、実長とは**最大24m**違う(**11路線でkm表示の小数1桁が変わる**)。代用不可
- **`maxGrade`** — 分数のまま要る(`judge()` のしきい値が 0.1 ちょうど)
- **`feedOf`** — どこにも無い。路線IDの接頭辞から機械的に導けるが、
  それは共有URLを壊した手口(チケット08)と同じ発想なので採らない

さらに**公開した版・時刻・しきい値**も持たせ、シードが本番と同一の版・判定を再生するようにした。
`seed-local.ts` は d1.json の版がいまのコードで再現できなければ止まる。
**`--no-publish` では d1.json を書き換えない**(何も配信していないのに版を名乗らせないため)。

検証: クリーンクローン → install → typecheck → lint → test → seed → build が通り、
**seed後のローカルD1の46行が本番D1と完全一致**(`length_m` / `max_grade` / `verdict` /
`agency_id` / `bundle_key`、`bundles` の版と生成時刻も)。`batch_runs` は0件(シードは実行ではない)。

### ワークフローの形

- **`deploy` は `ci.yml` を `uses:` で呼ぶ。** `workflow_run` で待つ形だと、チェックが落ちたときに
  「デプロイが失敗した」ではなく「そもそも起動しない」になり履歴から読めない。
  ステップをコピーしないので、2か所がずれることもない
- **本番D1のマイグレーションはビルドの後・デプロイの前。** 新スキーマ前提のWorkerが先に出ると
  本番が壊れる。ビルドが落ちたときにD1だけ進むのも避ける。**加算のみに限る**
- **`batch.yml` は最後に deploy を明示的に起こす。** `GITHUB_TOKEN` によるpushは
  他のワークフローを起動しない(GitHubの再帰防止)ので、放っておくとデータだけ更新されて
  46ページが古いままになる。`workflow_dispatch` はこの制限の例外

### 受入条件の確認(実測)

- **「mainへのpushだけで本番反映される」** — run 33310081474(trigger: push)が
  ci → seed → build → migrate → deploy → 疎通確認 まで緑
- **「CI落ちのままデプロイされない」** — テストを1件わざと落としたブランチで実行し、
  `ci / check: failure` → `deploy: skipped` を確認(run 33310253710)
- 疎通確認10本すべて200(`/admin` のみ307)

### 性能(要件§5.1、2026-08-30 本番実測)

| 項目 | 目標 | 実測 | 測り方 |
|---|---|---|---|
| 初回表示(マップ) | 3秒以内 | **1.08秒**(FCP 0.94秒 / 75リクエスト / 1,148KB) | CDPで `performance.getEntriesByType` |
| 路線診断書 | 1秒以内 | **0.43秒**(FCP 0.27秒) | 同上 |
| F-3再計算 | 300ms以内 | **0.2ミリ秒** | 最重路線(2,226点・55.6km)で `simulateVehicle` 2本 + `tcoSeries` を30回平均 |
| 診断バンドル | gzip 1.5MB以下 | **65KB** | `/api/map` を `Accept-Encoding: gzip` で取得 |
| バッチ全実行 | 15分以内 | **約3分** | Actionsの実績 |

**マップのLCPだけはブラウザで見る必要がある。** MapLibreのcanvasはヘッドレスでは撮れない
(`preserveDrawingBuffer: false`)ので、上の1.08秒はタイル描画の完了を含まない。

### 決めたこと

- **`next/image` は使わない。** Workersで既定のローダーが動かない。図版は `public/` の静的アセットを
  素の `<img>` + 明示的な `width`/`height` で出す。`images.unoptimized` と
  ESLintの `@next/next/no-img-element` 無効化(理由コメント付き)が対
- **カスタムドメインは取らない。** 応募URLは `regen.rabo-hohoemi.workers.dev`。
  DNSと更新の失敗要因を、機能的な利得ゼロで増やさない。URLは2027-03-12まで生かす必要がある
- **ESLintの対象は `apps/web` だけ。** `packages/core` はゴールデンテスト123件、`batch` は
  `tsc --strict` で守られている。**警告も落とす**(`--max-warnings=0`)

### ESLintが見つけた実バグ2件(握りつぶさず直した)

1. **F-3がじぶん補正を無視していた。** `CompareScreen` の再計算 `useMemo` の依存配列に
   `calib` が無かった。補正は初回レンダーでは `null` で、`useEffect` が localStorage を
   読んだあとに入るため、**依存に無いと永久に反映されない**
2. **路線一覧のマップへのリンクが素の `<a>`** で、クリックで全ページ再読み込みになっていた
