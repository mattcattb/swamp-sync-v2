import {createRootRoute, Link, Outlet} from "@tanstack/react-router";
import {Button} from "../components/ui/button";
import {signOut, useSession} from "../lib/auth";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { data: session, isPending } = useSession();

  return (
    <div className="min-h-screen">
      <header className="border-b-4 border-accent bg-primary text-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-2xl font-bold tracking-tight">
            Swamp Sync
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/dashboard" className="font-semibold text-white/90 hover:text-white">
              Home
            </Link>
            {isPending ? null : session ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => signOut()}
              >
                Sign out
              </Button>
            ) : (
              <Link
                to="/login"
                className="rounded-md border border-white/80 px-4 py-2 font-semibold text-white transition hover:bg-white/10"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
