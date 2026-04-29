import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Eye, Lock, Zap, ChevronDown, ChevronUp, User } from "lucide-react";
import { Identity } from "@/lib/identity";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FIELDS: { key: string; label: string; icon: string }[] = [
  { key: "gender_age",  label: "Пол / Возраст",   icon: "👤" },
  { key: "profession",  label: "Профессия",        icon: "💼" },
  { key: "health",      label: "Здоровье",         icon: "❤️" },
  { key: "phobia",      label: "Фобия",            icon: "😨" },
  { key: "baggage",     label: "Багаж",            icon: "🎒" },
  { key: "hobby",       label: "Хобби",            icon: "🎯" },
  { key: "traits",      label: "Черты характера",  icon: "🧠" },
];

const CARD_TYPE_STYLES: Record<string, string> = {
  SPY: "border-blue-500/50 bg-blue-500/10 text-blue-300",
  MUTATION: "border-purple-500/50 bg-purple-500/10 text-purple-300",
  DOUBLE_VOTE: "border-yellow-500/50 bg-yellow-500/10 text-yellow-300",
  STEAL: "border-orange-500/50 bg-orange-500/10 text-orange-300",
  UPGRADE: "border-green-500/50 bg-green-500/10 text-green-300",
};

const CARD_TYPE_LABELS: Record<string, string> = {
  SPY: "🔍 ШПИОН",
  MUTATION: "☣️ МУТАЦИЯ",
  DOUBLE_VOTE: "✌️ 2X ГОЛОС",
  STEAL: "🔄 ОБМЕН",
  UPGRADE: "⚙️ АПГРЕЙД",
};

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
  const [cardsCollapsed, setCardsCollapsed] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("players")
        .select("character")
        .eq("id", identity.playerId)
        .maybeSingle();
      
      if (error) {
        console.error("Error loading character:", error);
      } else {
        setCharacter(data?.character);
      }
      setLoading(false);
    };
    load();

    // Subscribe to character updates in real time
    const ch = supabase.channel(`char:${identity.playerId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "players", filter: `id=eq.${identity.playerId}` }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [identity.playerId, identity.token, hasCharacter]);

  const renderValue = (key: string, val: any) => {
    if (Array.isArray(val)) return val.join(" • ");
    return String(val ?? "—");
  };

  const reveal = async (key: string, label: string, val: any) => {
    if (revealing) return;
    setRevealing(key);
    try {
      const newRevealed = { ...revealed, [key]: true };
      await supabase.from("players").update({ revealed: newRevealed }).eq("id", identity.playerId);
      await supabase.from("messages").insert({
        room_id: roomId,
        kind: "reveal",
        author: identity.nickname,
        content: `${identity.nickname} раскрывает «${label}»: ${renderValue(key, val)}`,
      });
      toast.success(`«${label}» раскрыто всем!`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRevealing(null);
    }
  };

  const useCard = async (card: any) => {
    setLoading(true);
    try {
      const target = allPlayers.find(p => p.id === targetPlayerId);
      let logMsg = "";

      switch (card.type) {
        case "SPY": {
          if (!target) throw new Error("Выберите цель для шпионажа");
          if (target.id === identity.playerId) throw new Error("Нельзя шпионить за собой");
          const fields = ["profession", "health", "phobia", "baggage", "hobby"];
          const hidden = fields.filter(f => !target.revealed?.[f]);
          if (hidden.length === 0) throw new Error("У этого игрока уже все раскрыто");
          const randomField = hidden[Math.floor(Math.random() * hidden.length)];
          const fieldLabel = FIELDS.find(f => f.key === randomField)?.label || randomField;
          const secretVal = target.character?.[randomField];
          if (!secretVal) throw new Error("Не удалось получить секрет");
          toast.info(`🕵️ СЕКРЕТ ${target.nickname}: «${fieldLabel}» — ${renderValue(randomField, secretVal)}`, { duration: 15000 });
          logMsg = `использовал карту «${card.title}» — тайно узнал один секрет ${target.nickname}!`;
          break;
        }

        case "MUTATION": {
          const mutations = [
            "Иммунитет к радиации (мутация благоприятная)",
            "Лучевая болезнь начальная стадия",
            "Усиленный иммунитет (вирусы не страшны)",
            "Хроническая мигрень (снижает концентрацию)",
            "Сверхзаживление (раны затягиваются быстро)",
            "Ночное зрение (побочный эффект мутации)",
            "Непереносимость консервированной еды",
          ];
          const newVal = mutations[Math.floor(Math.random() * mutations.length)];
          const newChar = { ...character, health: newVal };
          await supabase.from("players").update({ character: newChar }).eq("id", identity.playerId);
          setCharacter(newChar);
          logMsg = `применил карту «${card.title}»! Новое состояние здоровья: ${newVal}`;
          break;
        }

        case "DOUBLE_VOTE": {
          // Mark in player state that this vote is doubled
          await supabase.from("players").update({
            character: { ...character, _double_vote: true }
          }).eq("id", identity.playerId);
          logMsg = `активировал «${card.title}»! Голос засчитается за ДВУХ в следующем голосовании.`;
          break;
        }

        case "STEAL": {
          if (!target) throw new Error("Выберите игрока для обмена");
          if (target.id === identity.playerId) throw new Error("Нельзя обменяться с собой");
          if (!target.character?.baggage) throw new Error("У цели нет багажа");
          const myBaggage = character.baggage;
          const targetBaggage = target.character.baggage;
          await supabase.from("players").update({ character: { ...character, baggage: targetBaggage } }).eq("id", identity.playerId);
          await supabase.from("players").update({ character: { ...target.character, baggage: myBaggage } }).eq("id", target.id);
          setCharacter((prev: any) => ({ ...prev, baggage: targetBaggage }));
          logMsg = `использовал «${card.title}» и поменялся багажом с ${target.nickname}! (${myBaggage} ↔ ${targetBaggage})`;
          break;
        }

        case "UPGRADE": {
          const objIdx = parseInt(targetObjectId);
          if (isNaN(objIdx) || !room?.bunker?.objects?.[objIdx]) throw new Error("Выберите объект для апгрейда");
          const obj = room.bunker.objects[objIdx];
          const newObjects = [...room.bunker.objects];
          newObjects[objIdx] = { ...obj, status: "✅ Модернизирован", action: "Работает на максимальной эффективности" };
          await supabase.from("rooms").update({ bunker: { ...room.bunker, objects: newObjects } }).eq("id", roomId);
          logMsg = `использовал «${card.title}» и полностью модернизировал «${obj.name}»!`;
          break;
        }

        default:
          throw new Error(`Неизвестный тип карты: ${card.type}`);
      }

      // Remove used card
      const remainingCards = (character.special_cards || []).filter((c: any) => c.id !== card.id);
      await supabase.from("players").update({
        character: { ...character, special_cards: remainingCards }
      }).eq("id", identity.playerId);
      setCharacter((prev: any) => ({ ...prev, special_cards: remainingCards }));

      // Log to game chat
      await supabase.from("messages").insert({
        room_id: roomId,
        kind: "gm",
        content: `🃏 ${identity.nickname} ${logMsg}`,
      });

      toast.success("Карта разыграна!");
      setPlayingCardId(null);
      setTargetPlayerId("");
      setTargetObjectId("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !character) {
    return (
      <div className="bunker-panel p-8 flex items-center justify-center gap-3">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="stencil text-xs text-muted-foreground">Загрузка досье...</span>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="bunker-panel p-8 text-center">
        <User className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
        <p className="stencil text-xs text-muted-foreground">Карточка в процессе генерации...</p>
        <p className="text-xs text-muted-foreground mt-1">Подождите окончания загрузки</p>
      </div>
    );
  }

  const cards = character.special_cards || [];
  const needsTarget = (type: string) => type === "SPY" || type === "STEAL";
  const needsObject = (type: string) => type === "UPGRADE";
  const otherPlayers = allPlayers.filter(p => p.id !== identity.playerId && p.status !== "dead");

  return (
    <div className="space-y-3">
      {/* Identity Header */}
      <div className="bunker-panel p-4 flex items-center gap-4 border-l-4 border-primary">
        <div className="w-12 h-12 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-2xl font-bold text-primary">
          {identity.nickname.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="stencil text-[9px] text-muted-foreground">ВАШ ПОЗЫВНОЙ</div>
          <div className="text-xl font-stencil uppercase tracking-wider text-primary glow-text">{identity.nickname}</div>
        </div>
        {disabled && <Badge variant="destructive" className="ml-auto stencil text-[9px]">☠️ МЕРТВ</Badge>}
      </div>

      {/* Special Cards */}
      {cards.length > 0 && (
        <div className="bunker-panel overflow-hidden">
          <button
            className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
            onClick={() => setCardsCollapsed(!cardsCollapsed)}
          >
            <div className="stencil text-[10px] text-warning flex items-center gap-2">
              <Zap className="w-3 h-3" />
              СПЕЦ-КАРТЫ ({cards.length})
            </div>
            {cardsCollapsed ? <ChevronDown className="w-4 h-4 text-warning" /> : <ChevronUp className="w-4 h-4 text-warning" />}
          </button>

          {!cardsCollapsed && (
            <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {cards.map((card: any) => {
                const isActive = playingCardId === card.id;
                const style = CARD_TYPE_STYLES[card.type] || "border-white/20 bg-white/5";
                return (
                  <div key={card.id} className={`border rounded p-3 transition-all ${style} ${isActive ? "ring-1 ring-warning" : ""}`}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <div className="text-[9px] font-bold opacity-70">{CARD_TYPE_LABELS[card.type] || card.type}</div>
                        <div className="text-xs font-bold mt-0.5">{card.title}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[9px] stencil px-2 shrink-0 border border-current"
                        onClick={() => {
                          setPlayingCardId(isActive ? null : card.id);
                          setTargetPlayerId("");
                          setTargetObjectId("");
                        }}
                        disabled={disabled || loading}
                      >
                        {isActive ? "ОТМЕНА" : "ПРИМЕНИТЬ"}
                      </Button>
                    </div>
                    <p className="text-[10px] opacity-60 leading-snug">{card.description}</p>

                    {isActive && (
                      <div className="mt-3 space-y-2 border-t border-white/10 pt-3 animate-fade-in">
                        {needsTarget(card.type) && (
                          <Select value={targetPlayerId} onValueChange={setTargetPlayerId}>
                            <SelectTrigger className="h-7 text-xs bg-black/40 border-white/20">
                              <SelectValue placeholder="🎯 Выберите игрока" />
                            </SelectTrigger>
                            <SelectContent>
                              {otherPlayers.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.nickname}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {needsObject(card.type) && (
                          <Select value={targetObjectId} onValueChange={setTargetObjectId}>
                            <SelectTrigger className="h-7 text-xs bg-black/40 border-white/20">
                              <SelectValue placeholder="⚙️ Выберите объект" />
                            </SelectTrigger>
                            <SelectContent>
                              {room?.bunker?.objects?.map((o: any, i: number) => (
                                <SelectItem key={i} value={i.toString()}>
                                  {o.name} — {o.status}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Button
                          className="w-full h-7 stencil text-[10px] bg-warning text-black hover:bg-warning/80"
                          onClick={() => useCard(card)}
                          disabled={
                            loading ||
                            (needsTarget(card.type) && !targetPlayerId) ||
                            (needsObject(card.type) && !targetObjectId)
                          }
                        >
                          ✅ ПОДТВЕРДИТЬ ДЕЙСТВИЕ
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Stats Grid */}
      <div className="bunker-panel p-3">
        <div className="stencil text-[9px] text-primary/60 mb-3 flex items-center gap-2">
          <Lock className="w-3 h-3" /> СЕКРЕТНОЕ ДОСЬЕ
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FIELDS.map(({ key, label, icon }) => {
            const val = character[key];
            if (val === undefined || val === null) return null;
            const isRevealed = !!revealed[key];
            return (
              <div
                key={key}
                className={`group relative border rounded p-2.5 transition-all ${
                  isRevealed
                    ? "border-primary/30 bg-primary/5"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] text-muted-foreground flex items-center gap-1">
                      <span>{icon}</span>
                      <span className="stencil">{label}</span>
                      {isRevealed && <span className="text-primary ml-1">✓</span>}
                    </div>
                    <div className="text-sm mt-1 break-words leading-snug font-medium text-white">
                      {renderValue(key, val)}
                    </div>
                  </div>
                  {!isRevealed ? (
                    <Button
                      size="sm"
                      onClick={() => reveal(key, label, val)}
                      disabled={revealing === key || disabled}
                      className="shrink-0 h-6 px-2 text-[9px] stencil bg-primary/80 hover:bg-primary text-black"
                    >
                      {revealing === key ? "..." : <><Eye className="w-3 h-3 mr-1" />РАСКРЫТЬ</>}
                    </Button>
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-[8px] stencil border-primary/40 text-primary/60">
                      ОТКРЫТО
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}