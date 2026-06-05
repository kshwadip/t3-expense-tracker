import { auth } from "~/server/auth";
import { SignIn } from "./_components/signin";
import { SignOut } from "./_components/signin";

export default async function Home() {
  const session = await auth();

  return (
    <main>
      {session ? (
        <>
          <p>Logged in as {session.user?.name}</p>
          <SignOut />
        </>
      ) : (
        <SignIn />
      )}
    </main>
  );
}
export const runtime = "nodejs";