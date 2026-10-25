import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const tones = {
  info: "border-info/30 bg-info-bg text-info",
  warning: "border-warning/30 bg-warning-bg text-warning",
  danger: "border-danger/30 bg-danger-bg text-danger",
  success: "border-success/30 bg-success-bg text-success",
} as const;

export function Alert({
  tone = "info",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: keyof typeof tones }) {
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn("rounded-md border p-3 text-sm", tones[tone], className)}
      {...props}
    />
  );
}
