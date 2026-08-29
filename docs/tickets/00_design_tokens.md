# 00 デザイントークン整備

ステータス: 完了
参照: DESIGN.md §2(カラー) §3(タイポ) §4(レイアウト) §8(モーション) §11(申し合わせ)

## 目的

DESIGN.mdのトークンをコードに1回だけ定義し、以後の全チケットが生hexを書かずに済む土台を作る。

## スコープ

- `apps/web/app/globals.css` — `:root` にCSS変数を定義(§2.2/2.3/2.4/2.5の全トークン)
- `apps/web/tailwind.config.ts` — 同じ値をTailwindテーマに登録(`text-verdict-ok` 等で使えるように)
- フォント: `next/font` で Inter + Noto Sans JP をセルフホスト(ウェイト400/600のみ)
- `app/layout.tsx` — 共通ヘッダ(48px、DESIGN §6.1)とフッタ(出典表記、要件§5.5)
- 影・角丸・余白・モーション(120/180ms, reduced-motion対応)のトークン化

## 受入条件

- コンポーネント側から `var(--verdict-ok)` / `text-verdict-ok` の両方で参照できる
- ダークモード非対応(ライト単一テーマ)であること — DESIGN §2.1
- 本文14px、ウェイトは400/600のみ
- フッタに「地理院タイル / GTFSデータリポジトリ」の出典が出る

## Todo

- [x] globals.css にカラートークン定義(§2.2 基本 / §2.3 意味色 / §2.4 アクセント / §2.5 グラフ)
- [x] tailwind.config.ts にトークン登録(色・角丸・影・spacing)
- [x] next/font で Inter + Noto Sans JP 導入(400/600)
- [x] タイポスケールのユーティリティ整備(§3.2)、tabular-nums の適用手段を用意
- [x] layout.tsx: 共通ヘッダ(ロゴ + 路線一覧 + このサービスについて)
- [x] layout.tsx: 共通フッタ(出典・データ生成日時)
- [x] prefers-reduced-motion で遷移0msにするグローバルCSS
- [x] 仮トップページを新レイアウトに載せ替えて表示確認
