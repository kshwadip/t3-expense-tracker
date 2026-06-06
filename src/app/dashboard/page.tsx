"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

// ── Constants ────────────────────────────────────────────────────────────────

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const CATEGORY_ICONS: Record<string, string> = {
  "Food & Dining": "🍽",
  Groceries: "🛒",
  Transport: "🚌",
  Healthcare: "💊",
  Shopping: "🛍",
  Entertainment: "🎬",
  Utilities: "⚡",
  "Taxes & Fees": "🏛",
  Other: "📦",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 100_000) return "₹" + (n / 100_000).toFixed(1) + "L";
  if (n >= 1_000) return "₹" + (n / 1_000).toFixed(1) + "k";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function fmtFull(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent = false,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  color?: "green" | "red" | "amber";
}) {
  const valueClass = accent
    ? "text-[#f5a623]"
    : color === "green"
    ? "text-[#2adb7a]"
    : color === "red"
    ? "text-[#ef4444]"
    : color === "amber"
    ? "text-[#f5a623]"
    : "text-[#e8e0d0]";

  return (
    <div
      className={`bg-[#12121c] border rounded-xl px-3.5 py-3 ${
        accent ? "border-[#f5a62330]" : "border-[#2a2a3e]"
      }`}
    >
      <p className="text-[9px] text-[#4a4a6a] tracking-[0.22em] uppercase mb-1.5">
        {label}
      </p>
      <p className={`text-[1.15rem] font-bold leading-none ${valueClass}`}>
        {value}
      </p>
      {sub && (
        <p className="text-[10px] text-[#4a4a6a] mt-1.5 leading-tight">{sub}</p>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 bg-[#1e1e2e] rounded w-24" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-[#12121c] border border-[#2a2a3e] rounded-xl" />
        ))}
      </div>
      <div className="h-4 bg-[#1e1e2e] rounded w-32 mt-4" />
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 bg-[#12121c] border border-[#2a2a3e] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data: dash, isLoading } = api.analytics.dashboard.useQuery({
    year,
    month,
  });
  const { data: trend } = api.analytics.trend.useQuery();

  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;

  function prevMonth() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (isCurrentMonth) return;
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  }

  // Category data sorted by spend
  const categories = dash
    ? Object.entries(dash.byCategory).sort((a, b) => b[1].spend - a[1].spend)
    : [];
  const maxCatSpend =
    categories.length > 0
      ? Math.max(...categories.map(([, v]) => v.spend))
      : 1;

  // Trend data
  const maxTrendSpend =
    trend && trend.length > 0 ? Math.max(...trend.map((t) => t.spend), 1) : 1;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e0d0] font-mono pb-24">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-[#0a0a0f] border-b border-[#1e1e2e] px-4 py-4">
        <p className="text-[10px] text-[#f5a623] tracking-[0.35em] uppercase mb-1">
          Analytics
        </p>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>

          {/* Month navigator */}
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-[#2a2a3e] text-[#4a4a6a] hover:text-[#f5a623] hover:border-[#f5a62350] transition-all text-base"
            >
              ‹
            </button>
            <span className="text-xs text-[#c8c0b0] w-20 text-center">
              {SHORT_MONTHS[month - 1]} {year}
            </span>
            <button
              onClick={nextMonth}
              disabled={isCurrentMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-[#2a2a3e] text-[#4a4a6a] hover:text-[#f5a623] hover:border-[#f5a62350] transition-all text-base disabled:opacity-25 disabled:cursor-not-allowed"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 space-y-7">
        {/* ── Loading skeleton ── */}
        {isLoading && <Skeleton />}

        {/* ── KPI Cards ── */}
        {!isLoading && (
          <section>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Total Spend"
                value={fmt(dash?.totalSpend ?? 0)}
                sub={`${dash?.receiptCount ?? 0} receipt${dash?.receiptCount !== 1 ? "s" : ""}`}
                accent
              />
              <StatCard
                label="Tax Paid"
                value={fmt(dash?.totalTax ?? 0)}
                sub="GST paid"
              />
              <StatCard
                label="ITC Claimable"
                value={fmt(dash?.totalITC ?? 0)}
                sub={`${dash?.businessExpCount ?? 0} biz expense${dash?.businessExpCount !== 1 ? "s" : ""}`}
                color="green"
              />
              <StatCard
                label="Flagged"
                value={String(dash?.flaggedCount ?? 0)}
                sub="needs review"
                color={
                  (dash?.flaggedCount ?? 0) > 0 ? "red" : undefined
                }
              />
            </div>

            {/* Fees / Fines row — only if non-zero */}
            {((dash?.totalFees ?? 0) > 0 || (dash?.totalFines ?? 0) > 0) && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                {(dash?.totalFees ?? 0) > 0 && (
                  <StatCard
                    label="Service Fees"
                    value={fmt(dash?.totalFees ?? 0)}
                    sub="charges + surcharges"
                  />
                )}
                {(dash?.totalFines ?? 0) > 0 && (
                  <StatCard
                    label="Fines"
                    value={fmt(dash?.totalFines ?? 0)}
                    sub="penalties"
                    color="red"
                  />
                )}
              </div>
            )}

            {/* Tax regime badge */}
            {dash && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[9px] tracking-[0.2em] uppercase text-[#4a4a6a]">
                  Tax Regime:
                </span>
                <span className="text-[9px] tracking-[0.15em] uppercase text-[#f5a623] border border-[#f5a62340] rounded px-1.5 py-0.5">
                  {dash.taxRegime === "new" ? "New 2024-25" : "Old Regime"}
                </span>
              </div>
            )}
          </section>
        )}

        {/* ── By Category ── */}
        {!isLoading && categories.length > 0 && (
          <section>
            <p className="text-[10px] text-[#f5a623] tracking-[0.28em] uppercase mb-3">
              By Category
            </p>
            <div className="space-y-2">
              {categories.map(([cat, data]) => (
                <div
                  key={cat}
                  className="bg-[#12121c] border border-[#2a2a3e] rounded-xl px-3.5 py-2.5"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm shrink-0">
                        {CATEGORY_ICONS[cat] ?? "📦"}
                      </span>
                      <span className="text-xs text-[#c8c0b0] truncate">
                        {cat}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-[#4a4a6a]">
                        {data.count}×
                      </span>
                      <span className="text-sm text-[#e8e0d0]">
                        {fmt(data.spend)}
                      </span>
                    </div>
                  </div>
                  {/* Bar */}
                  <div className="h-0.75 bg-[#1e1e2e] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#f5a623] rounded-full transition-all duration-700"
                      style={{
                        width: `${(data.spend / maxCatSpend) * 100}%`,
                      }}
                    />
                  </div>
                  {/* Tax / ITC row */}
                  {(data.tax > 0 || data.itc > 0) && (
                    <div className="flex gap-4 mt-1.5">
                      {data.tax > 0 && (
                        <span className="text-[9px] text-[#4a4a6a]">
                          GST {fmt(data.tax)}
                        </span>
                      )}
                      {data.itc > 0 && (
                        <span className="text-[9px] text-[#2adb7a]">
                          ITC {fmt(data.itc)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Budget Status ── */}
        {!isLoading &&
          dash?.budgetStatus &&
          dash.budgetStatus.length > 0 && (
            <section>
              <p className="text-[10px] text-[#f5a623] tracking-[0.28em] uppercase mb-3">
                Budget Status
              </p>
              <div className="space-y-2">
                {dash.budgetStatus.map((b) => {
                  const over = b.pct >= 100;
                  const warn = b.pct >= 80 && !over;
                  const barColor = over
                    ? "#ef4444"
                    : warn
                    ? "#f59e0b"
                    : "#2adb7a";
                  const pctLabel = over ? `${b.pct}% ⚠` : `${b.pct}%`;

                  return (
                    <div
                      key={b.category}
                      className={`bg-[#12121c] border rounded-xl px-3.5 py-2.5 ${
                        over
                          ? "border-[#ef444430]"
                          : "border-[#2a2a3e]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-[#c8c0b0]">
                          {CATEGORY_ICONS[b.category] ?? "📦"} {b.category}
                        </span>
                        <span
                          className="text-[10px]"
                          style={{ color: barColor }}
                        >
                          {pctLabel}
                        </span>
                      </div>
                      <div className="h-1.25 bg-[#1e1e2e] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.min(100, b.pct)}%`,
                            backgroundColor: barColor,
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-1.5">
                        <span className="text-[9px] text-[#4a4a6a]">
                          spent {fmtFull(b.spent)}
                        </span>
                        <span className="text-[9px] text-[#4a4a6a]">
                          limit {fmtFull(b.limit)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

        {/* ── 6-Month Trend ── */}
        {!isLoading && trend && trend.length > 0 && (
          <section>
            <p className="text-[10px] text-[#f5a623] tracking-[0.28em] uppercase mb-3">
              6-Month Trend
            </p>
            <div className="bg-[#12121c] border border-[#2a2a3e] rounded-xl px-4 pt-4 pb-3">
              {/* Chart */}
              <div className="flex items-end gap-1.5" style={{ height: "72px" }}>
                {trend.map((t, i) => {
                  const pct = Math.max(
                    4,
                    (t.spend / maxTrendSpend) * 100,
                  );
                  const isLast = i === trend.length - 1;
                  return (
                    <div
                      key={i}
                      className="flex-1 flex items-end"
                      title={`${t.label}: ${fmtFull(t.spend)}`}
                    >
                      <div
                        className="w-full rounded-t-sm transition-all duration-700"
                        style={{
                          height: `${pct}%`,
                          backgroundColor: isLast
                            ? "#f5a623"
                            : "#f5a62350",
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Labels */}
              <div className="flex gap-1.5 mt-2">
                {trend.map((t, i) => (
                  <div key={i} className="flex-1 text-center">
                    <span className="text-[8px] text-[#3a3a5e] tracking-wide">
                      {t.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="mt-3 pt-3 border-t border-[#1e1e2e] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-2 bg-[#f5a623] rounded-sm" />
                  <span className="text-[9px] text-[#4a4a6a]">This month</span>
                </div>
                <span className="text-[9px] text-[#4a4a6a]">
                  Peak: {fmtFull(maxTrendSpend)}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* ── Flagged Receipts ── */}
        {!isLoading &&
          dash?.flaggedReceipts &&
          dash.flaggedReceipts.length > 0 && (
            <section>
              <p className="text-[10px] text-[#f5a623] tracking-[0.28em] uppercase mb-3">
                Flagged · Needs Review
              </p>
              <div className="space-y-2">
                {dash.flaggedReceipts.map((r) => (
                  <div
                    key={r.id}
                    className="bg-[#12121c] border border-[#ef444425] rounded-xl px-3.5 py-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-[#e8e0d0] truncate">
                        {r.merchant ?? "Unknown Merchant"}
                      </p>
                      {r.reason && (
                        <p className="text-[10px] text-[#6a6a8a] mt-0.5 leading-snug">
                          {r.reason}
                        </p>
                      )}
                    </div>
                    <span className="text-sm text-[#ef4444] shrink-0 font-bold">
                      {fmt(r.total)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

        {/* ── Empty state ── */}
        {!isLoading && (dash?.receiptCount === 0 || !dash) && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-5xl mb-5 opacity-40">🧾</span>
            <p className="text-[#4a4a6a] text-sm mb-1">
              No receipts for {SHORT_MONTHS[month - 1]} {year}
            </p>
            <p className="text-[#2a2a4a] text-xs">
              Upload a receipt to see your analytics
            </p>
          </div>
        )}
      </div>
    </div>
  );
}