"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useErrorMessage } from "@/lib/i18n-errors";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Save, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitScoreAction, editScoreAction } from "@/lib/event/result-actions";
import { useNickname } from "@/components/nickname-provider";
import { NicknameDialog } from "@/components/nickname-dialog";

const schema = z.object({
  scoreA: z.coerce.number().int().min(0).max(30),
  scoreB: z.coerce.number().int().min(0).max(30),
  notes: z.string().max(500).optional(),
});

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export function ScoreSubmitForm({
  eventId,
  mode,
  initialScoreA = 0,
  initialScoreB = 0,
  initialNotes = "",
  onSaved,
  onCancel,
}: {
  eventId: string;
  mode: "submit" | "edit";
  initialScoreA?: number;
  initialScoreB?: number;
  initialNotes?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Result");
  const tNick = useTranslations("Nickname");
  const errorMsg = useErrorMessage();
  const { nickname, setNickname } = useNickname();
  const [nicknameDialogOpen, setNicknameDialogOpen] = React.useState(false);
  const pendingValuesRef = React.useRef<FormOutput | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      scoreA: initialScoreA,
      scoreB: initialScoreB,
      notes: initialNotes,
    },
  });

  const persistScore = async (values: FormOutput, submitter: string) => {
    const result =
      mode === "submit"
        ? await submitScoreAction(
            eventId,
            values.scoreA,
            values.scoreB,
            submitter,
            values.notes,
          )
        : await editScoreAction(
            eventId,
            values.scoreA,
            values.scoreB,
            values.notes,
          );
    if (!result.ok) {
      toast.error(t("submitError"), { description: errorMsg(result) });
      return;
    }
    toast.success(mode === "submit" ? t("submitted") : t("edited"));
    onSaved();
  };

  const onSubmit = async (values: FormOutput) => {
    if (mode === "submit" && !nickname) {
      pendingValuesRef.current = values;
      setNicknameDialogOpen(true);
      return;
    }
    await persistScore(values, nickname ?? "unknown");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Trophy className="size-4" />
        {mode === "submit" ? t("submitTitle") : t("editTitle")}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div>
          <Label htmlFor="scoreA">{t("teamA")}</Label>
          <Input
            id="scoreA"
            type="number"
            min={0}
            max={30}
            step={1}
            {...register("scoreA")}
          />
          {errors.scoreA && (
            <p className="text-destructive mt-1 text-xs">
              {errors.scoreA.message}
            </p>
          )}
        </div>
        <div className="text-muted-foreground self-end pb-2 text-center text-lg font-bold">
          –
        </div>
        <div>
          <Label htmlFor="scoreB">{t("teamB")}</Label>
          <Input
            id="scoreB"
            type="number"
            min={0}
            max={30}
            step={1}
            {...register("scoreB")}
          />
          {errors.scoreB && (
            <p className="text-destructive mt-1 text-xs">
              {errors.scoreB.message}
            </p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="notes">{t("notes")}</Label>
        <Input
          id="notes"
          placeholder={t("notesPlaceholder")}
          {...register("notes")}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          <X className="mr-1 size-3.5" />
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          <Save className="mr-1 size-3.5" />
          {isSubmitting
            ? t("saving")
            : mode === "submit"
              ? t("submit")
              : t("save")}
        </Button>
      </div>

      <NicknameDialog
        open={nicknameDialogOpen}
        defaultValue={nickname ?? ""}
        onOpenChange={setNicknameDialogOpen}
        onSubmit={(next) => {
          setNickname(next);
          setNicknameDialogOpen(false);
          if (pendingValuesRef.current) {
            const values = pendingValuesRef.current;
            pendingValuesRef.current = null;
            persistScore(values, next).catch(() => {
              /* error already toasted */
            });
          }
        }}
      />
      <NicknameHelpText label={tNick("description")} />
    </form>
  );
}

function NicknameHelpText({ label }: { label: string }) {
  // Hidden helper to keep the i18n key referenced; we don't render it visibly.
  void label;
  return null;
}
