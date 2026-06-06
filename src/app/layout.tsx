import "~/styles/globals.css";
import { type Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { TRPCReactProvider } from "~/trpc/react";
import { auth } from "~/server/auth";
import { BottomNav } from "./_components/nav";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "ExpenseAI",
  description: "AI-powered receipt tracking for India",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en">
      <body className="bg-[#0a0a0f] text-[#e8e0d0] antialiased">
        <TRPCReactProvider>
          <SessionProvider session={session}>
            {/* Bottom padding only when nav is visible (logged-in users) */}
            <div className={session ? "pb-15" : ""}>
              {children}
            </div>
            <BottomNav />
          </SessionProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}