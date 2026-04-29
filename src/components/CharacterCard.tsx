import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Identity } from "@/lib/identity";

const FIELDS: { key: string; label: string }[] = [
  { key: "gender_age", label: "Пол / возраст" },
  { key: "profession", label: "Профессия" },
  { key: "health", label: "Здоровье" },
  { key: "phobia", label: "Фобия" },
  { key: "baggage", label: "Багаж" },
  { key: "hobby", label: "Хобби" },
  { key: "traits", label: "Особенности" },
  { key: "ability", label: "Спец-способность" },
];

export function CharacterCard({
  identity,
  roomId,
  revealed,
  disabled,
}: {
  identity: Identity;
  roomId: string;
  revealed: Record<string, boolean>;
  disabled?: boolean;
}) {
  const [character, setCharacter] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [revealing, setRevealing] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.rpc("get_my_character", {
        p_player_id: identity.playerId,
        p_token: identity.token,
      });
      if (error) console.error(error);
      setCharacter(data);
      setLoading(false);
    };
    load();
  }, [identity.playerId]);

  const renderValue = (key: string, val: any) => {
    if (Array.isArray(val)) return val.join(" • ");
    return String(val);
  };

  const reveal = async (key: string, label: string, val: any) => {
    setRevealing(key);
    try {
      const newRevealed = { ...revealed, [key]: true };
      const { error } = await supabase
        .from("players")
        .update({ revealed: newRevealed })
        .eq("id", identity.playerId);
      if (error) throw error;
      await supabase.from("messages").insert({
        room_id: roomId,
        kind: "reveal",
        author: identity.nickname,
        content: `**${identity.nickname}** раскрывает «${label}»: ${renderValue(key, val)}`,
      });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRevealing(null);
    }
  };

  if (loading) {
    return (
      <div className="bunker-panel p-6">
        <div className="text-xs text-muted-foreground stencil">Загрузка карточки...</div>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="bunker-panel p-6 text-center">
        <Lock className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <div className="text-sm text-muted-foreground">
          Карточка ещё не сгенерирована.<br />
          Хост должен запустить игру.
        </div>
      </div>
    );
  }

  return (
    <div className="bunker-panel p-5 space-y-3 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <div className="stencil text-xs text-primary">Досье / {identity.nickname}</div>
        <div className="text-[10px] text-muted-foreground stencil">только вы видите</div>
      </div>
      {FIELDS.map(({ key, label }) => {
        const val = character[key];
        if (val === undefined) return null;
        const isRevealed = !!revealed[key];
        return (
          <div
            key={key}
            className="border border-border bg-input/40 px-3 py-2 flex items-start justify-between gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="stencil text-[10px] text-muted-foreground">{label}</div>
              <div className="text-sm mt-0.5 break-words">{renderValue(key, val)}</div>
            </div>
            <Button
              size="sm"
              variant={isRevealed ? "secondary" : "default"}
              onClick={() => reveal(key, label, val)}
              disabled={isRevealed || revealing === key || disabled}
              className={`shrink-0 stencil text-[10px] h-8 ${
                !isRevealed ? "bg-primary text-primary-foreground hover:bg-primary-glow" : ""
              }`}
            >
              {isRevealed ? (
                <><Eye className="w-3 h-3 mr-1" /> открыто</>
              ) : (
                <><EyeOff className="w-3 h-3 mr-1" /> раскрыть</>
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}