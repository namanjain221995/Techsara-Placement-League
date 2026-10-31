"use client";

import { MonitorX } from "lucide-react";
import { useParams } from "next/navigation";
import { LogoMark } from "@/components/brand";
import { DisplayStage } from "@/components/display/stage";
import { useLiveAuction } from "@/lib/live";

/**
 * Public live screen (projector / LED wall / spectators' phones). Read-only; no login.
 * R-DISPLAY-01 (client 03:45–04:11): "this link runs on the main screen; all the audience sees it".
 */
export default function DisplayPage() {
  const { slug } = useParams<{ slug: string }>();
  const { snapshot, conn, error, clockOffset } = useLiveAuction({ slug });

  if (error === "NOT_FOUND")
    return (
      <div className="stage-bg flex min-h-dvh flex-col items-center justify-center gap-4 text-center text-ink-200">
        <MonitorX className="size-14 text-loss-400" />
        <h1 className="font-display text-3xl tracking-wide text-white uppercase">Display link not found</h1>
        <p className="max-w-md text-sm">Check the link in the organizer console (Live screen button). The auction may have been deleted.</p>
      </div>
    );

  if (!snapshot)
    return (
      <div className="stage-bg flex min-h-dvh flex-col items-center justify-center gap-5">
        <LogoMark className="size-20 animate-pulse" />
        <p className="font-display text-xl tracking-[0.3em] text-ink-300 uppercase">Connecting to the auction…</p>
      </div>
    );

  return <DisplayStage snapshot={snapshot} conn={conn} clockOffset={clockOffset} />;
}
