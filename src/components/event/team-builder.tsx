"use client";

/**
 * Team Builder — drag-drop manuel override.
 *
 * Re-balance veya bir oyuncuyu A↔B taşımak için. @dnd-kit/sortable + DragOverlay.
 * "Kaydet" tuşunda saveTeamsAction çağrılır → DB persist.
 *
 * Pozisyon değiştirme YOK — sadece team A↔B swap (pozisyon profile preferred'a
 * yakın algoritma tarafından zaten optimize ediliyor; manuel pozisyon override
 * Phase 9'a ertelendi).
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  saveTeamsAction,
  type ComputedTeam,
  type TeamView,
} from "@/lib/event/team-actions";

type Position = "GK" | "DEF" | "MID" | "FWD";

type DragItem = {
  profileId: string;
  username: string;
  displayName: string;
  position: Position;
  skillRating: number;
  team: "A" | "B";
};

export function TeamBuilder({
  eventId,
  initialTeams,
  seed,
  onCancel,
  onSaved,
}: {
  eventId: string;
  initialTeams: TeamView[];
  seed: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("Teams");

  const [items, setItems] = React.useState<DragItem[]>(() =>
    initialTeams.flatMap((team) =>
      team.members.map((m) => ({
        profileId: m.profileId,
        username: m.username,
        displayName: m.displayName,
        position: m.position,
        skillRating: m.skillRating,
        team: team.label,
      })),
    ),
  );
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
  );

  const teamA = React.useMemo(
    () => items.filter((i) => i.team === "A"),
    [items],
  );
  const teamB = React.useMemo(
    () => items.filter((i) => i.team === "B"),
    [items],
  );

  const skillTotal = (group: DragItem[]) =>
    group.reduce((s, i) => s + i.skillRating, 0);

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    // over.id ya bir item profileId'sidir ya da kolon ID ('team-A' / 'team-B')
    const sourceItem = items.find((i) => i.profileId === activeIdStr);
    if (!sourceItem) return;

    let targetTeam: "A" | "B" = sourceItem.team;
    let targetIndex: number | null = null;

    if (overIdStr === "team-A" || overIdStr === "team-B") {
      targetTeam = overIdStr === "team-A" ? "A" : "B";
    } else {
      const overItem = items.find((i) => i.profileId === overIdStr);
      if (overItem) {
        targetTeam = overItem.team;
      }
    }

    setItems((prev) => {
      // Source item'ı kaldır
      const without = prev.filter((i) => i.profileId !== activeIdStr);
      const teamGroup = without.filter((i) => i.team === targetTeam);
      const otherGroup = without.filter((i) => i.team !== targetTeam);

      // Hedef konumu bul
      if (overIdStr !== "team-A" && overIdStr !== "team-B") {
        const idx = teamGroup.findIndex((i) => i.profileId === overIdStr);
        targetIndex = idx >= 0 ? idx : teamGroup.length;
      } else {
        targetIndex = teamGroup.length;
      }

      const inserted = [...teamGroup];
      inserted.splice(targetIndex, 0, { ...sourceItem, team: targetTeam });

      // Reduce: order matters by team-A first then team-B (UI consistency)
      const newA =
        targetTeam === "A"
          ? inserted
          : otherGroup.filter((i) => i.team === "A");
      const newB =
        targetTeam === "B"
          ? inserted
          : otherGroup.filter((i) => i.team === "B");

      // Aynı takım içinde sıralama swap (sortable)
      if (sourceItem.team === targetTeam) {
        const oldIdx = teamGroup.findIndex((i) => i.profileId === activeIdStr);
        const newIdx = targetIndex;
        if (oldIdx >= 0 && newIdx >= 0) {
          const sorted = arrayMove(teamGroup, oldIdx, newIdx);
          return targetTeam === "A"
            ? [...sorted, ...newB]
            : [...newA, ...sorted];
        }
      }

      return [...newA, ...newB];
    });
  };

  const handleSave = async () => {
    if (teamA.length === 0 || teamB.length === 0) {
      toast.error(t("emptyTeamError"));
      return;
    }
    setSaving(true);

    const teamsPayload: { teamA: ComputedTeam; teamB: ComputedTeam } = {
      teamA: {
        label: "A",
        skillTotal: skillTotal(teamA),
        members: teamA.map((p) => ({
          profileId: p.profileId,
          position: p.position,
          skillRating: p.skillRating,
        })),
      },
      teamB: {
        label: "B",
        skillTotal: skillTotal(teamB),
        members: teamB.map((p) => ({
          profileId: p.profileId,
          position: p.position,
          skillRating: p.skillRating,
        })),
      },
    };

    const result = await saveTeamsAction(eventId, teamsPayload, seed);
    setSaving(false);
    if (!result.ok) {
      toast.error(t("saveError"), { description: result.error });
      return;
    }
    toast.success(t("saved"));
    onSaved();
  };

  const activeItem = items.find((i) => i.profileId === activeId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">{t("dragHint")}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            <X className="mr-1 size-3.5" />
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || teamA.length === 0 || teamB.length === 0}
          >
            <Save className="mr-1 size-3.5" />
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TeamColumn
            id="team-A"
            label={t("teamA")}
            items={teamA}
            skillTotal={skillTotal(teamA)}
          />
          <TeamColumn
            id="team-B"
            label={t("teamB")}
            items={teamB}
            skillTotal={skillTotal(teamB)}
          />
        </div>
        <DragOverlay>
          {activeItem ? (
            <div className="border-border bg-background rounded-md border px-3 py-2 text-sm shadow-lg">
              {activeItem.displayName}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function TeamColumn({
  id,
  label,
  items,
  skillTotal,
}: {
  id: string;
  label: string;
  items: DragItem[];
  skillTotal: number;
}) {
  const ids = items.map((i) => i.profileId);
  return (
    <SortableContext id={id} items={ids} strategy={verticalListSortingStrategy}>
      <DroppableArea id={id} hasItems={items.length > 0}>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-semibold">{label}</span>
          <span className="text-muted-foreground text-xs">
            {items.length} · Σ {skillTotal}
          </span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {items.map((it) => (
            <SortableItem key={it.profileId} item={it} />
          ))}
        </ul>
      </DroppableArea>
    </SortableContext>
  );
}

function DroppableArea({
  id,
  children,
  hasItems,
}: {
  id: string;
  children: React.ReactNode;
  hasItems: boolean;
}) {
  // Boş kolon için droppable bir sortable item yerine kolon kendi droppable
  const { setNodeRef, attributes, listeners, transform, transition } =
    useSortable({ id, disabled: hasItems });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(!hasItems ? { ...attributes, ...listeners } : {})}
      className="border-border rounded-md border p-3"
      data-droppable={id}
    >
      {children}
    </div>
  );
}

function SortableItem({ item }: { item: DragItem }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.profileId });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="border-border bg-background flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-muted-foreground cursor-grab touch-none"
        aria-label="drag handle"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 font-mono text-[9px] uppercase">
        {item.position}
      </span>
      <span className="flex-1 truncate font-medium">{item.displayName}</span>
      <span className="text-muted-foreground text-xs">{item.skillRating}</span>
    </li>
  );
}
