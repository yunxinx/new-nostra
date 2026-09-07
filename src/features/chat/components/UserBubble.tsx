interface UserBubbleProps {
  content: string;
}

export function UserBubble({ content }: UserBubbleProps) {
  return (
    <div className="flex justify-end">
      <div className="bg-secondary text-secondary-foreground max-w-[560px] rounded-lg px-3 py-1.5 text-sm whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}
