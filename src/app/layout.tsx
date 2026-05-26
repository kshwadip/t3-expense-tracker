import "~/styles/globals.css";
import { type Metadata } from "next";
import { SessionProvider } from "next-auth/react";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Expense Tracker",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
