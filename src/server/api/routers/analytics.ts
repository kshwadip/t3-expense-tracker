import { z } from "zod";
import { eq, and, gte, lte } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { receipts, userProfiles } from "~/server/db/schema";

// ── Indian Income Tax helpers ────────────────────────────────────────────────

/** Old regime slabs (FY 2024-25), assumes 50k standard deduction applied */
function calcOldRegimeTax(income: number): number {
  const taxable = Math.max(0, income - 50_000); // standard deduction
  if (taxable <= 250_000) return 0;
  if (taxable <= 500_000) return (taxable - 250_000) * 0.05;
  if (taxable <= 1_000_000) return 12_500 + (taxable - 500_000) * 0.2;
  return 112_500 + (taxable - 1_000_000) * 0.3;
}

/** New regime slabs (FY 2024-25), rebate up to ₹7L handled by 87A */
function calcNewRegimeTax(income: number): number {
  if (income <= 300_000) return 0;
  if (income <= 600_000) return (income - 300_000) * 0.05;
  if (income <= 900_000) return 15_000 + (income - 600_000) * 0.1;
  if (income <= 1_200_000) return 45_000 + (income - 900_000) * 0.15;
  if (income <= 1_500_000) return 90_000 + (income - 1_200_000) * 0.2;
  return 150_000 + (income - 1_500_000) * 0.3;
}

/** Add 4% education cess on top */
function withCess(tax: number): number {
  return Math.round(tax * 1.04);
}

// ── Router ───────────────────────────────────────────────────────────────────

export const analyticsRouter = createTRPCRouter({
  /**
   * Full dashboard payload for a given year/month.
   * Returns totals, per-category breakdown, budget utilization, and flagged count.
   */
  dashboard: protectedProcedure
    .input(
      z.object({
        year: z.number().default(new Date().getFullYear()),
        month: z.number().min(1).max(12).default(new Date().getMonth() + 1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 0, 23, 59, 59, 999);

      const [allMonthReceipts, profile] = await Promise.all([
        ctx.db.query.receipts.findMany({
          where: and(
            eq(receipts.userId, ctx.session.user.id),
            gte(receipts.date, startDate),
            lte(receipts.date, endDate),
          ),
        }),
        ctx.db.query.userProfiles.findFirst({
          where: eq(userProfiles.userId, ctx.session.user.id),
        }),
      ]);

      const done = allMonthReceipts.filter((r) => r.status === "done");

      const totalSpend = done.reduce(
        (s, r) => s + parseFloat(r.total ?? "0"),
        0,
      );
      const totalTax = done.reduce((s, r) => s + parseFloat(r.tax ?? "0"), 0);
      const totalFees = done.reduce(
        (s, r) => s + parseFloat(r.fees ?? "0"),
        0,
      );
      const totalFines = done.reduce(
        (s, r) => s + parseFloat(r.fines ?? "0"),
        0,
      );
      const totalITC = done
        .filter((r) => r.isBusinessExp)
        .reduce((s, r) => s + parseFloat(r.gstCredit ?? "0"), 0);

      // Per-category aggregation
      const byCategory: Record<
        string,
        { spend: number; tax: number; itc: number; count: number }
      > = {};
      for (const r of done) {
        const cat = r.category ?? "Other";
        const catEntry = (byCategory[cat] ??= { spend: 0, tax: 0, itc: 0, count: 0 });
        catEntry.spend += parseFloat(r.total ?? "0");
        catEntry.tax += parseFloat(r.tax ?? "0");
        catEntry.itc += parseFloat(r.gstCredit ?? "0");
        catEntry.count += 1;
      }

      const budgets =
        (profile?.monthlyBudgets as Record<string, number> | null) ?? {};

      // Budget utilization
      const budgetStatus = Object.entries(budgets).map(([cat, limit]) => ({
        category: cat,
        limit,
        spent: byCategory[cat]?.spend ?? 0,
        pct: Math.min(
          100,
          Math.round(((byCategory[cat]?.spend ?? 0) / limit) * 100),
        ),
      }));

      const flaggedReceipts = done.filter((r) => r.flagged);

      return {
        period: { year: input.year, month: input.month },
        totalSpend,
        totalTax,
        totalFees,
        totalFines,
        totalITC,
        receiptCount: done.length,
        businessExpCount: done.filter((r) => r.isBusinessExp).length,
        byCategory,
        budgetStatus,
        flaggedCount: flaggedReceipts.length,
        flaggedReceipts: flaggedReceipts.map((r) => ({
          id: r.id,
          merchant: r.merchant,
          total: parseFloat(r.total ?? "0"),
          reason: r.flagReason,
        })),
        taxRegime: profile?.taxRegime ?? "new",
      };
    }),

  /** Last 6-month spending/tax/ITC trend */
  trend: protectedProcedure.query(async ({ ctx }) => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const all = await ctx.db.query.receipts.findMany({
      where: and(
        eq(receipts.userId, ctx.session.user.id),
        gte(receipts.date, sixMonthsAgo),
      ),
    });

    const byMonth: Record<
      string,
      { spend: number; tax: number; itc: number; label: string }
    > = {};

    for (const r of all) {
      if (!r.date || r.status !== "done") continue;
      const d = r.date;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-IN", {
        month: "short",
        year: "2-digit",
      });
      const monthEntry = (byMonth[key] ??= { spend: 0, tax: 0, itc: 0, label });
      monthEntry.spend += parseFloat(r.total ?? "0");
      monthEntry.tax += parseFloat(r.tax ?? "0");
      monthEntry.itc += parseFloat(r.gstCredit ?? "0");
    }

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, data]) => data);
  }),

  /** Old vs New tax regime comparison given annual income */
  taxComparison: protectedProcedure
    .input(z.object({ annualIncome: z.number().min(0) }))
    .query(({ input }) => {
      const { annualIncome } = input;
      const oldTax = withCess(calcOldRegimeTax(annualIncome));
      const newTax = withCess(calcNewRegimeTax(annualIncome));
      const savings = Math.abs(oldTax - newTax);
      const recommended: "old" | "new" = oldTax <= newTax ? "old" : "new";

      return {
        annualIncome,
        oldRegimeTax: oldTax,
        newRegimeTax: newTax,
        savings,
        recommended,
        breakdown: {
          old: {
            standardDeduction: 50_000,
            taxableIncome: Math.max(0, annualIncome - 50_000),
            baseTax: calcOldRegimeTax(annualIncome),
            cess: oldTax - calcOldRegimeTax(annualIncome),
            total: oldTax,
          },
          new: {
            standardDeduction: 75_000, // new regime std deduction FY25
            taxableIncome: Math.max(0, annualIncome - 75_000),
            baseTax: calcNewRegimeTax(annualIncome),
            cess: newTax - calcNewRegimeTax(annualIncome),
            total: newTax,
          },
        },
      };
    }),
});