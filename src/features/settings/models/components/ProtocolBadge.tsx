import type { Protocol } from "@/types/ipc";

import { ProtocolIcon } from "@/components/common/ProtocolIcon";
import { Badge } from "@/components/ui/badge";
import { protocolMark } from "@/lib/brand-marks";

interface ProtocolBadgeProps {
  /** Wire protocol name; an unknown family renders without a mark. */
  family: Protocol;
  /**
   * What names the family here — its abbreviation in a column, its full name
   * where a reader meets it once.
   */
  label: string;
}

/**
 * One protocol family as a pill: the family's mark, then its label, both in
 * the family's own colour on a wash of it. The colour is what tells the two
 * OpenAI families apart, so an unrecognised family keeps the plain outline
 * badge rather than borrowing a colour that reads as another family.
 */
export function ProtocolBadge({ family, label }: ProtocolBadgeProps) {
  const mark = protocolMark(family);
  if (mark === undefined) {
    return <Badge variant="outline">{label}</Badge>;
  }
  return (
    <Badge className={mark.wash} variant="outline">
      <ProtocolIcon family={family} />
      {label}
    </Badge>
  );
}
