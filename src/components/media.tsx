"use client";

import { useState } from "react";
import { cn, initials, onColor } from "@/lib/cn";

function hueOf(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Candidate photo, or an original generated portrait (silhouette + initials) when none is uploaded. */
export function PlayerPhoto({ name, url, className, rounded = "rounded-2xl" }: { name: string; url: string | null; className?: string; rounded?: string }) {
  const [broken, setBroken] = useState(false);
  const hue = hueOf(name);
  if (url && !broken)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={name} onError={() => setBroken(true)} className={cn("object-cover object-top", rounded, className)} draggable={false} />
    );
  return (
    <div
      className={cn("relative overflow-hidden", rounded, className)}
      style={{ background: `linear-gradient(160deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 65% 28%))`, containerType: "size" }}
      role="img"
      aria-label={name}
    >
      <svg viewBox="0 0 100 120" className="absolute inset-x-0 bottom-0 h-[88%] w-full opacity-25" aria-hidden preserveAspectRatio="xMidYMax meet">
        <circle cx="50" cy="42" r="22" fill="#fff" />
        <path d="M8 120c3-27 20-42 42-42s39 15 42 42z" fill="#fff" />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-display font-semibold text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]"
        style={{ fontSize: "36cqmin" }}
      >
        {initials(name)}
      </span>
    </div>
  );
}

/** Team logo, or a monogram badge in the team's colour. */
export function TeamLogo({ team, className }: { team: { name: string; shortName: string; color: string; logoUrl: string | null }; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-white/15", className ?? "size-10")}
      style={{ background: `linear-gradient(150deg, ${team.color}, color-mix(in oklab, ${team.color} 55%, #000))`, containerType: "size" }}
    >
      {team.logoUrl && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logoUrl} alt={team.name} onError={() => setBroken(true)} className="size-full object-contain p-[8%]" draggable={false} />
      ) : (
        <span className="font-display leading-none font-bold tracking-wide" style={{ color: onColor(team.color), fontSize: "34cqmin" }}>
          {team.shortName}
        </span>
      )}
    </span>
  );
}
