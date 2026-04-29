import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Zap, Target, ImageOff } from "lucide-react";
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
  room = null
}: {
  identity: Identity;
  roomId: string;
  revealed: Record<string, boolean>;
  disabled?: boolean;
  hasCharacter?: boolean;
  allPlayers?: any[];
  room?: any;
}) {
  const [character, setCharacter] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [revealing, setRevealing] = useState<string | null>(null);
  const [playingCardId, setPlayingCardId] = useState<string | null>(null);
  const [targetPlayerId, setTargetPlayerId] = useState<string>("");
  const [targetObjectId, setTargetObjectId] = useState<string>("");
  const [imgError, setImgError] = useState(false);

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
      setImgError(false);
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
      await supabase.from("players").update({ revealed: newRevealed }).eq("id", identity.playerId);
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
      setLoading(true);
      let logMsg = "";
      
      if (card.type === "SPY") {
        if (!target) throw new Error("Выберите цель");
        const fields = ["profession", "health", "phobia", "baggage", "hobby"];
        const hidden = fields.filter(f => !target.revealed?.[f]);
        if (hidden.length === 0) throw new Error("У игрока уже всё открыто");
        const randomField = hidden[Math.floor(Math.random() * hidden.length)];
        const secretVal = target.character[randomField];
        toast.info(`СЕКРЕТ: ${randomField} игрока ${target.nickname} — ${secretVal}`, { duration: 10000 });
        logMsg = `использовал карту «${card.title}» и тайно узнал секрет ${target.nickname}!`;
      } 
      else if (card.type === "MUTATION") {
        const mutations = ["Тяжелое отравление", "Лучевая болезнь (начальная стадия)", "Иммунитет к радиации", "Стальные легкие", "Потеря памяти"];
        const newVal = mutations[Math.floor(Math.random() * mutations.length)];
        const newChar = { ...character, health: newVal };
        await supabase.from("players").update({ character: newChar }).eq("id", identity.playerId);
        logMsg = `подвергся мутации («${card.title}»)! Новое состояние здоровья: ${newVal}`;
      }
      else if (card.type === "DOUBLE_VOTE") {
        logMsg = `активировал карту «${card.title}»! Его голос в этом раунде считается за ДВА!`;
      }
      else if (card.type === "STEAL") {
        if (!target) throw new Error("Выберите цель");
        const myItem = character.baggage;
        const targetItem = target.character.baggage;
        await supabase.from("players").update({ character: { ...character, baggage: targetItem } }).eq("id", identity.playerId);
        await supabase.from("players").update({ character: { ...target.character, baggage: myItem } }).eq("id", target.id);
        logMsg = `использовал «${card.title}» и поменялся багажом с ${target.nickname}!`;
      }
      else if (card.type === "UPGRADE") {
        if (!room?.bunker?.objects) throw new Error("В бункере нет объектов");
        const objIdx = parseInt(targetObjectId);
        const obj = room.bunker.objects[objIdx];
        const newObjects = [...room.bunker.objects];
        newObjects[objIdx] = { ...obj, status: "Идеальное состояние (Улучшено)", action: "Ультра-эффективное использование" };
        await supabase.from("rooms").update({ bunker: { ...room.bunker, objects: newObjects } }).eq("id", roomId);
        logMsg = `использовал «${card.title}» и модернизировал ${obj.name}!`;
      }

      const remainingCards = character.special_cards.filter((c: any) => c.id !== card.id);
      await supabase.from("players").update({ character: { ...character, special_cards: remainingCards } }).eq("id", identity.playerId);
      await supabase.from("messages").insert({ room_id: roomId, kind: "gm", content: `🃏 **${identity.nickname}** ${logMsg}` });

      toast.success("Карта разыграна!");
      setPlayingCardId(null);
      
      const { data } = await supabase.rpc("get_my_character", { p_player_id: identity.playerId, p_token: identity.token });
      setCharacter(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !character) return <div className="bunker-panel p-6 stencil text-xs">Загрузка...</div>;
  if (!character) return <div className="bunker-panel p-6 text-center text-sm text-muted-foreground">Карточка не готова.</div>;

  const avatarUrl = !imgError && character.image_prompt 
    ? `https://image.pollinations.ai/prompt/${encodeURIComponent(character.image_prompt)}?width=512&height=512&nologo=true&seed=${identity.playerId}`
    : null;

  return (
    <div className="space-y-4">
      <div className="bunker-panel overflow-hidden border-2 border-primary/30 relative aspect-square">
        {avatarUrl ? (
          <img 
            src={avatarUrl} 
            alt="Portrait" 
            className="w-full h-full object-cover grayscale-[20%] contrast-125"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full bg-input/40 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
             <ImageOff className="w-12 h-12 mb-4 opacity-20" />
             <div className="stencil text-[10px]">Система визуализации недоступна</div>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md p-3 border-t border-primary/20">
           <div className="stencil text-[10px] text-primary">ИДЕНТИФИКАЦИЯ</div>
           <div className="text-xl font-stencil uppercase tracking-tighter leading-none mt-1">{identity.nickname}</div>
        </div>
      </div>

      {character.special_cards?.length > 0 && (
        <div className="space-y-2">
          <div className="stencil text-[10px] text-warning flex items-center gap-2">
            <Zap className="w-3 h-3" /> СПЕЦ-КАРТЫ
          </div>
          <div className="grid grid-cols-1 gap-2">
            {character.special_cards.map((card: any) => (
              <div key={card.id} className="bunker-panel p-3 border-warning/30 bg-warning/5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-xs font-bold text-warning uppercase">{card.title}</div>
                    <div className="text-[10px] text-muted-foreground mt-1 leading-snug">{card.description}</div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="stencil text-[10px] border-warning text-warning h-8 px-2"
                    onClick={() => setPlayingCardId(playingCardId === card.id ? null : card.id)}
                  >
                    Активировать
                  </Button>
                </div>
                
                {playingCardId === card.id && (
                  <div className="mt-3 pt-3 border-t border-warning/20 space-y-3 animate-fade-in">
                    {(card.type === "SPY" || card.type === "STEAL") && (
                      <Select value={targetPlayerId} onValueChange={setTargetPlayerId}>
                        <SelectTrigger className="h-8 text-xs bg-black/40"><SelectValue placeholder="Выберите игрока" /></SelectTrigger>
                        <SelectContent>
                          {allPlayers.filter(p => p.id !== identity.playerId).map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.nickname}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {card.type === "UPGRADE" && (
                       <Select value={targetObjectId} onValueChange={setTargetObjectId}>
                        <SelectTrigger className="h-8 text-xs bg-black/40"><SelectValue placeholder="Выберите объект" /></SelectTrigger>
                        <SelectContent>
                          {room?.bunker?.objects?.map((o: any, i: number) => (
                            <SelectItem key={i} value={i.toString()}>{o.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button className="w-full h-8 stencil text-[10px] bg-warning text-black" onClick={() => useCard(card)} disabled={loading}>
                       ПОДТВЕРДИТЬ
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bunker-panel p-4 space-y-3">
        <div className="stencil text-[10px] text-primary/60 mb-2">ХАРАКТЕРИСТИКИ</div>
        {FIELDS.map(({ key, label }) => {
          const val = character[key];
          if (val === undefined) return null;
          const isRevealed = !!revealed[key];
          return (
            <div key={key} className="border border-border bg-input/20 px-3 py-2 flex items-start justify-between gap-3 group">
              <div className="flex-1 min-w-0">
                <div className="stencil text-[9px] text-muted-foreground">{label}</div>
                <div className="text-sm mt-0.5 break-words font-medium">{renderValue(key, val)}</div>
              </div>
              <Button
                size="sm"
                variant={isRevealed ? "secondary" : "default"}
                onClick={() => reveal(key, label, val)}
                disabled={isRevealed || revealing === key || disabled}
                className={`shrink-0 stencil text-[9px] h-7 px-2 opacity-60 group-hover:opacity-100 transition-opacity ${!isRevealed ? "bg-primary text-black" : ""}`}
              >
                {isRevealed ? "ОТКРЫТО" : "РАСКРЫТЬ"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}