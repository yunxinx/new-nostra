import { cn } from "cn";

import { vendorMark } from "@/lib/brand-marks";

interface VendorIconProps {
  /** The preset the provider answers to; null and unknown ids render nothing. */
  presetId: null | string;
}

/**
 * The mark of a built-in vendor, drawn in that vendor's colour at the 16px
 * square every surface that names a vendor gives it. The name itself is always
 * spelled out beside the mark, so the glyph stays out of the accessibility
 * tree; `pointer-events-none` is what keeps the library's own `<title>` from
 * raising a second, native tooltip next to the app's.
 */
export function VendorIcon({ presetId }: VendorIconProps) {
  const mark = vendorMark(presetId);
  if (mark === undefined) {
    return null;
  }
  const { Icon, tone } = mark;
  return (
    <Icon
      aria-hidden="true"
      className={cn("pointer-events-none size-4 shrink-0", tone)}
    />
  );
}
