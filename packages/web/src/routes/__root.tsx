import {createRootRoute, Link, Outlet, useLocation} from "@tanstack/react-router";
import {useState} from "react";
import {Button} from "../components/ui/button";
import {signOut, useSession} from "../lib/auth";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { data: session, isPending } = useSession();

  return (
    <div className="gator-shell min-h-screen">
      <header className="sticky top-0 z-40 border-b border-primary/10 bg-white/90 backdrop-blur">
        <div className="h-1.5 bg-accent" />
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-2xl font-extrabold tracking-tight text-primary">
            Swamp Sync
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            {isPending ? null : session ? (
              <ProfileMenu
                name={session.user.name ?? session.user.email}
                email={session.user.email}
              />
            ) : (
              <Link
                to="/login"
                className="rounded-md border border-primary/30 bg-white px-4 py-2 font-semibold text-primary transition hover:border-primary hover:bg-primary/10"
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

function ProfileMenu({name, email}: {name: string; email: string}) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";

  const items = [
    {to: "/dashboard" as const, label: "Home"},
    {to: "/schedule" as const, label: "Schedule"},
    {to: "/meetings/new" as const, label: "New meeting"},
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex items-center gap-2 rounded-full border border-primary/20 bg-white px-2 py-1.5 text-left shadow-sm shadow-primary/5 transition hover:border-primary"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
          {initials}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-40 truncate text-sm font-bold text-primary">
            {name}
          </span>
          <span className="block max-w-40 truncate text-xs text-muted-foreground">
            {email}
          </span>
        </span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-border bg-white p-2 shadow-lg shadow-primary/10">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-extrabold text-primary">
              {name}
            </div>
            <div className="truncate text-xs text-muted-foreground">{email}</div>
          </div>
          <div className="my-1 h-px bg-border" />
          <div className="grid gap-1">
            {items.map((item) => {
              const isSelected =
                item.to === "/dashboard"
                  ? location.pathname === item.to ||
                    (location.pathname.startsWith("/meetings/") &&
                      location.pathname !== "/meetings/new")
                  : item.to === "/meetings/new"
                    ? location.pathname === item.to
                  : location.pathname.startsWith(item.to);

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsOpen(false)}
                  className={[
                    "rounded-md px-3 py-2 text-sm font-semibold transition",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="my-1 h-px bg-border" />
          <Button
            variant="ghost"
            className="w-full justify-start text-danger hover:bg-danger/10"
            onClick={() => {
              setIsOpen(false);
              signOut();
            }}
          >
            Sign out
          </Button>
        </div>
      ) : null}
    </div>
  );
}
