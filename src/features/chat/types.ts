import type { ContentBlock, Entry, MessageRole } from "@/types/ipc";

/**
 * Render projection of a persisted entry: the id and role come straight from
 * the entry, `parts` preserves the ordered content blocks. Merging parts into
 * one string or regenerating ids belongs to no layer; text leaves the parts
 * only at the render leaf.
 */
export interface ChatMessage {
  id: string;
  parts: ContentBlock[];
  role: MessageRole;
}

/**
 * Typed projection of one entry: the entry id is the render id, the role is
 * the persisted role, and content stays the ordered parts array.
 */
export function entryToMessage(entry: Entry): ChatMessage {
  return { id: entry.id, parts: entry.content, role: entry.role };
}

/**
 * Plain-text view of one message's parts (clipboard copy, title derivation).
 * The separator preserves part boundaries in the flattened form. Direct
 * field access keeps this exhaustive: adding a ContentBlock variant fails
 * compilation until the text view handles it.
 */
export function textOfParts(parts: ContentBlock[]): string {
  return parts.map((part) => part.text).join("\n\n");
}
