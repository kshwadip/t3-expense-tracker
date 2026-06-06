"use client";
import { signIn, signOut } from "next-auth/react";

export function SignIn() {
  return (
    <button
      onClick={() => signIn("discord")}
      className="w-full flex items-center justify-center gap-3 bg-[#5865f2] hover:bg-[#4752c4] active:bg-[#3c45a5] text-white font-mono text-sm font-bold px-6 py-3.5 rounded-xl transition-colors tracking-widest uppercase"
    >
      {/* Discord icon */}
      <svg width="18" height="14" viewBox="0 0 18 14" fill="currentColor">
        <path d="M15.25 1.18A14.76 14.76 0 0 0 11.51 0a.06.06 0 0 0-.06.03c-.16.29-.34.67-.47.96a13.63 13.63 0 0 0-4.1 0A9.86 9.86 0 0 0 6.4.03.06.06 0 0 0 6.34 0a14.76 14.76 0 0 0-3.75 1.18.05.05 0 0 0-.03.02C.38 4.8-.23 8.3.07 11.77c0 .02.01.03.03.04a14.84 14.84 0 0 0 4.47 2.26.06.06 0 0 0 .07-.02c.34-.47.65-.97.91-1.49a.06.06 0 0 0-.03-.08 9.77 9.77 0 0 1-1.4-.67.06.06 0 0 1 0-.1l.28-.22a.06.06 0 0 1 .06-.01c2.94 1.34 6.12 1.34 9.03 0a.06.06 0 0 1 .06.01l.28.22a.06.06 0 0 1 0 .1 9.2 9.2 0 0 1-1.4.67.06.06 0 0 0-.03.08c.27.52.58 1.02.91 1.49a.06.06 0 0 0 .07.02 14.8 14.8 0 0 0 4.48-2.26.06.06 0 0 0 .03-.04c.37-3.84-.63-7.17-2.64-10.57a.05.05 0 0 0-.03-.02ZM6.01 9.67c-.88 0-1.61-.81-1.61-1.81s.71-1.81 1.61-1.81c.91 0 1.63.82 1.61 1.81 0 1-.71 1.81-1.61 1.81Zm5.97 0c-.88 0-1.61-.81-1.61-1.81s.71-1.81 1.61-1.81c.91 0 1.63.82 1.61 1.81 0 1-.7 1.81-1.61 1.81Z" />
      </svg>
      Sign in with Discord
    </button>
  );
}

export function SignOut() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="text-[#4a4a6a] hover:text-[#8a8aaa] font-mono text-[10px] tracking-[0.2em] uppercase transition-colors"
    >
      Sign out
    </button>
  );
}