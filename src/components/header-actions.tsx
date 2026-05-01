/**
 * Header Actions — server-side bell + locale + theme bundle.
 *
 * Sayfa header'larında tekrarlanan "LocaleSwitcher + ThemeToggle" pattern'ini
 * tek noktaya çeker; ek olarak NotificationBell render eder (kullanıcı varsa).
 *
 * Server component — auth.getUser + notifications fetch sunucuda (initial render
 * için), sonra bell client'ta realtime subscribe olur.
 */

import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { NotificationBell } from "@/components/notification/notification-bell";
import { getNotificationsAction } from "@/lib/notification/actions";

export async function HeaderActions() {
  const tTheme = await getTranslations("Theme");

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
      {user && initialItems.ok && (
        <NotificationBell initialItems={initialItems.data} myUserId={user.id} />
      )}
      <LocaleSwitcher />
      <ThemeToggle label={tTheme("toggle")} />
    </div>
  );
}
