/**
 * Header Actions — server-side bell + locale + command palette bundle.
 *
 * Onside is dark-mode only (forced theme); no theme toggle.
 *
 * Server component — auth.getUser + notifications fetch sunucuda (initial render
 * için), sonra bell client'ta realtime subscribe olur.
 */

import { createClient } from "@/lib/supabase/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { CommandPalette } from "@/components/command-palette";
import { NotificationBell } from "@/components/notification/notification-bell";
import { getNotificationsAction } from "@/lib/notification/actions";

export async function HeaderActions() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initialItems: Awaited<ReturnType<typeof getNotificationsAction>> = {
    ok: true,
    data: [],
  };
  if (user) {
    initialItems = await getNotificationsAction(30);
  }

  return (
    <div className="flex items-center gap-1">
      <CommandPalette isAuthed={!!user} />
      {user && initialItems.ok && (
        <NotificationBell initialItems={initialItems.data} myUserId={user.id} />
      )}
      <LocaleSwitcher />
    </div>
  );
}
