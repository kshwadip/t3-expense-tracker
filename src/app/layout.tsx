import "~/styles/globals.css";
import { type Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { TRPCReactProvider } from "~/trpc/react";
import { auth } from "~/server/auth"; // Import your NextAuth auth configuration wrapper

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Expense Tracker",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Fetch the authenticated session on the server side
  const session = await auth();

  return (
    <html lang="en">
      <body>
        <TRPCReactProvider>
          {/* 2. Feed the server session explicitly to NextAuth's provider */}
          <SessionProvider session={session}>
            {children}
          </SessionProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}