"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "halisaha:geolocation-decision";

type Decision = "granted" | "denied" | null;

export type GeolocationResult = {
  decision: Decision;
  position: { lat: number; lng: number } | null;
};

export function useGeolocationDecision(): {
  result: GeolocationResult;
  showPrompt: boolean;
  request: () => void;
  decline: () => void;
} {
  const [result, setResult] = React.useState<GeolocationResult>({
    decision: null,
    position: null,
  });
  const [showPrompt, setShowPrompt] = React.useState(false);

  const requestPosition = React.useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setResult({ decision: "denied", position: null });
      window.localStorage.setItem(STORAGE_KEY, "denied");
      setShowPrompt(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setResult({
          decision: "granted",
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        });
        window.localStorage.setItem(STORAGE_KEY, "granted");
        setShowPrompt(false);
      },
      () => {
        setResult({ decision: "denied", position: null });
        window.localStorage.setItem(STORAGE_KEY, "denied");
        setShowPrompt(false);
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 10_000 },
    );
  }, []);

  const decline = React.useCallback(() => {
    setResult({ decision: "denied", position: null });
    window.localStorage.setItem(STORAGE_KEY, "denied");
    setShowPrompt(false);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "denied") {
      setResult({ decision: "denied", position: null });
      return;
    }
    if (saved === "granted") {
      requestPosition();
      return;
    }
    setShowPrompt(true);
  }, [requestPosition]);

  return { result, showPrompt, request: requestPosition, decline };
}

export function GeolocationPrompt({
  open,
  onAllow,
  onDeny,
}: {
  open: boolean;
  onAllow: () => void;
  onDeny: () => void;
}) {
  const t = useTranslations("Geolocation");

  return (
    <Dialog open={open}>
      <DialogContent
        hideCloseButton
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-sm"
      >
        <DialogHeader>
          <div className="bg-brand/10 text-brand mx-auto flex size-12 items-center justify-center rounded-full">
            <MapPin className="size-6" />
          </div>
          <DialogTitle className="text-center">{t("title")}</DialogTitle>
          <DialogDescription className="text-center">
            {t("description")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={onAllow} size="lg" className="w-full">
            {t("allow")}
          </Button>
          <Button onClick={onDeny} variant="ghost" size="lg" className="w-full">
            {t("deny")}
          </Button>
        </DialogFooter>
        <p className="text-muted-foreground text-center text-xs">{t("note")}</p>
      </DialogContent>
    </Dialog>
  );
}
