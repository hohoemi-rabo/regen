# 08 F-8 データ更新バッチ

ステータス: 未着手
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

- [ ] R2アップロード(bundles/<version>/routes.json, profile/*.json, meta.json)
- [ ] D1書き込み(agencies/routes/feeds/batch_runs)+ 版切替
- [ ] GTFS更新検出(ハッシュ or Last-Modified)
- [ ] 標高タイルキャッシュのActions連携
- [ ] フィード期限チェック
- [ ] .github/workflows/batch.yml(週次+手動、シークレットはユーザー登録 — 要件§11-4)
- [ ] ローカル実行 → preview環境で表示確認
- [ ] バンドルサイズ・実行時間の計測記録
