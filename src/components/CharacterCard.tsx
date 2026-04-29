import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Zap, Target } from "lucide-react";
import { Identity } from "@/lib/identity";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FIELDS: { key: string; label: string }[] = [
  { key: "gender_age", label: "Пол / возраст" },
  { key: "profession", label: "Профессия" },
  { key: "health", label: "Здоровье" },
  { key: "phobia", label: "Фобия" },
  { key: "baggage", label: "Багаж" },
  { key: "hobby", label: "Хобби" },
  { key: "traits", label: "Особенности" },
];

export function CharacterCard({
  identity,
  roomId,
  revealed,
  disabled,
  hasCharacter,
  allPlayers = [],
}: {
  identity: Identity;
  roomId: string;
  revealed: Record<string, boolean>;
  disabled?: boolean;
  hasCharacter?: boolean;
  allPlayers?: any[];
}) {
  const [character, setCharacter] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [revealing, setRevealing] = useState<string | null>(null);
  const [playingCardId, setPlayingCardId] = useState<string | null>(null);
  const [targetPlayerId, setTargetPlayerId] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_my_character", {
        p_player_id: identity.playerId,
        p_token: identity.token,
      });
      if (error) console.error(error);
      setCharacter(data);
      setLoading(false);
    };
    load();
  }, [identity.playerId, identity.token, hasCharacter]);

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

  const useCard = async (card: any) => {
    try {
      const target = allPlayers.find(p => p.id === targetPlayerId);
      
      // Logic checks
      if (card.type === "SWAP_HEALTH") {
        if (!target) throw new Error("Выберите цель");
        if (!target.revealed?.health) throw new Error("Вы можете меняться здоровьем только с тем, чьё здоровье открыто всем!");
      }
      if (card.type === "STEAL_ITEM") {
        if (!target) throw new Error("Выберите цель");
        if (!target.revealed?.baggage) throw new Error("Вы можете красть только те вещи, которые открыты!");
      }

      setLoading(true);
      let logMsg = "";
      
      if (card.type === "HEAL") {
        const newChar = { ...character, health: "Идеально здоров. Никаких болезней или травм." };
        await supabase.from("players").update({ character: newChar }).eq("id", identity.playerId);
        logMsg = `использовал карту «${card.title}» и теперь идеально здоров!`;
      } 
      else if (card.type === "SWAP_HEALTH") {
        const myHealth = character.health;
        const targetHealth = target.character.health;
        
        // Update me
        await supabase.from("players").update({ 
          character: { ...character, health: targetHealth } 
        }).eq("id", identity.playerId);
        
        // Update target
        await supabase.from("players").update({ 
          character: { ...target.character, health: myHealth } 
        }).eq("id", target.id);
        
        logMsg = `использовал карту «${card.title}» и поменялся здоровьем с ${target.nickname}!`;
      }
      else if (card.type === "REVEAL") {
        if (!target) throw new Error("Выберите цель");
        const fields = ["profession", "health", "phobia", "baggage", "hobby"];
        const hidden = fields.filter(f => !target.revealed?.[f]);
        if (hidden.length === 0) throw new Error("У игрока уже всё открыто");
        const randomField = hidden[Math.floor(Math.random() * hidden.length)];
        const newRev = { ...target.revealed, [randomField]: true };
        await supabase.from("players").update({ revealed: newRev }).eq("id", target.id);
        logMsg = `использовал карту «${card.title}» и принудительно раскрыл черту у ${target.nickname}!`;
      }
      else if (card.type === "STEAL_ITEM") {
        const myItem = character.baggage;
        const targetItem = target.character.baggage;
        await supabase.from("players").update({ character: { ...character, baggage: targetItem } }).eq("id", identity.playerId);
        await supabase.from("players").update({ character: { ...target.character, baggage: myItem } }).eq("id", target.id);
        logMsg = `использовал карту «${card.title}» и украл вещь у ${target.nickname}!`;
      }
      else if (card.type === "REBOOT") {
        const newTraits = ["Счастливчик", "Харизматичный", "Гениальный", "Железные нервы"];
        const newChar = { ...character, traits: [...character.traits, newTraits[Math.floor(Math.random() * newTraits.length)]] };
        await supabase.from("players").update({ character: newChar }).eq("id", identity.playerId);
        logMsg = `использовал карту «${card.title}» и получил новую положительную черту!`;
      }

      // Remove card
      const remainingCards = character.special_cards.filter((c: any) => c.id !== card.id);
      await supabase.from("players").update({ 
        character: { ...character, special_cards: remainingCards } 
      }).eq("id", identity.playerId);

      await supabase.from("messages").insert({
        room_id: roomId,
        kind: "gm",
        content: `🃏 **${identity.nickname}** ${logMsg}`,
      });

      toast.success("Карта разыграна!");
      setPlayingCardId(null);
      setTargetPlayerId("");
      
      // Reload card
      const { data } = await supabase.rpc("get_my_character", {
        p_player_id: identity.playerId,
        p_token: identity.token,
      });
      setCharacter(data);

    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !character) {
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

  const avatarUrl = character.image_prompt 
    ? `https://image.pollinations.ai/prompt/${encodeURIComponent(character.image_prompt)}?width=400&height=400&nologo=true`
    : null;

  return (
    <div className="space-y-4">
      {/* Large Portrait */}
      <div className="bunker-panel overflow-hidden border-2 border-primary/30">
        {avatarUrl ? (
          <img src={avatarUrl} alt="Portrait" className="w-full aspect-square object-cover grayscale-[30%] contrast-125" />
        ) : (
          <div className="w-full aspect-square bg-input/40 flex items-center justify-center text-muted-foreground">
             Портрет не сгенерирован
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md p-3 border-t border-primary/20">
           <div className="stencil text-[10px] text-primary">ИДЕНТИФИКАЦИЯ</div>
           <div className="text-lg font-stencil uppercase tracking-tighter">{identity.nickname}</div>
        </div>
      </div>

      {/* Special Cards */}
      {character.special_cards?.length > 0 && (
        <div className="space-y-2">
          <div className="stencil text-[10px] text-warning flex items-center gap-2">
            <Zap className="w-3 h-3" /> СПЕЦ-КАРТЫ СПОСОБНОСТЕЙ
          </div>
          <div className="grid grid-cols-1 gap-2">
            {character.special_cards.map((card: any) => (
              <div key={card.id} className="bunker-panel p-3 border-warning/30 bg-warning/5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-xs font-bold text-warning uppercase">{card.title}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{card.description}</div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="stencil text-[10px] border-warning text-warning hover:bg-warning hover:text-black"
                    onClick={() => setPlayingCardId(playingCardId === card.id ? null : card.id)}
                  >
                    Использовать
                  </Button>
                </div>
                
                {playingCardId === card.id && (
                  <div className="mt-3 pt-3 border-t border-warning/20 space-y-3 animate-fade-in">
                    {(card.type === "SWAP_HEALTH" || card.type === "REVEAL" || card.type === "STEAL_ITEM") && (
                      <div className="space-y-2">
                        <div className="text-[10px] stencil text-muted-foreground">ВЫБЕРИТЕ ЦЕЛЬ:</div>
                        <Select value={targetPlayerId} onValueChange={setTargetPlayerId}>
                          <SelectTrigger className="h-8 text-xs bg-black/40 border-warning/40">
                            <SelectValue placeholder="Выберите игрока" />
                          </SelectTrigger>
                          <SelectContent>
                            {allPlayers.filter(p => p.id !== identity.playerId).map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.nickname}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <Button 
                      className="w-full h-8 stencil text-[10px] bg-warning text-black"
                      onClick={() => useCard(card)}
                      disabled={loading}
                    >
                      ПОДТВЕРДИТЬ АКТИВАЦИЮ
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats List */}
      <div className="bunker-panel p-5 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <div className="stencil text-xs text-primary">ХАРАКТЕРИСТИКИ ПЕРСОНАЖА</div>
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
    </div>
  );
}