# 08 F-8 データ更新バッチ

ステータス: 完了
依存: 06
参照: 要件F-8 §3.1 §6.2 §6.3 §10.2、既存: batch/(v0作成済み)
データ: `data/gtfs_zips/`(喬木村フィード期限 2026-12-15 に注意)

## スコープ

- 既存バッチv0(gtfs/dem/build)を拡張:
  - GTFS取得と更新検出(F-8-1)。更新なしなら再計算スキップ
  - 標高タイルキャッシュ(F-8-2、GitHub Actionsキャッシュ)
  - 診断バンドルを R2 `bundles/<version>/` へアップロード、メタをD1に記録(F-8-3、§6.2のキー設計)
  - バージョン切替はD1メタ更新で行う(旧版を壊さない)
  - フィード有効期限の検出 → feeds テーブルに記録(F-8-5。警告表示は10)
- GitHub Actions `batch` ワークフロー: 週次(月曜)+ 手動(F-8-4)
- batch_runs への実行記録(running/success/failed)

## 受入条件

- 全実行15分以内(要件§5.1)
- バンドルgzip後1.5MB以下
- 実行後、06のAPIが新版を返し、実行中も旧版が壊れない
- 再実行しても同一入力なら同一出力(ゴールデンテストで担保)

## Todo

