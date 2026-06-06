import { auth } from "~/server/auth";
import { SignIn } from "./_components/signin";
import { SignOut } from "./_components/signin";
import Link from "next/link";

export default async function Home() {
  const session = await auth();

  return (
    <main>
      {session ? (
        <>
          <p>Logged in as {session.user?.name}</p>
          <Link href="/profile" className="text-blue-500 underline">
            Go to Profile Page
          </Link>
          <br />
          <Link href="/upload" className="text-blue-500 underline">
            Go to Upload Page
          </Link>
          <br />
          <SignOut />
        </>
      ) : (
        <SignIn />
      )}
    </main>
  );
}
export const runtime = "nodejs";