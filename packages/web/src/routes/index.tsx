import {createFileRoute, Link} from "@tanstack/react-router";
import {Button} from "../components/ui/button";
import {Card, CardContent} from "../components/ui/card";
import {ExampleFeature} from "../features/example/ExampleFeature";
import {useSession} from "../lib/auth";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const {data: session, isPending} = useSession();

  return (
    <div className="space-y-10">
      <section className="grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-center">
        <div className="space-y-5">
          <div className="inline-flex rounded-full border border-border bg-surface px-3 py-1 text-sm text-muted-foreground">
            Bun, Hono, React, Drizzle, Better Auth, Redis
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              swamp-sync-v2 starter
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              A small full-stack starter that keeps the boring setup wired so
              you can start building the actual product faster.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {isPending ? null : session ? (
              <Link to="/dashboard">
                <Button effect="glow">Go to dashboard</Button>
              </Link>
            ) : (
              <>
                <Link to="/signup">
                  <Button effect="glow">Create account</Button>
                </Link>
                <Link to="/login">
                  <Button variant="outline">Sign in</Button>
                </Link>
              </>
            )}
          </div>
        </div>

        <Card className="enter-rise">
          <CardContent className="space-y-4 p-6">
            <div className="text-sm text-muted-foreground">Stack overview</div>
            <ul className="space-y-2 text-sm">
              <li>Server: Bun + Hono</li>
              <li>Database: Postgres + Drizzle ORM</li>
              <li>Auth: Better Auth + Drizzle adapter</li>
              <li>Cache/WebSockets: Redis + WebSocket starter</li>
              <li>Web: React + TanStack Router + Tailwind</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <ExampleFeature />
    </div>
  );
}
