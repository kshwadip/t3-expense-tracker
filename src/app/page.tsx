import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { SignIn } from "./_components/signin";

export const runtime = "nodejs";

export default async function Home() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-6">
      {/* Ambient glow */}
      <div
        className="pointer-events-none fixed inset-0 opacity-20"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 60%, #f5a62318, transparent)",
        }}
      />

      <div className="relative z-10 w-full max-w-sm text-center space-y-10">
        {/* Logo / wordmark */}
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-3xl">🧾</span>
          </div>
          <p className="text-[10px] text-[#f5a623] tracking-[0.45em] uppercase font-mono">
            AI Expense Tracker
          </p>
          <h1 className="text-3xl font-bold text-[#e8e0d0] font-mono tracking-tight">
            ExpenseAI
          </h1>
          <p className="text-xs text-[#4a4a6a] font-mono leading-relaxed">
            Scan receipts · Track GST · File smarter
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2">
          {[
            "✦ Groq Vision AI",
            "✦ GST / ITC",
            "✦ Tax Regime",
            "✦ Budget Alerts",
          ].map((f) => (
            <span
              key={f}
              className="text-[9px] font-mono tracking-[0.15em] text-[#4a4a6a] border border-[#2a2a3e] rounded-full px-2.5 py-1"
            >
              {f}
            </span>
          ))}
        </div>

        {/* Sign in */}
        <div className="space-y-3">
          <SignIn />
          <p className="text-[9px] text-[#3a3a5a] font-mono">
            Discord OAuth · No password needed
          </p>
        </div>
      </div>
    </main>
  );
}