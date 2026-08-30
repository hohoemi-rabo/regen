/**
 * wrangler が知らないバインディングの型。
 *
 * `wrangler types` は wrangler.jsonc に書かれたものしか出力しない。シークレットは
 * 設定ファイルに載らないので、ここで宣言マージして足す。
 * (worker-configuration.d.ts は生成物なので直接書かない。再生成で消える)
 */
interface CloudflareEnv {
  /** 管理画面のセッション署名鍵。`wrangler secret put`(要件§11-5) */
  BETTER_AUTH_SECRET: string;
  /** 管理者の初回登録に要る合い言葉。`wrangler secret put`(要件§11-6) */
  ADMIN_SETUP_TOKEN: string;
}
