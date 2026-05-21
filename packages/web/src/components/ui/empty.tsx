import * as React from "react";
import {cn} from "../../lib/cn";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border bg-surface-elevated px-4 py-6 text-center",
        className,
      )}
    >
      <div className="mx-auto mb-3 h-2 w-14 rounded-full bg-accent" />
      <h3 className="font-extrabold text-primary">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
