import { sqliteTable, text, real, integer, index } from "drizzle-orm/sqlite-core";

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
});

export const feeds = sqliteTable("feeds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sourceUrl: text("source_url").notNull(),
  feedStart: text("feed_start"),
  feedEnd: text("feed_end"),
  fetchedAt: integer("fetched_at"),
});
