import { useEffect, useRef } from "react";

export function EventLog({ messages }: { messages: any[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <div
      ref={ref}
      className="bunker-panel p-4 h-[500px] overflow-y-auto space-y-3 scanline"
    >
      {messages.length === 0 && (
        <div className="text-xs text-muted-foreground stencil text-center pt-20">
          // эфир пуст //
        </div>
      )}
      {messages.map((m) => (
        <Msg key={m.id} m={m} />
      ))}
    </div>
  );
}

function Msg({ m }: { m: any }) {
  const time = new Date(m.created_at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const styles: Record<string, string> = {
    system: "text-muted-foreground",
    gm: "text-primary border-l-2 border-primary pl-3",
    reveal: "text-accent",
    event: "text-warning border-l-2 border-warning pl-3",
    chat: "text-foreground",
  };
  const labels: Record<string, string> = {
    system: "СИСТЕМА",
    gm: "GM",
    reveal: "ОТКРЫТИЕ",
    event: "СОБЫТИЕ",
    chat: m.author?.toUpperCase() || "ЧАТ",
  };
  return (
    <div className={`text-sm ${styles[m.kind] || ""} animate-fade-in`}>
      <div className="flex items-center gap-2 stencil text-[10px] opacity-70 mb-0.5">
        <span>[{time}]</span>
        <span>{labels[m.kind]}</span>
      </div>
      <div className="whitespace-pre-wrap leading-relaxed">{renderText(m.content)}</div>
    </div>
  );
}

function renderText(t: string) {
  // simple **bold** parsing
  const parts = t.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="text-primary">{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}