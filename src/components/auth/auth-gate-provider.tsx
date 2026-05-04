"use client";

import * as React from "react";
import { JoinModal } from "@/components/auth/join-modal";

type AuthGateContext = {
  /** Open the join/sign-in modal (no-op if user already has a profile). */
  requireAuth: () => void;
  /** Whether the modal is currently open. */
  isOpen: boolean;
  /** Close the modal explicitly (e.g. user dismissed). */
  close: () => void;
};

const Context = React.createContext<AuthGateContext | null>(null);

/**
 * Wraps the app with a single, lazily-shown JoinModal. Components anywhere
 * in the tree call `useAuthGate().requireAuth()` to surface it — typically
 * in click handlers for actions that need a profile (join match, create
 * match, open profile page, etc.).
 *
 * The modal is not auto-opened on page load; the previous "you must
 * onboard before you see anything" gate has been removed deliberately
 * to allow anonymous browsing.
 */
export function AuthGateProvider({
  children,
  hasProfile,
}: {
  children: React.ReactNode;
  /**
   * Pre-computed on the server: true when the visitor already has a row
   * in `profile`. When true, requireAuth() short-circuits — the user is
   * already onboarded and the action can proceed immediately.
   */
  hasProfile: boolean;
}) {
  const [isOpen, setIsOpen] = React.useState(false);

  const requireAuth = React.useCallback(() => {
    if (hasProfile) return;
    setIsOpen(true);
  }, [hasProfile]);

  const close = React.useCallback(() => setIsOpen(false), []);

  const value = React.useMemo(
    () => ({ requireAuth, isOpen, close }),
    [requireAuth, isOpen, close],
  );

  return (
    <Context.Provider value={value}>
      {children}
      <JoinModal open={isOpen} onClose={close} />
    </Context.Provider>
  );
}

export function useAuthGate(): AuthGateContext {
  const ctx = React.useContext(Context);
  if (!ctx) {
    throw new Error("useAuthGate must be used inside <AuthGateProvider>");
  }
  return ctx;
}
