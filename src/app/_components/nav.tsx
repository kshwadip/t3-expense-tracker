"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (active: boolean) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={active ? 2 : 1.5}
        strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "/upload",
    label: "Upload",
    icon: (active: boolean) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={active ? 2 : 1.5}
        strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
  },
  {
    href: "/receipts",
    label: "Receipts",
    icon: (active: boolean) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={active ? 2 : 1.5}
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2h16v20l-2-2-2 2-2-2-2 2-2-2-2 2-2-2V2z" />
        <line x1="8" y1="8" x2="16" y2="8" />
        <line x1="8" y1="12" x2="16" y2="12" />
        <line x1="8" y1="16" x2="12" y2="16" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    icon: (active: boolean) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={active ? 2 : 1.5}
        strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
] as const;

export function BottomNav() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  if (status === "loading" || !session) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0f] border-t border-[#1e1e2e]">
      <div className="flex h-[60px]">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
            >
              {/* Active indicator bar at top */}
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-[#f5a623] rounded-b-full" />
              )}
              <span className={active ? "text-[#f5a623]" : "text-[#3a3a5e]"}>
                {item.icon(active)}
              </span>
              <span className={`text-[9px] tracking-[0.18em] uppercase font-mono ${
                active ? "text-[#f5a623]" : "text-[#3a3a5e]"
              }`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}