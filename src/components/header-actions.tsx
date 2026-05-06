/**
 * Header Actions — locale switcher + command palette bundle.
 *
 * Auth has been removed from the project; the command palette no longer
 * shows auth-only items, so this is a pure server-rendered shell.
 */

import { LocaleSwitcher } from "@/components/locale-switcher";
import { CommandPalette } from "@/components/command-palette";

export function HeaderActions() {
  return (
    <div className="flex items-center gap-1">
      <CommandPalette />
      <LocaleSwitcher />
    </div>
  );
}
