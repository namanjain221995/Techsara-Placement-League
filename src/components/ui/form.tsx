"use client";

import { cloneElement, forwardRef, isValidElement, useEffect, useId, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/cn";

const fieldBase =
  "w-full rounded-xl bg-ink-850 px-3.5 text-sm text-ink-50 ring-1 ring-ink-600 placeholder:text-ink-400 transition focus:outline-none focus:ring-2 focus:ring-gold-500/70 disabled:opacity-50 aria-[invalid=true]:ring-loss-500";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(fieldBase, "h-10", className)} {...p} />;
});

/** Textarea that grows with its content (R-PLAYER-03 "flex box"), never clipping what was typed. */
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }>(function Textarea(
  { className, minRows = 4, onInput, ...p },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current!);
  const resize = () => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useEffect(resize, [p.value]);
  return (
    <textarea
      ref={inner}
      rows={minRows}
      className={cn(fieldBase, "resize-y py-2.5 leading-relaxed", className)}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      {...p}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select
      ref={ref}
      className={cn(fieldBase, "h-10 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a98c0' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...p}
    >
      {children}
    </select>
  );
});

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-xs font-semibold tracking-wide text-ink-300 uppercase", className)} {...p} />;
}

/** Label + control + hint/error. A single child control is linked to its label automatically. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const auto = useId();
  let control = children;
  let target = htmlFor;
  if (!target && isValidElement<{ id?: string }>(children)) {
    target = children.props.id ?? auto;
    if (!children.props.id) control = cloneElement(children, { id: auto });
  }
  return (
    <div className={className}>
      <Label htmlFor={target}>{label}</Label>
      {control}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-loss-400" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50", checked ? "bg-gold-500" : "bg-ink-600")}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition", checked ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

/** Amount input in MILLIONS with the currency prefix and an "M" suffix. */
export const MoneyInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { symbol?: string }>(function MoneyInput(
  { symbol = "$", className, ...p },
  ref,
) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm font-semibold text-gold-400">{symbol}</span>
      <input ref={ref} inputMode="decimal" className={cn(fieldBase, "h-10 pr-9 pl-8 tabular-nums", className)} {...p} />
      <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm font-semibold text-ink-300">M</span>
    </div>
  );
});
