import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "default" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110 border-transparent",
  default: "bg-elevated border-line hover:bg-hover",
  ghost: "border-transparent hover:bg-hover",
  danger: "bg-danger text-white border-transparent hover:brightness-110",
};

export function Button({ variant = "default", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1 rounded border px-2.5 py-1 transition-[background-color,filter,transform] enabled:active:scale-[0.97] disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

export function IconButton({ className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-hover hover:text-fg active:bg-selected ${className}`}
      {...rest}
    />
  );
}
