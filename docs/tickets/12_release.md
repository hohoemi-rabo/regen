# 12 CI/CD・本番公開・応募資材

ステータス: 未着手
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

- [ ] ci.yml(typecheck/lint/test)
- [ ] deploy.yml(build→wrangler deploy)
- [ ] シークレット登録手順の提示
- [ ] 本番デプロイ・動作確認(全画面・375px・印刷)
- [ ] next/image ローダー方針決定・適用
- [ ] 予備公開先の作成
- [ ] Lighthouse計測(初回3秒以内の確認)
- [ ] 応募資材: スクリーンショット5枚
- [ ] 応募資材: 紹介資料PDF
- [ ] 応募資材: 紹介動画(2分)
- [ ] 応募フォーム記入 → 1/4 提出
