"use client";

import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { SignOut } from "../_components/signin";

const CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Transport",
  "Healthcare",
  "Shopping",
  "Entertainment",
  "Utilities",
  "Taxes & Fees",
  "Other",
] as const;

type Category = (typeof CATEGORIES)[number];

const CATEGORY_ICONS: Record<Category, string> = {
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

export default function ProfilePage() {
  const { data: profile, isLoading } = api.profile.get.useQuery();
  const upsert = api.profile.upsert.useMutation();

  const [profession, setProfession] = useState("");
  const [taxRegime, setTaxRegime] = useState<"old" | "new">("new");
  const [budgets, setBudgets] = useState<Partial<Record<Category, number>>>({});
  const [saved, setSaved] = useState(false);

  // Hydrate form from server data
  useEffect(() => {
    if (!profile) return;
    setProfession(profile.profession ?? "");
    setTaxRegime((profile.taxRegime as "old" | "new") ?? "new");
    const raw = (profile.monthlyBudgets as Record<string, number> | null) ?? {};
    const hydrated: Partial<Record<Category, number>> = {};
    for (const cat of CATEGORIES) {
      if (raw[cat] !== undefined) hydrated[cat] = raw[cat];
    }
    setBudgets(hydrated);
  }, [profile]);

  async function handleSave() {
    const cleanBudgets: Partial<Record<Category, number>> = {};
    for (const [k, v] of Object.entries(budgets)) {
      if (v !== undefined && v > 0) cleanBudgets[k as Category] = v;
    }
    await upsert.mutateAsync({
      profession: profession || undefined,
      taxRegime,
      monthlyBudgets: Object.keys(cleanBudgets).length
        ? (cleanBudgets as Record<Category, number>)
        : undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="w-8 h-8 border-2 border-[#f5a623] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e0d0] font-mono">
      {/* Header */}
      <div className="border-b border-[#1e1e2e] px-6 py-5">
        <p className="text-xs text-[#f5a623] tracking-[0.3em] uppercase mb-1">
          Configuration
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Your Profile</h1>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10 space-y-10">
        {/* Profession */}
        <section>
          <label className="block text-xs text-[#f5a623] tracking-[0.25em] uppercase mb-3">
            Profession
          </label>
          <input
            type="text"
            value={profession}
            onChange={(e) => setProfession(e.target.value)}
            placeholder="e.g. Freelance Designer, Salaried Engineer…"
            className="w-full bg-[#12121c] border border-[#2a2a3e] rounded-lg px-4 py-3 text-sm text-[#e8e0d0] placeholder-[#4a4a6a] focus:outline-none focus:border-[#f5a623] transition-colors"
          />
        </section>

        {/* Tax Regime */}
        <section>
          <p className="text-xs text-[#f5a623] tracking-[0.25em] uppercase mb-3">
            Income Tax Regime (FY 2024-25)
          </p>
          <div className="grid grid-cols-2 gap-3">
            {(["new", "old"] as const).map((regime) => (
              <button
                key={regime}
                onClick={() => setTaxRegime(regime)}
                className={`relative p-4 rounded-lg border text-left transition-all ${
                  taxRegime === regime
                    ? "border-[#f5a623] bg-[#f5a62310]"
                    : "border-[#2a2a3e] bg-[#12121c] hover:border-[#3a3a5e]"
                }`}
              >
                <div
                  className={`text-sm font-bold mb-1 ${taxRegime === regime ? "text-[#f5a623]" : "text-[#e8e0d0]"}`}
                >
                  {regime === "new" ? "New Regime" : "Old Regime"}
                </div>
                <div className="text-xs text-[#6a6a8a]">
                  {regime === "new"
                    ? "Lower slabs, no deductions. ₹3L–₹6L @ 5%"
                    : "Higher slabs + 80C/HRA deductions. ₹2.5L–₹5L @ 5%"}
                </div>
                {taxRegime === regime && (
                  <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-[#f5a623]" />
                )}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-[#4a4a6a]">
            Used for tax projections on the dashboard. You can change this anytime.
          </p>
        </section>

        {/* Monthly Budgets */}
        <section>
          <p className="text-xs text-[#f5a623] tracking-[0.25em] uppercase mb-1">
            Monthly Budgets (₹)
          </p>
          <p className="text-xs text-[#4a4a6a] mb-4">
            Leave blank to skip tracking for a category.
          </p>
          <div className="space-y-2">
            {CATEGORIES.map((cat) => (
              <div
                key={cat}
                className="flex items-center gap-4 bg-[#12121c] border border-[#2a2a3e] rounded-lg px-4 py-3"
              >
                <span className="text-lg w-6 text-center">
                  {CATEGORY_ICONS[cat]}
                </span>
                <span className="flex-1 text-sm text-[#c8c0b0]">{cat}</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a4a6a] text-sm">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={budgets[cat] ?? ""}
                    onChange={(e) => {
                      const val = e.target.value
                        ? parseFloat(e.target.value)
                        : undefined;
                      setBudgets((prev) => ({ ...prev, [cat]: val }));
                    }}
                    placeholder="—"
                    className="w-28 bg-[#0a0a0f] border border-[#2a2a3e] rounded pl-7 pr-3 py-1.5 text-sm text-right text-[#e8e0d0] placeholder-[#3a3a5a] focus:outline-none focus:border-[#f5a623] transition-colors"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Save Button */}
        <div className="pt-2">
          <button
            onClick={handleSave}
            disabled={upsert.isPending}
            className={`w-full py-3.5 rounded-lg text-sm font-bold tracking-widest uppercase transition-all ${
              saved
                ? "bg-[#2adb7a20] border border-[#2adb7a] text-[#2adb7a]"
                : "bg-[#f5a623] text-[#0a0a0f] hover:bg-[#f7b740] disabled:opacity-50"
            }`}
          >
            {upsert.isPending
              ? "Saving…"
              : saved
                ? "✓ Saved"
                : "Save Profile"}
          </button>
          <SignOut />
        </div>
      </div>
    </div>
  );
}