/**
 * Header Actions — locale switcher only.
 *
 * Auth removed; the global command palette / search button removed by
 * request — too few destinations to justify a Cmd+K surface.
 */

import { LocaleSwitcher } from "@/components/locale-switcher";

export function HeaderActions() {
  return (
    <div className="flex items-center gap-1">
      <LocaleSwitcher />
    </div>
  );
}
