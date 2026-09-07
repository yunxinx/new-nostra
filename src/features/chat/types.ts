export interface ChatMessage {
  content: string;
  id: string;
  role: "assistant" | "user";
}
