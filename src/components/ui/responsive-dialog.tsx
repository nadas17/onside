"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Drawer } from "vaul";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsDesktop } from "@/hooks/use-media-query";

/**
 * ResponsiveDialog — mobile-first modal primitive.
 *
 *   - Mobile (< 768px): renders as a Vaul bottom-sheet with drag-to-dismiss
 *     and iOS safe-area padding. Tap-to-dismiss outside, swipe down on the
 *     handle.
 *   - Desktop (≥ 768px): renders as a centered Radix Dialog with a backdrop
 *     blur, scaling enter/exit (tw-animate-css).
 *
 * Both modes share the same accessibility tree (Title + Description hooked
 * up via aria-labelledby / aria-describedby by their respective primitives).
 *
 * SSR-safe: renders nothing until mount completes to avoid hydration mismatch
 * (the viewport size is unknown server-side).
 */

type Mode = "desktop" | "mobile";
const ModeContext = React.createContext<Mode | null>(null);

function useMode(): Mode {
  const mode = React.useContext(ModeContext);
  if (!mode) {
    throw new Error(
      "ResponsiveDialog subcomponents must be used inside <ResponsiveDialog>",
    );
  }
  return mode;
}

interface RootProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Block dismiss (Esc, outside click, swipe down). For required flows. */
  dismissible?: boolean;
  children: React.ReactNode;
}

function ResponsiveDialog({
  open,
  onOpenChange,
  dismissible = true,
  children,
}: RootProps) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const isDesktop = useIsDesktop();

  if (!mounted) return null;

  const mode: Mode = isDesktop ? "desktop" : "mobile";

  return (
    <ModeContext.Provider value={mode}>
      {mode === "desktop" ? (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal>
          {children}
        </DialogPrimitive.Root>
      ) : (
        <Drawer.Root
          open={open}
          onOpenChange={onOpenChange}
          dismissible={dismissible}
        >
          {children}
        </Drawer.Root>
      )}
    </ModeContext.Provider>
  );
}

interface ContentProps {
  className?: string;
  children: React.ReactNode;
  hideCloseButton?: boolean;
  /** Desktop-only: prevent dismiss on Esc / outside click. Mirrors `dismissible` for Vaul. */
  blockDismiss?: boolean;
}

function ResponsiveDialogContent({
  className,
  children,
  hideCloseButton,
  blockDismiss,
}: ContentProps) {
  const mode = useMode();

  if (mode === "desktop") {
    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cn(
            "glass-strong data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-1/2 left-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border p-6 shadow-2xl shadow-black/40 duration-200",
            className,
          )}
          onPointerDownOutside={
            blockDismiss ? (e) => e.preventDefault() : undefined
          }
          onEscapeKeyDown={blockDismiss ? (e) => e.preventDefault() : undefined}
          onInteractOutside={
            blockDismiss ? (e) => e.preventDefault() : undefined
          }
        >
          {children}
          {!hideCloseButton && (
            <DialogPrimitive.Close className="ring-offset-background focus:ring-ring tap-target absolute top-3 right-3 inline-flex items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none">
              <X className="size-4" />
              <span className="sr-only">Kapat</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  }

  return (
    <Drawer.Portal>
      <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
      <Drawer.Content
        className={cn(
          "glass-strong pb-safe fixed right-0 bottom-0 left-0 z-50 mt-24 flex max-h-[92vh] flex-col rounded-t-2xl border-t shadow-2xl shadow-black/50 outline-none",
          className,
        )}
      >
        <div
          className="bg-muted-foreground/30 mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full"
          aria-hidden
        />
        {/* Keyboard-accessible close — drag-handle alone is touch-only.
            Hidden when blockDismiss to keep parity with desktop close suppression. */}
        {!hideCloseButton && (
          <Drawer.Close className="ring-offset-background focus:ring-ring tap-target absolute top-3 right-3 inline-flex items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none">
            <X className="size-4" aria-hidden />
            <span className="sr-only">Kapat</span>
          </Drawer.Close>
        )}
        <div className="overflow-y-auto overscroll-contain px-6 pt-4 pb-6">
          {children}
        </div>
      </Drawer.Content>
    </Drawer.Portal>
  );
}

function ResponsiveDialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  const mode = useMode();
  if (mode === "desktop") {
    return (
      <DialogPrimitive.Title
        className={cn(
          "text-lg leading-none font-semibold tracking-tight",
          className,
        )}
        {...props}
      />
    );
  }
  return (
    <Drawer.Title
      className={cn(
        "text-lg leading-none font-semibold tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

function ResponsiveDialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const mode = useMode();
  if (mode === "desktop") {
    return (
      <DialogPrimitive.Description
        className={cn("text-muted-foreground text-sm", className)}
        {...props}
      />
    );
  }
  return (
    <Drawer.Description
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function ResponsiveDialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col space-y-1.5 text-center sm:text-left",
        className,
      )}
      {...props}
    />
  );
}

function ResponsiveDialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
};
