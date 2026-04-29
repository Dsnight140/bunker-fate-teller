import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

export function Composer({
  roomId,
  nickname,
  disabled,
}: {
  roomId: string;
  nickname: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    await supabase.from("messages").insert({
      room_id: roomId,
      kind: "chat",
      author: nickname,
      content: text.trim(),
    });
    setText("");
    setSending(false);
  };
  return (
    <div className="flex gap-2">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()}
        placeholder="// сообщение в общий эфир"
        disabled={disabled || sending}
        className="bg-input border-border"
      />
      <Button onClick={send} disabled={disabled || sending || !text.trim()} size="icon">
        <Send className="w-4 h-4" />
      </Button>
    </div>
  );
}