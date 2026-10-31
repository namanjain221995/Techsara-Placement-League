import { cn } from "@/lib/cn";

/** Original TPL mark: a shield (league) with a gavel-T monogram. No third-party branding. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-9", className)} aria-hidden>
      <defs>
        <linearGradient id="tpl-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset="1" stopColor="#d9951b" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0e1529" stroke="#33457a" strokeWidth="1.5" />
      <path d="M32 9l19 7v14c0 12-8 21-19 25C21 51 13 42 13 30V16l19-7z" fill="none" stroke="url(#tpl-gold)" strokeWidth="4" strokeLinejoin="round" />
      <path d="M22 28h20M32 28v16" stroke="url(#tpl-gold)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="leading-none">
        <span className="block font-display text-[15px] font-semibold tracking-[0.12em] text-white uppercase">TechSara</span>
        {!compact && <span className="block font-display text-[11px] tracking-[0.28em] text-gold-400 uppercase">Placement League</span>}
      </span>
    </span>
  );
}