- [x] R2アップロード(bundles/<version>/routes.json, profile/*.json, meta.json)
- [x] D1書き込み(agencies/routes/feeds/batch_runs)+ 版切替
- [x] GTFS更新検出(gtfs-data.jp APIの file_uid)
- [x] 標高タイルキャッシュのActions連携
- [x] フィード期限チェック
- [x] .github/workflows/batch.yml(週次+手動、シークレットはユーザー登録 — 要件§11-4)
- [x] ローカル実行 → preview環境で表示確認
- [x] バンドルサイズ・実行時間の計測記録

## 実装メモ

### やったこと

**凍結seedの上に建っていた「暫定経路」を、実パイプラインに置き換えた。**
着手時点のバッチは、GTFSからの再計算経路(`build.ts`)がどこからも呼ばれておらず、
実際に `data/bundle/` を作っていたのは `seed-map.ts` — Python時代の `data/seed/map_data.json` を
`routes_meta.json` と (名前, 事業者, 便数) + 路線長最近傍で**曖昧結合するだけ**のスクリプトだった。
取得も版発行も `batch_runs` への記録も無かった。

- `batch/src/` を作り直した。新: `feeds.ts`(取得・更新検出・版) / `pipeline.ts`(GTFS+標高→診断→成果物) /
  `verify.ts`(変化ガード) / `publish.ts`(R2→D1→版切替) / `cf.ts`(wrangler越しのD1・R2) /
  `snapshot.ts`(パラメータスナップショット) / `refresh.ts`(入口)。
  削除: `build.ts` `seed-map.ts` `seed-profiles.ts` `seed-schedule.ts` `seed-agencies.ts` `seed-cloud.ts`
- **`data/seed/` を廃止した。** `map_data.json` / `dem_all_routes.json` / `routes_meta.json` は
  パイプラインが再生成するので入力として不要になった。`agencies.json` / `feeds.json` は
  バッチの出力として `data/bundle/` に移した(出力先をひとつにまとめた)
- コマンドは `pnpm batch` の1本(旧 `seed-*` は廃止)

### 取得元(F-8-1)

GTFSデータリポジトリの公開API。認証不要。
`GET https://api.gtfs-data.jp/v2/files` が全フィードの現行ファイルを返し、
`file_uid`(公開ファイルのUUID)・`file_published_at`・zip直URL・有効期間が取れる。

対象は `data/feeds.source.json` に列挙した南信州11フィードだけ。
**APIの `feed_id` はハイフン入り(`Minamishinshu-takagi-1`)、こちらのIDはハイフン無し
(`Minamishinshutakagi1`)で表記が違う。** 路線IDは `<feedId>_<route_id>` なので、
ここを機械変換に任せると共有URLとブックマークが壊れる。対応表は人が管理する。

### 版(F-8-3)

`<全フィードの公開日の最大 YYYYMMDD>-<sha256(feed_uid列 + 診断パラメータ)の先頭8桁>`
(例 `20260818-c2bb49ee`)。**入力から導出するので、同一入力なら同一版**になり、
再実行は版を積まず同じキーへの冪等な上書きになる(受入条件「再実行しても同一入力なら同一出力」)。
診断パラメータを混ぜてあるので、アルゴリズムを変えれば版が変わり、
F-6の共有シナリオが固定した過去の版の数字は動かない。

更新検出は「算出した版が既に `is_current` ならダウンロードも診断もしない」。実測で8秒で抜ける。

### 順序のバグを直した

旧 `seed-cloud.ts` は **D1(`is_current=1` を含む)を先に流し、R2アップロードを後**にしていた。
版が実際に動いた瞬間、実体の無いR2キーを指す時間帯ができる = 受入条件「実行中も旧版が壊れない」に反する。
`publish.ts` では R2を全部書く(`meta.json` を最後に置いて完了印にする)→ D1の行を更新(新版は
`is_current=0`)→ **最後に切替**、の順にした。実装中に実際にR2アップロードで落ちた回があったが、
旧版が配信されたまま保たれることを確認できた。

**R2アップロードは直列。** 並列にすると、ローカル(miniflare)で各wranglerプロセスが同じSQLiteを掴んで
`SQLITE_BUSY` で落ちる(`next build` を `cpus: 1` にしているのと同じ理由)。
48オブジェクトで1分弱なので、速さより確実さを取った。

### 変化ガード

新しい計算結果を、直近に公開した `data/bundle/routes_summary.json` と突き合わせ、
**丸めた公開値が1つでも動いたら R2にもD1にも書かずに止める**(`--allow-changes` で承認)。
`data/bundle/` は公開に成功したあとに書くので、「いま配信されている内容」と常に一致する。

喬木村フィードは2026-12-15期限で提出前に必ず差し替わる。そのとき週次実行は落ちて止まるので、
差分を見てから手動実行(`workflow_dispatch` の `allow_changes`)で通す。
これがF-8-4の「手動実行」の実務上の役割。

### 切替時に動いた数字(初回のみ)

実パイプラインへの切替そのものは数値を動かさない。着手前に実測で確認した:

- `loadFeed` + `resample` が凍結 `routes_meta.json` を **46/46一致**で再現
  (サンプル数・`gap`・`anchors`・`trips`・`mode`・起終点停留所名・停留所数)
- マップのポリラインは `simplify(リサンプル後, 220)`。**座標は46路線とも完全一致**
- ダイヤ(`schedules.json`)も**全46路線で完全一致**

動いたのは**地理院タイルそのものの更新**による分だけ。Python実行時(2026-08-29)から
今回取得したタイルまでで標高が最大 0.78 m 動いており、その結果:

- 丸めた公開値が **12路線・14項目**で1目盛り分だけ移動(`daily` 8件 / `gmax` 3件 / `up` 2件 /
  `emax` 2件 / `L` 1件。うち `L` の1件は Python の偶数丸めと JS の `toFixed` の差)
- **判定(verdict)・電費(kwh)・往復電池%(batt)・追加充電回数(charges)・補正量(corr)は
  46路線とも変化なし。** 適34/条件付き12 も変わらない
- 縦断プロファイルの標高は最大 0.60 m 移動

ガードはこれを検出して止まり、内容を確認したうえで `--allow-changes` で通した。

### 計測(受入条件)

| 項目 | 目標 | ローカル | GitHub Actions(本番) |
|---|---|---|---|
| 全実行(取得あり) | 15分以内 | 80秒(タイル温) | **178秒**(ワークフロー全体。タイル159枚を新規取得) |
| 更新なしの実行 | — | 8秒 | **49秒**(ワークフロー全体) |
| バンドル gzip 後 | 1.5MB以下 | **0.20MB** | 同左 |
| 標高タイル | — | 159枚 | 159枚(キャッシュ約26MB) |
| R2オブジェクト / D1文 | — | 48 / 73 | 48 / 73 |

### 本番反映(2026-08-30 完了)

シークレット登録後、**GitHub Actionsの手動実行で本番へ公開した**。

- `bundles`: `20260818-c2bb49ee` が `is_current=1`、旧 `2026-08-29-prototype` は
  `is_current=0` で**行もR2のキーも残っている**
- `batch_runs` に success(46路線 / 11フィード / 141.5秒)、`feeds` に `file_uid` と
  喬木村の期限 `2026-12-15` が入った
- **Actionsのランナーが標高タイルを159枚すべて新規取得したうえで、
  手元の計算と「公開値は前回と完全一致」になった。** 環境をまたいで再現することの確認になっている
- 2回目の実行で `actions/cache` からタイルが復元され(26MB)、「更新なし」で49秒で終了。
  データに変化が無いのでコミットも作られない

**注意: ワークフローは Node 22 で動かす。** `packageManager` で固定した pnpm 11 が Node 22.13以上を
要求するため、Node 20 では setup の時点で `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` で落ちる。
