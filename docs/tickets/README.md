# チケット一覧

実装単位。番号順が依存順(前のチケットが終わってから次に進む)。
正本: 機能は `../REQUIREMENTS_v1.0.md`、UIは `../DESIGN.md`。矛盾したら正本が勝つ。

## Todo管理のルール

- 各チケットの「Todo」節でタスクを `- [ ]` で管理する
- 終わったタスクは `- [x]` に書き換える(実装した本人=Claudeが更新する)
- チケット全体が完了したら、冒頭のステータスを `完了` にする

## 一覧

| # | ファイル | 内容 | 要件 | 優先度 |
|---|---|---|---|---|
| 00 | 00_design_tokens.md | デザイントークン・タイポ・共通レイアウト | DESIGN §2-4 | Must |
| 01 | 01_ui_components.md | 共通UIコンポーネント | DESIGN §5 | Must |
| 02 | 02_map.md | F-1 EV適性マップ (`/`) | F-1 | Must |
| 03 | 03_route_list.md | F-5 路線一覧 (`/routes`) | F-5 | Must |
| 04 | 04_diagnosis_sheet.md | F-2 路線診断書 (`/routes/[id]`) | F-2 | Must |
| 05 | 05_vehicle_compare.md | F-3 車両比較 (`/routes/[id]/compare`) | F-3 | Must |
| 06 | 06_infra_api.md | D1/R2セットアップ + API | 要件§6-7 | Must |
| 07 | 07_scenario_share.md | F-6 シナリオ保存・共有 (`/s/[id]`) | F-6 | Should |
| 08 | 08_batch.md | F-8 データ更新バッチ | F-8 | Must |
| 09 | 09_calibration.md | F-4 実測補正 (`/calibrate`) | F-4 | Should |
| 10 | 10_admin.md | F-7 管理画面 (`/admin`) | F-7 | Should |
| 11 | 11_about.md | `/about` (マニュアル兼) | 画面#7 | Must |
| 12 | 12_release.md | CI/CD・本番公開・応募資材 | §10, §12 | Must |

マイルストーン(要件§12): 10月中旬に 02+03 を本番公開 → 10月下旬 04 → 11月 05/07/10 → 11月下旬 09 → 12月 11/12。
