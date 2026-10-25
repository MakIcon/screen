import type { ReactNode } from "react";
import { Button, type ButtonProps } from "./Button";

export type IconButtonProps = Omit<ButtonProps, "icon" | "iconOnly" | "children"> & {
  "aria-label": string;
  children: ReactNode;
};

export function IconButton({ children, ...props }: IconButtonProps) {
  return <Button {...props} icon={children} iconOnly />;
}
