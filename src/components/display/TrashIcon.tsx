import type { SVGProps } from "react";
import { TRASH_ICON_PATH, TRASH_ICON_SIZE } from "./trashIconGeometry";

type TrashIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

export function TrashIcon({ size = 14, ...props }: TrashIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${TRASH_ICON_SIZE} ${TRASH_ICON_SIZE}`}
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={TRASH_ICON_PATH} fillRule="evenodd" />
    </svg>
  );
}
