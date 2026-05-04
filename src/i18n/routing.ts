import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["tr", "en", "pl"],
  defaultLocale: "pl",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
