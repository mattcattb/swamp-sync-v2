import {cn} from "../../lib/cn";

export function Tabs({
  value,
  onValueChange,
  items,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: Array<{value: string; label: string; count?: number}>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-1 rounded-lg border border-border bg-surface-elevated p-1",
        className,
      )}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onValueChange(item.value)}
          className={cn(
            "rounded-md px-3 py-2 text-sm font-semibold transition",
            item.value === value
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/10"
              : "text-muted-foreground hover:bg-white hover:text-foreground",
          )}
        >
          {item.label}
          {item.count !== undefined ? (
            <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs">
              {item.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
