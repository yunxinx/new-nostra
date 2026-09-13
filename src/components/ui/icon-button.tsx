import type { ComponentProps } from "react";

import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type IconButtonProps = Omit<
  ComponentProps<typeof Button>,
  "aria-label" | "size"
> & {
  "aria-label": string;
  size?: "icon" | "icon-lg" | "icon-sm" | "icon-xs";
};

function IconButton({
  "aria-label": label,
  size = "icon-xs",
  type = "button",
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          {...props}
          aria-label={label}
          size={size}
          type={type}
          variant={variant}
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export { IconButton };
