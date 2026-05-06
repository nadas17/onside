"use client";

import * as React from "react";
import { NicknameDialog } from "@/components/nickname-dialog";
import { useNickname } from "@/components/nickname-provider";

/**
 * Mounts at the top of the event detail page. The first time a visitor
 * lands on a match (no nickname in localStorage yet) the dialog pops up
 * once so the chat / RSVP / team / score flows all run on a single,
 * intentionally chosen nickname rather than picking up a placeholder
 * from whichever surface the user happened to interact with first.
 *
 * After the user picks a nickname (or dismisses), this component goes
 * dormant — they can still change names via the inline link in the chat
 * header.
 */
export function EventNicknameGate() {
  const { nickname, setNickname, hydrated } = useNickname();
  const [open, setOpen] = React.useState(false);
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    if (!hydrated || shown) return;
    if (!nickname) {
      setOpen(true);
      setShown(true);
    }
  }, [hydrated, nickname, shown]);

  return (
    <NicknameDialog
      open={open}
      defaultValue={nickname ?? ""}
      onOpenChange={setOpen}
      onSubmit={(next) => {
        setNickname(next);
        setOpen(false);
      }}
    />
  );
}
