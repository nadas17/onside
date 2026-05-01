/**
 * Event lifecycle state machine (spec §11).
 *
 *  draft → open ↔ full → locked → in_progress → completed
 *           ↓     ↓         ↓          ↓
 *          ────────── cancelled (her status'tan; cancelled → * yok) ────────
 *
 * MVP'de `draft` skip — etkinlik direkt 'open' yaratılır.
 */

export type EventStatus =
  | "draft"
  | "open"
  | "full"
  | "locked"
  | "in_progress"
  | "completed"
  | "cancelled";

const VALID_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ["open", "cancelled"],
  open: ["full", "locked", "cancelled"],
  full: ["open", "locked", "cancelled"],
  locked: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: EventStatus, to: EventStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/** Organizer event'in temel field'larını (title, venue, time, format, capacity) değiştirebilir mi. */
export function isOrganizerEditable(status: EventStatus): boolean {
  return status === "draft" || status === "open" || status === "full";
}

/** Etkinlik güncel olarak katılıma açık mı (RSVP butonu aktif olur mu). */
export function isJoinable(status: EventStatus): boolean {
  return status === "open";
}

/** Capacity yeniden hesaplandığında open ↔ full geçişi. */
export function recomputeCapacityStatus(
  current: EventStatus,
  confirmedCount: number,
  capacity: number,
): EventStatus {
  if (current === "open" && confirmedCount >= capacity) return "full";
  if (current === "full" && confirmedCount < capacity) return "open";
  return current;
}

/** Tarihi geçmiş etkinlikleri lazy şekilde uygun status'a iter (spec §11 edge cases). */
export function lazyTimeBasedStatus(
  current: EventStatus,
  startAt: Date,
  minPlayersMet: boolean,
  now: Date = new Date(),
): EventStatus {
  if (current === "locked" && now >= startAt) return "in_progress";
  if (
    (current === "open" || current === "full") &&
    now >= startAt &&
    !minPlayersMet
  ) {
    return "cancelled";
  }
  return current;
}
