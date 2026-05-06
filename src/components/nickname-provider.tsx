"use client";

import * as React from "react";
import { isValidNickname } from "@/lib/validation/nickname";

const STORAGE_KEY = "onside.nickname";

type Ctx = {
  /** null until the user has typed one. */
  nickname: string | null;
  /** Persists to localStorage; rejects invalid input. */
  setNickname: (next: string) => void;
  /** Wipes localStorage and resets state. */
  clearNickname: () => void;
  /** Whether the initial localStorage read has finished. */
  hydrated: boolean;
};

const Context = React.createContext<Ctx | null>(null);

/**
 * Holds the inline nickname for the current browser session. The nickname is
 * remembered in localStorage so the user only has to type it once per device,
 * but a "switch nickname" link in the header can clear it.
 *
 * No security significance — anyone can type any string. Identity is purely
 * UX convenience; uniqueness is per-event-row, not global.
 */
export function NicknameProvider({ children }: { children: React.ReactNode }) {
  const [nickname, setNicknameState] = React.useState<string | null>(null);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && isValidNickname(stored)) {
        setNicknameState(stored.trim());
      }
    } catch {
      // private mode / storage disabled — works without persistence.
    }
    setHydrated(true);
  }, []);

  const setNickname = React.useCallback((next: string) => {
    const trimmed = next.trim();
    if (!isValidNickname(trimmed)) return;
    setNicknameState(trimmed);
    try {
      window.localStorage.setItem(STORAGE_KEY, trimmed);
    } catch {
      /* ignore */
    }
  }, []);

  const clearNickname = React.useCallback(() => {
    setNicknameState(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = React.useMemo(
    () => ({ nickname, setNickname, clearNickname, hydrated }),
    [nickname, setNickname, clearNickname, hydrated],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useNickname(): Ctx {
  const ctx = React.useContext(Context);
  if (!ctx) {
    throw new Error("useNickname must be used inside <NicknameProvider>");
  }
  return ctx;
}
