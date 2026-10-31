import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-150 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900 disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: "bg-gradient-to-b from-gold-400 to-gold-600 text-ink-950 shadow-[0_8px_24px_-10px_rgba(245,184,61,0.8)] hover:from-gold-300 hover:to-gold-500",
        secondary: "bg-ink-700 text-ink-100 ring-1 ring-ink-500/60 hover:bg-ink-600",
        ghost: "text-ink-200 hover:bg-ink-700/70 hover:text-white",
        outline: "ring-1 ring-ink-500 text-ink-100 hover:bg-ink-700/60",
        success: "bg-gradient-to-b from-win-400 to-win-500 text-ink-950 shadow-[0_8px_24px_-10px_rgba(34,197,94,0.8)] hover:brightness-110",
        danger: "bg-gradient-to-b from-loss-400 to-loss-500 text-white shadow-[0_8px_24px_-12px_rgba(239,68,68,0.8)] hover:brightness-110",
        volt: "bg-gradient-to-b from-volt-400 to-volt-600 text-white shadow-[0_8px_24px_-10px_rgba(59,130,246,0.8)] hover:brightness-110",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-base",
        xl: "h-16 px-7 text-lg tracking-wide",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export { buttonVariants };
