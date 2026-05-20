import {createFileRoute, Link} from "@tanstack/react-router";
import {Button} from "../components/ui/button";
import {useSession} from "../lib/auth";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const {data: session, isPending} = useSession();

  return (
    <div className="space-y-8">
      <section className="mx-auto flex min-h-[68vh] max-w-3xl flex-col justify-center text-center">
        <div className="space-y-5">
          <p className="text-xl font-bold text-accent">Welcome to Swamp Sync</p>
          <div className="space-y-3">
            <h1 className="text-4xl font-bold tracking-tight text-primary sm:text-6xl">
              Organize and sync up schedules.
            </h1>
            <p className="mx-auto max-w-2xl text-xl font-semibold text-muted-foreground">
              Find the best times to meet for studying, projects, clubs, and
              hangouts.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {isPending ? null : session ? (
              <Link to="/dashboard">
                <Button>Go to home</Button>
              </Link>
            ) : (
              <>
                <Link to="/signup">
                  <Button>Create account</Button>
                </Link>
                <Link to="/login">
                  <Button variant="outline">Sign in</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
