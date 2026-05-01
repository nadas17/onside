/**
 * Empty State — Phase 9 polish (Ive: "her boş durum dolu durum kadar düşünülmüş olmalı").
 *
 * Tek bir empty primitive: ortalanmış ikon + başlık + alt metin + opsiyonel CTA.
 * Tüm boş ekranlar bu bileşeni kullanır → tutarlı mood ve tek bir tasarım kararı.
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
        "border-border/70 flex flex-col items-center gap-3 rounded-md border border-dashed text-center",
        size === "sm" ? "px-4 py-6" : "px-6 py-10",
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden
          className={cn(
            "bg-brand/8 text-brand flex items-center justify-center rounded-full",
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
