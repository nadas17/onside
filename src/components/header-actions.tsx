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

  // Anonymous (signInAnonymously) sessions can't receive notifications —
  // nothing in the app emits to them and the realtime subscribe just spams
  // the console with CHANNEL_ERROR. Hide the bell until the account is
  // linked (e.g. via Google). The same `user.is_anonymous` flag drives
  // the "Link with Google" CTA on the profile page.
  const isLinkedUser = !!user && user.is_anonymous !== true;

  let initialItems: Awaited<ReturnType<typeof getNotificationsAction>> = {
    ok: true,
    data: [],
  };
  if (isLinkedUser) {
    initialItems = await getNotificationsAction(30);
  }

  return (
    <div className="flex items-center gap-1">
      <CommandPalette isAuthed={!!user} />
      {isLinkedUser && initialItems.ok && (
        <NotificationBell
          initialItems={initialItems.data}
          myUserId={user!.id}
        />
      )}
      <LocaleSwitcher />
    </div>
  );
}
