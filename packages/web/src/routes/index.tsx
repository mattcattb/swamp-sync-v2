import {createFileRoute, Link, Navigate} from "@tanstack/react-router";
import {Button} from "../components/ui/button";
import {useSession} from "../lib/auth";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const {data: session, isPending} = useSession();

  if (!isPending && session) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-10">
      <section className="grid min-h-[calc(100vh-9rem)] items-center gap-10 py-8 md:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <p className="gator-kicker">Welcome to Swamp Sync</p>
          <div className="space-y-4">
            <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.02] tracking-tight text-primary sm:text-6xl">
              Organize and sync up schedules.
            </h1>
            <p className="max-w-2xl text-xl font-semibold leading-8 text-muted-foreground">
              Find the best times to meet for studying, projects, clubs, and
              hangouts.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {isPending ? null : (
              <>
                <Button asChild variant="secondary" effect="sheen">
                  <Link to="/signup">Create account</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/login">Sign in</Link>
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="blueprint-panel rounded-lg p-5 text-white">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">
                Weekly fit
              </p>
              <h2 className="text-2xl font-extrabold">Project sync</h2>
            </div>
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold">
              4 matches
            </span>
          </div>
          <div className="grid gap-2">
            {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, index) => (
              <div key={day} className="grid grid-cols-[44px_1fr] items-center gap-3">
                <span className="text-sm font-bold text-white/70">{day}</span>
                <div className="h-10 rounded-md bg-white/10 p-1">
                  <div
                    className="h-full rounded bg-white"
                    style={{width: `${index % 2 === 0 ? 68 : 42}%`}}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-md border border-white/15 bg-white/10 p-4">
            <p className="text-sm font-semibold text-white/70">Best time</p>
            <p className="text-xl font-extrabold">Wednesday, 2:30 PM</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 pb-8 sm:grid-cols-3">
        {[
          ["Schedule", "Block out classes, work, and recurring commitments."],
          ["Invite", "Bring registered teammates into one meeting workspace."],
          ["Choose", "Compare suggested times from everyone’s availability."],
        ].map(([title, copy]) => (
          <div key={title} className="rounded-lg border border-border bg-white p-4 shadow-sm shadow-primary/5">
            <h2 className="text-base font-extrabold text-primary">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
