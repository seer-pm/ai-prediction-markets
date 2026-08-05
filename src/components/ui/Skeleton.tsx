import { cn } from "@/utils/cn";

interface SkeletonProps {
  className?: string;
  width?: number | string;
  height?: number | string;
}

export function Skeleton({ className, width, height = 10 }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={cn("block animate-pulse rounded-sm bg-rule", className)}
      style={{ width, height }}
    />
  );
}
