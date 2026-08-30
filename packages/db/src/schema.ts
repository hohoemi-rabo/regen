import { sqliteTable, text, real, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// 要件定義書 §6.1 のスキーマ

export const agencies = sqliteTable("agencies", {
  id: text("id").primaryKey(),                // feed_id + agency_id
  name: text("name").notNull(),
  feedId: text("feed_id").notNull(),
});

export const routes = sqliteTable("routes", {
  id: text("id").primaryKey(),                // feed_id + route_id + direction
  agencyId: text("agency_id").notNull().references(() => agencies.id),
  name: text("name").notNull(),
  lengthM: real("length_m").notNull(),
  tripsPerDay: integer("trips_per_day").notNull(),
  climbM: real("climb_m").notNull(),
  maxGrade: real("max_grade").notNull(),
  kwhPerKm: real("kwh_per_km").notNull(),
  /**
   * 力行・回生 [kWh/片道]。実測補正(F-4)を一覧・マップに当てるために要る。
   * 補正後kWh = kDrive×(力行−回生) + kAux×空調 で、空調は 電費×距離 から逆算できる。
   * これがあると標高プロファイルを読まずに46路線を再計算できる(要件§3.2を崩さない)
   */
  tractionKwh: real("traction_kwh").notNull().default(0),
  regenKwh: real("regen_kwh").notNull().default(0),
  roundtripBattPct: real("roundtrip_batt_pct").notNull(),
  dailyKwh: real("daily_kwh").notNull(),
  extraCharges: integer("extra_charges").notNull(),
  verdict: text("verdict").notNull(),          // 適 / 条件付き / 要検討
  accuracy: text("accuracy").notNull(),        // A / B
  correctedM: real("corrected_m").notNull().default(0),
  bundleKey: text("bundle_key").notNull(),     // R2上のプロファイルJSONキー
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  index("idx_routes_verdict").on(t.verdict),
  index("idx_routes_agency").on(t.agencyId),
]);

export const vehicles = sqliteTable("vehicles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  powertrain: text("powertrain").notNull(),    // ev / diesel
  massKg: real("mass_kg").notNull(),
  batteryKwh: real("battery_kwh"),
  driveEff: real("drive_eff"),
  regenEff: real("regen_eff"),
  cda: real("cda").notNull(),
  crr: real("crr").notNull(),
  fuelKmPerL: real("fuel_km_per_l"),
  priceYen: integer("price_yen"),
  subsidyYen: integer("subsidy_yen"),
  sourceUrl: text("source_url"),
  /** 公表値でない項目をどう埋めたかの開示文(F-3の「試算の仮定」に出す)。packages/core の Vehicle.note と対応 */
  note: text("note"),
  isPublic: integer("is_public").notNull().default(1),
});

export const scenarios = sqliteTable("scenarios", {
  id: text("id").primaryKey(),                 // 推測困難なランダムID
  routeId: text("route_id").notNull().references(() => routes.id),
  paramsJson: text("params_json").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at"),
});

export const batchRuns = sqliteTable("batch_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
  status: text("status").notNull(),            // running / success / failed
  feeds: integer("feeds"),
  routes: integer("routes"),
  message: text("message"),
  /** その実行が発行したバンドル版。更新が無く再計算しなかった実行では null */
  version: text("version"),
});

/**
 * 診断バンドルの版(要件§6.2)。
 * R2は `bundles/<version>/...` に版ごと積み、**旧版のキーを上書きしない**。
 * どの版を配信するかはこの表の is_current だけで切り替える(バッチ実行中も旧版が壊れない)。
 */
export const bundles = sqliteTable("bundles", {
  version: text("version").primaryKey(),      // R2のキー接頭辞。例 2026-08-29-prototype
  createdAt: integer("created_at").notNull(),
  routeCount: integer("route_count").notNull(),
  feedCount: integer("feed_count").notNull(),
  paramsJson: text("params_json"),            // 計算パラメータ(要件§9.2)のスナップショット
  sourceNote: text("source_note"),            // 出典表記
  isCurrent: integer("is_current").notNull().default(0),
});

export const feeds = sqliteTable("feeds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sourceUrl: text("source_url").notNull(),
  feedStart: text("feed_start"),
  feedEnd: text("feed_end"),
  /** gtfs-data.jp の公開ファイルUUID。これが変わったときだけ再計算する(F-8-1) */
  fileUid: text("file_uid"),
  /** 同 file_published_at(ISO8601)。管理画面のフィード鮮度表示に使う */
  publishedAt: text("published_at"),
  fetchedAt: integer("fetched_at"),
});

/**
 * 管理画面から変えられる設定(F-7-4)。いまは判定しきい値だけが入る。
 * value はJSON文字列。**読み出しのたびに packages/core の normalize を通す**
 * (画面から書かれる値なので、型と値域をアプリ側で保証しない)。
 */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
  /** 変更した管理者のメールアドレス。誰がしきい値を動かしたかを追えるようにする */
  updatedBy: text("updated_by"),
});

// ---------------------------------------------------------------------------
// Better Auth(管理画面F-7専用。一般利用者側には露出させない — CLAUDE.md #4)
// 列は better-auth 1.7.2 の getAuthTables() の出力そのまま。
// 日付は date 型 = Drizzleの timestamp_ms、真偽値は boolean モードで扱う。
// ---------------------------------------------------------------------------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [
  index("idx_session_user").on(t.userId),
]);

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  issuer: text("issuer").notNull(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  index("idx_account_user").on(t.userId),
  uniqueIndex("uq_account_issuer_accountid").on(t.issuer, t.accountId),
]);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  index("idx_verification_identifier").on(t.identifier),
]);
