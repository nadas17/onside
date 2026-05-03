/**
 * Empty State — single primitive for "no data" surfaces.
 *
 * Provides a consistent: glass-dashed card + brand-tinted circular icon +
 * heading + description + optional CTA. Callers should pass the icon as an
 * unsized lucide component (e.g. `<Filter />`) — EmptyState scales it via
 * a wrapping `[&_svg]:size-5` rule, so all empty states share the same
 * icon footprint. This intentionally differs from the app-wide `size-4`
 * default since the icon sits inside a larger container (size-9/12) and
 * needs a touch more visual weight.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "md",
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "glass-card flex flex-col items-center gap-3 rounded-lg border border-dashed text-center",
        size === "sm" ? "px-4 py-6" : "px-6 py-10",
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden
          className={cn(
            "bg-brand/8 text-brand empty-pop flex items-center justify-center rounded-full motion-reduce:animate-none [&_svg]:size-5",
            size === "sm" ? "size-9" : "size-12",
          )}
        >
          {icon}
        </span>
      )}
      <h3
        className={cn(
          "text-foreground font-semibold tracking-tight",
          size === "sm" ? "text-sm" : "text-base",
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            "text-muted-foreground max-w-prose",
            size === "sm" ? "text-xs" : "text-sm",
          )}
        >
          {description}
        </p>
      )}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
