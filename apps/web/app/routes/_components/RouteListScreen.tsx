"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/app/_components/Button";
import { DataTable, type Column, type SortState } from "@/app/_components/DataTable";
import { FilterRow } from "@/app/_components/FilterRow";
import { VerdictChip } from "@/app/_components/VerdictChip";
import { isVerdict, VERDICTS, type Verdict } from "@/app/_components/verdict";
import { formatInt, formatKm, formatKwhPerKm, formatNumber } from "@/lib/format";

export type RouteRow = {
  id: string;
  name: string;
  agency: string;
  verdict: string;
  batt: number;
  kwh: number;
  L: number;
  up: number;
  gmax: number;
  mode: "A" | "B";
  trips: number;
  daily: number;
  charges: number;
};

const ACCURACY_LABELS: Record<string, string> = {
  A: "A(実形状)",
  B: "B(停留所近似)",
};

type ColumnDef = Column<RouteRow> & {
  csvHeader: string;
  csvValue: (r: RouteRow) => string;
  sortValue: (r: RouteRow) => string | number;
};

// F-5-1 の12列。CSVも同じ定義から出す(単一の情報源)
const COLUMNS: ColumnDef[] = [
  {
    key: "verdict",
    header: "判定",
    render: (r) => (isVerdict(r.verdict) ? <VerdictChip verdict={r.verdict} /> : r.verdict),
    csvHeader: "判定",
    csvValue: (r) => r.verdict,
    sortValue: (r) => ["適", "条件付き", "要検討"].indexOf(r.verdict),
  },
  {
    key: "name",
    header: "路線",
    render: (r) => (
      <Link
        href={`/routes/${r.id}`}
        className="font-semibold text-ink-1 hover:text-accent"
        onClick={(e) => e.stopPropagation()}
      >
        {r.name}
      </Link>
    ),
    csvHeader: "路線",
    csvValue: (r) => r.name,
    sortValue: (r) => r.name,
  },
  {
    key: "agency",
    header: "事業者",
    render: (r) => <span className="text-ink-2">{r.agency}</span>,
    csvHeader: "事業者",
    csvValue: (r) => r.agency,
    sortValue: (r) => r.agency,
  },
  {
    key: "L",
    header: "距離 km",
    align: "right",
    render: (r) => formatKm(r.L),
    csvHeader: "距離km",
    csvValue: (r) => r.L.toFixed(1),
    sortValue: (r) => r.L,
  },
  {
    key: "trips",
    header: "便/日",
    align: "right",
    render: (r) => r.trips,
    csvHeader: "便数",
    csvValue: (r) => String(r.trips),
    sortValue: (r) => r.trips,
  },
  {
    key: "up",
    header: "累積上り m",
    align: "right",
    render: (r) => formatInt(r.up),
    csvHeader: "累積上りm",
    csvValue: (r) => String(Math.round(r.up)),
    sortValue: (r) => r.up,
  },
  {
    key: "gmax",
    header: "最急勾配 %",
    align: "right",
    render: (r) => formatNumber(r.gmax, 1),
    csvHeader: "最急勾配%",
    csvValue: (r) => r.gmax.toFixed(1),
    sortValue: (r) => r.gmax,
  },
  {
    key: "kwh",
    header: "電費 kWh/km",
    align: "right",
    render: (r) => formatKwhPerKm(r.kwh),
    csvHeader: "電費kWh/km",
    csvValue: (r) => r.kwh.toFixed(2),
    sortValue: (r) => r.kwh,
  },
  {
    key: "batt",
    header: "往復使用率 %",
    align: "right",
    render: (r) => r.batt,
    csvHeader: "往復使用率%",
    csvValue: (r) => String(r.batt),
    sortValue: (r) => r.batt,
  },
  {
    key: "daily",
    header: "日次 kWh",
    align: "right",
    render: (r) => formatInt(r.daily),
    csvHeader: "日次電力量kWh",
    csvValue: (r) => String(Math.round(r.daily)),
    sortValue: (r) => r.daily,
  },
  {
    key: "charges",
    header: "追加充電",
    align: "right",
    render: (r) => `${r.charges}回`,
    csvHeader: "追加充電回数",
    csvValue: (r) => String(r.charges),
    sortValue: (r) => r.charges,
  },
  {
    key: "mode",
    header: "精度",
    render: (r) => <span className="text-ink-2">{r.mode}</span>,
    csvHeader: "精度ランク",
    csvValue: (r) => r.mode,
    sortValue: (r) => r.mode,
  },
];

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

const EMPTY = { agency: "", verdict: "", mode: "" };

export function RouteListScreen({ rows }: { rows: RouteRow[] }) {
  const router = useRouter();
  const [filters, setFilters] = useState<Record<string, string>>(EMPTY);
  const [sort, setSort] = useState<SortState>({ key: "daily", dir: "desc" });

  const agencies = useMemo(() => [...new Set(rows.map((r) => r.agency))], [rows]);

  const visible = useMemo(() => {
    const filtered = rows.filter(
      (r) =>
        (filters.agency === "" || r.agency === filters.agency) &&
        (filters.verdict === "" || r.verdict === filters.verdict) &&
        (filters.mode === "" || r.mode === filters.mode)
    );
    const col = COLUMNS.find((c) => c.key === sort.key)!;
    const sign = sort.dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const va = col.sortValue(a);
      const vb = col.sortValue(b);
      if (typeof va === "string" || typeof vb === "string") {
        return sign * String(va).localeCompare(String(vb), "ja");
      }
      return sign * (va - vb);
    });
  }, [rows, filters, sort]);

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      // 数値列は降順、文字列は昇順から始める
      const col = COLUMNS.find((c) => c.key === key)!;
      const numeric = typeof col.sortValue(rows[0] ?? ({} as RouteRow)) === "number";
      return { key, dir: numeric ? "desc" : "asc" };
    });
  };

  const downloadCsv = () => {
    const lines = [
      COLUMNS.map((c) => csvEscape(c.csvHeader)).join(","),
      ...visible.map((r) => COLUMNS.map((c) => csvEscape(c.csvValue(r))).join(",")),
    ];
    // BOM付きUTF-8(Excelでの文字化け防止)
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `regen_routes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <FilterRow
        filters={[
          {
            key: "agency",
            label: "事業者",
            value: filters.agency,
            options: agencies.map((a) => ({ value: a, label: a })),
          },
          {
            key: "verdict",
            label: "判定",
            value: filters.verdict,
            options: (Object.keys(VERDICTS) as Verdict[]).map((v) => ({
              value: v,
              label: `${VERDICTS[v].symbol} ${v}`,
            })),
          },
          {
            key: "mode",
            label: "精度ランク",
            value: filters.mode,
            options: ["A", "B"].map((m) => ({ value: m, label: ACCURACY_LABELS[m] })),
          },
        ]}
        onChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
        onClear={() => setFilters(EMPTY)}
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-note text-ink-3">
          {rows.length}路線中 {visible.length}路線を表示
        </p>
        <Button onClick={downloadCsv} disabled={visible.length === 0}>
          CSVダウンロード
        </Button>
      </div>
      <div className="mt-3">
        <DataTable
          columns={COLUMNS}
          rows={visible}
          rowKey={(r) => r.id}
          minWidth={960}
          sort={sort}
          onSort={toggleSort}
          onRowClick={(r) => router.push(`/routes/${r.id}`)}
        />
      </div>
    </div>
  );
}
