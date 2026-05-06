/**
 * Header Actions — locale switcher + command palette bundle.
 *
 * Notifications/bell removed alongside the profile-stats deferred features.
 * Auth-gate (isAuthed) plumbing is still here so the command palette can
 * keep its sign-in-only items working until commit 4 strips auth entirely.
 */

import { createClient } from "@/lib/supabase/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { CommandPalette } from "@/components/command-palette";

export async function HeaderActions() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex items-center gap-1">
      <CommandPalette isAuthed={!!user} />
      <LocaleSwitcher />
    </div>
  );
}
