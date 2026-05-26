"use client";
import { signIn, signOut, useSession } from "next-auth/react";

export function SignIn() {
  return (
    <button onClick={() => signIn("discord")}>
      Sign in with Discord
    </button>
  );
}

export function SignOut() {
  return (
    <button onClick={() => signOut()}>
      Sign out
    </button>
  );
}
