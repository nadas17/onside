"use client";

import { Button } from "@/components/ui/button";
import { useAuthGate } from "@/components/auth/auth-gate-provider";

/**
 * Header CTA shown to anonymous browsers. Click opens the JoinModal via
 * AuthGateProvider — same flow as the join-button on event pages, but
 * triggered explicitly from the chrome instead of an action.
 */
export function SignInCTA({ label }: { label: string }) {
  const { requireAuth } = useAuthGate();
  return (
    <Button
      type="button"
      size="sm"
      variant="default"
      onClick={requireAuth}
      className="h-9 px-3 text-sm"
    >
      {label}
    </Button>
  );
}
