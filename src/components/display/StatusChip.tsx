import { Badge, type BadgeProps } from "./Badge";

export type StatusChipProps = BadgeProps & {
  /** Opt in only for a status whose changes need a live announcement. */
  announce?: boolean;
};

export function StatusChip({ announce = false, showDot = true, ...props }: StatusChipProps) {
  return <Badge role={announce ? "status" : undefined} {...props} showDot={showDot} />;
}
