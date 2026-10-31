"use client";

import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-ink-950/75 backdrop-blur-sm data-[state=open]:animate-in" />
        <D.Content
          className={cn(
            "panel fixed top-1/2 left-1/2 z-50 flex max-h-[92dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden",
            width,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-ink-600/60 px-6 pt-5 pb-4">
            <div>
              <D.Title className="font-display text-xl font-semibold tracking-wide text-white uppercase">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-sm text-ink-300">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{String(title)}</D.Description>
              )}
            </div>
            <D.Close className="rounded-lg p-1.5 text-ink-300 hover:bg-ink-700 hover:text-white" aria-label="Close">
              <X className="size-5" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-600/60 bg-ink-850/60 px-6 py-4">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

interface ConfirmOptions {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary" | "success";
}
type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;
const ConfirmCtx = createContext<ConfirmFn>(async () => true);

/** Promise-based confirmation dialogs: `if (await confirm({...})) …` */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>(() => undefined);
  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<boolean>((r) => (resolver.current = r));
  }, []);
  const close = (v: boolean) => {
    resolver.current(v);
    setOpts(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Dialog
        open={!!opts}
        onOpenChange={(o) => !o && close(false)}
        title={opts?.title ?? ""}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant={opts?.tone ?? "primary"} onClick={() => close(true)} autoFocus>
              {opts?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        <div className="text-sm leading-relaxed text-ink-200">{opts?.body}</div>
      </Dialog>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);
