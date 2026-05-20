import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

export const buttonStyles = cva(
  [    "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-all",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-60",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        secondary:
          "bg-accent text-white hover:bg-accent/90 active:bg-accent/80",
        outline:
          "border border-primary text-primary hover:bg-primary/10",
        ghost: "text-foreground hover:bg-muted/60",
        danger:
          "bg-danger text-white hover:brightness-110 active:brightness-95",
        destructive:
          "bg-danger text-white hover:brightness-110 active:brightness-95",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
      effect: {
        none: "",
        glow: "btn-glow",
        sheen: "btn-sheen",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      effect: "none",
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonStyles> & {
    asChild?: boolean;
  };
export function Button({
  className,
  variant,
  size,
  effect,
  asChild = false,
  type = "button",
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp      type={type}
      className={cn(buttonStyles({ variant, size, effect }), className)}
      {...props}
    />
  );
}
