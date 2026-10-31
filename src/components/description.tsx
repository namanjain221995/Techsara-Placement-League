"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * R-PLAYER-03/04 (client 01:22–01:52, 02:49–03:05): the description is shown exactly as typed —
 * numbered points stay numbered, bullets stay bullets, new lines stay new lines — and the box
 * grows with the text instead of truncating it.
 */
export function Description({ text, className, empty = "No description yet." }: { text: string; className?: string; empty?: string }) {
  if (!text.trim()) return <p className={cn("text-ink-400 italic", className)}>{empty}</p>;
  return <div className={cn("description-text leading-relaxed", className)}>{text}</div>;
}

/**
 * For the fixed-size projector stage: start large and shrink the font until the WHOLE text
 * fits its box — the full description is always visible, never cut off with "…".
 */
export function AutoFitDescription({ text, maxPx = 30, minPx = 13, className }: { text: string; maxPx?: number; minPx?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(maxPx);

  useLayoutEffect(() => {
    const el = box.current;
    const content = inner.current;
    if (!el || !content) return;
    const fit = () => {
      let lo = minPx;
      let hi = maxPx;
      // binary search the largest font size that fits
      for (let i = 0; i < 9; i++) {
        const mid = (lo + hi) / 2;
        content.style.fontSize = `${mid}px`;
        if (content.scrollHeight <= el.clientHeight + 1 && content.scrollWidth <= el.clientWidth + 1) lo = mid;
        else hi = mid;
      }
      content.style.fontSize = `${lo}px`;
      setSize(lo);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, maxPx, minPx]);

  return (
    <div ref={box} className={cn("relative min-h-0 overflow-hidden", className)}>
      <div ref={inner} className="description-text leading-snug" style={{ fontSize: size }} data-testid="display-description">
        {text.trim() ? text : "—"}
      </div>
    </div>
  );
}
