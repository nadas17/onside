"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "sonner";

/**
 * Onside is dark-mode only. The image backgrounds + glass aesthetic are tuned
 * for dark — light mode would invert all the contrast assumptions.
 *
 * `forcedTheme="dark"` makes next-themes ignore system preference and any saved
 * theme cookie. Body always carries the `dark` class.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      forcedTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
      <Toaster richColors theme="dark" position="bottom-right" closeButton />
    </NextThemesProvider>
  );
}
