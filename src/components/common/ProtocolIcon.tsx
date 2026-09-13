import { cn } from "cn";

import { protocolMark } from "@/lib/brand-marks";

interface ProtocolIconProps {
  /** Wire protocol name; an unknown family renders nothing. */
  family: string;
}

/**
 * The mark of a protocol family, drawn in the colour the family is read by
 * wherever it appears. Colour carries the family's identity rather than the
 * glyph: the two OpenAI families share one mark, and only their colours — the
 * classic GPT green and the OSS blue — tell a reader which is meant. The
 * family's name always stands beside the mark, so the glyph stays out of the
 * accessibility tree.
 */
export function ProtocolIcon({ family }: ProtocolIconProps) {
  const mark = protocolMark(family);
  if (mark === undefined) {
    return null;
  }
  const { Icon, tone } = mark;
  return (
    <Icon
      aria-hidden="true"
      className={cn("pointer-events-none size-3.5 shrink-0", tone)}
    />
  );
}
