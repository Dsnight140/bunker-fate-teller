import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { clearIdentity, loadIdentity } from "@/lib/identity";
import { callGM } from "@/lib/gm";
import { CharacterCard } from "@/components/CharacterCard";
import { PlayersList } from "@/components/PlayersList";
import { EventLog } from "@/components/EventLog";
import { Composer } from "@/components/Composer";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Radiation,
  LogOut,
  Play,
  Zap,
  Skull,
  Trophy,
  Users,
  Package,
  Utensils,
  Copy,
} from "lucide-react";

export default function Room() {
  const { code } = useParams();
  const nav = useNavigate();
  const [identity] = useState(loadIdentity());
  const [room, setRoom] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [eventDifficulty, setEventDifficulty] = useState("среднее");
  const [eventPlayer, setEventPlayer] = useState("");

  useEffect(() => {
    if (!identity || identity.roomCode !== code) {
      nav("/");
      return;
    }
    let mounted = true;
    const init = async () => {
      const { data: r } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code)
        .maybeSingle();
      if (!r) {
        toast.error("Лобби закрыто");
        clearIdentity();
        nav("/");
        return;
      }
      if (!mounted) return;
      setRoom(r);

      const { data: ps } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", r.id)
        .order("joined_at");
      setPlayers(ps || []);

      const { data: ms } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", r.id)
        .order("created_at");
      setMessages(ms || []);
      setLoading(false);

      const ch = supabase
        .channel(`room:${r.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "rooms", filter: `id=eq.${r.id}` },
          (p) => setRoom(p.new)
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "players", filter: `room_id=eq.${r.id}` },
          async () => {
            const { data } = await supabase
              .from("players")
              .select("*")
              .eq("room_id", r.id)
              .order("joined_at");
            setPlayers(data || []);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `room_id=eq.${r.id}`,
          },
          (p) => setMessages((prev) => [...prev, p.new])
        )
        .subscribe();

      return () => {
        supabase.removeChannel(ch);
      };
    };
    const unsubP = init();
    return () => {
      mounted = false;
      unsubP.then((fn) => fn?.());
    };
  }, [code]);

  const me = useMemo(
    () => players.find((p) => p.id === identity?.playerId),
    [players, identity]
  );
  const alivePlayers = players.filter((p) => p.status === "alive");
  const isHost = identity?.isHost;

  const startGame = async () => {
    if (!room || players.length < 2) {
      toast.error("Нужно минимум 2 игрока");
      return;
    }
    setBusy(true);
    try {
      toast.info("GM генерирует катастрофу...");
      const scenario = await callGM("scenario", { players: players.length });

      await supabase
        .from("rooms")
        .update({
          status: "playing",
          catastrophe: scenario.catastrophe,
          bunker: scenario.bunker,
          capacity: scenario.bunker.capacity,
        })
        .eq("id", room.id);

      await supabase.from("messages").insert({
        room_id: room.id,
        kind: "gm",
        content: `**${scenario.catastrophe.name}**\n\n${scenario.catastrophe.description}\n\n_Последствия:_ ${scenario.catastrophe.consequences}\n\n**БУНКЕР**\nВместимость: ${scenario.bunker.capacity} чел.\nЕда: ${scenario.bunker.food_months} мес.\nОбъекты: ${scenario.bunker.objects.join(", ")}\n${scenario.bunker.description}`,
      });

      toast.info("Раздача карточек...");
      for (const p of players) {
        const character = await callGM("character", {
          catastrophe: scenario.catastrophe,
          nickname: p.nickname,
        });
        await supabase.from("players").update({ character }).eq("id", p.id);
      }

      await supabase.from("messages").insert({
        room_id: room.id,
        kind: "system",
        content: "Карточки розданы. Изучите своё досье и начинайте обсуждение.",
      });
      toast.success("Игра началась");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const triggerEvent = async () => {
    if (!eventPlayer) return toast.error("Выберите игрока");
    const target = players.find((p) => p.id === eventPlayer);
    if (!target) return;
    setBusy(true);
    try {
      const ev = await callGM("event", {
        difficulty: eventDifficulty,
        player: { nickname: target.nickname, character: target.character },
        bunker: room.bunker,
      });
      let extraText = "";
      if (ev.outcome === "death" || ev.effect.player_dies) {
        await supabase.from("players").update({ status: "dead" }).eq("id", target.id);
        extraText = `\n\n☠️ **${target.nickname} погибает.**`;
      }
      // food update
      let bunker = { ...room.bunker };
      if (typeof ev.effect.food_delta === "number") {
        bunker.food_months = Math.max(0, (bunker.food_months || 0) + ev.effect.food_delta);
        await supabase.from("rooms").update({ bunker }).eq("id", room.id);
      }
      await supabase.from("messages").insert({
        room_id: room.id,
        kind: "event",
        content: `**[${ev.difficulty.toUpperCase()}]** ${ev.situation}\n\n_Под угрозой:_ **${target.nickname}**\n\n${ev.narration}\n\n_Изменения:_ еда ${ev.effect.food_delta >= 0 ? "+" : ""}${ev.effect.food_delta} мес. • ${ev.effect.bunker_change}${extraText}`,
      });
      setEventPlayer("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const exilePlayer = async (id: string, nickname: string) => {
    if (!confirm(`Изгнать ${nickname}?`)) return;
    await supabase.from("players").update({ status: "dead" }).eq("id", id);
    await supabase.from("messages").insert({
      room_id: room.id,
      kind: "system",
      content: `**${nickname}** изгнан из бункера.`,
    });
  };

  const finish = async () => {
    setBusy(true);
    try {
      const survivors = alivePlayers.map((p) => ({
        nickname: p.nickname,
        character: p.character,
      }));
      const epi = await callGM("epilogue", {
        survivors,
        bunker: room.bunker,
        catastrophe: room.catastrophe,
      });
      await supabase
        .from("rooms")
        .update({ status: "finished", epilogue: epi.epilogue })
        .eq("id", room.id);
      await supabase.from("messages").insert({
        room_id: room.id,
        kind: "gm",
        content: `**ЭПИЛОГ — ${epi.verdict === "survived" ? "ВЫЖИЛИ" : "ПОГИБЛИ"}**\n\n${epi.analysis}\n\n${epi.epilogue}`,
      });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    clearIdentity();
    nav("/");
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code || "");
    toast.success("Код скопирован");
  };

  if (loading || !room || !identity) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="stencil text-muted-foreground flicker">// connecting //</div>
      </div>
    );
  }

  const playing = room.status === "playing";
  const finished = room.status === "finished";

  return (
    <main className="min-h-screen p-4 md:p-6 scanline">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <header className="bunker-panel p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <Radiation className="w-6 h-6 text-primary flicker" />
            <div>
              <div className="stencil text-[10px] text-muted-foreground">ЛОББИ</div>
              <button
                onClick={copyCode}
                className="font-stencil text-2xl glow-text hover:opacity-80 flex items-center gap-2"
              >
                {code} <Copy className="w-3 h-3" />
              </button>
            </div>
          </div>

          {playing && room.bunker && (
            <div className="flex flex-wrap gap-4 ml-auto mr-4 text-xs stencil">
              <Stat icon={<Users className="w-3 h-3" />} label="Места" val={room.capacity} />
              <Stat icon={<Utensils className="w-3 h-3" />} label="Еда (мес.)" val={room.bunker.food_months} />
              <Stat icon={<Skull className="w-3 h-3" />} label="Живы" val={`${alivePlayers.length}/${players.length}`} />
            </div>
          )}

          <Button variant="ghost" size="sm" onClick={leave}>
            <LogOut className="w-4 h-4 mr-1" /> Выйти
          </Button>
        </header>

        {/* Catastrophe banner */}
        {playing && room.catastrophe && (
          <div className="bunker-panel p-4 border-l-4 border-destructive animate-fade-in">
            <div className="stencil text-xs text-destructive mb-1">⚠ КАТАСТРОФА</div>
            <div className="font-stencil text-xl mb-1">{room.catastrophe.name}</div>
            <div className="text-sm text-muted-foreground">{room.catastrophe.description}</div>
          </div>
        )}

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: players */}
          <aside className="lg:col-span-3 space-y-3">
            <div className="stencil text-xs text-muted-foreground flex items-center gap-2">
              <Users className="w-3 h-3" /> Выжившие ({players.length})
            </div>
            <PlayersList players={players} currentId={identity.playerId} />
          </aside>

          {/* Center: log + composer */}
          <section className="lg:col-span-6 space-y-3">
            <EventLog messages={messages} />
            <Composer roomId={room.id} nickname={identity.nickname} disabled={finished} />
          </section>

          {/* Right: my card + host controls */}
          <aside className="lg:col-span-3 space-y-4">
            <CharacterCard
              identity={identity}
              roomId={room.id}
              revealed={(me?.revealed as any) || {}}
              disabled={finished || me?.status === "dead"}
            />

            {isHost && (
              <div className="bunker-panel p-4 space-y-3 animate-pulse-glow">
                <div className="stencil text-xs text-primary flex items-center gap-2">
                  <Crown /> ПУЛЬТ ХОСТА
                </div>

                {!playing && !finished && (
                  <Button
                    onClick={startGame}
                    disabled={busy || players.length < 2}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary-glow stencil"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {busy ? "..." : "Начать игру"}
                  </Button>
                )}

                {playing && (
                  <>
                    <div className="space-y-2 pt-2">
                      <div className="stencil text-[10px] text-muted-foreground">СОБЫТИЕ</div>
                      <Select value={eventDifficulty} onValueChange={setEventDifficulty}>
                        <SelectTrigger className="bg-input"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="легкое">Лёгкое</SelectItem>
                          <SelectItem value="среднее">Среднее</SelectItem>
                          <SelectItem value="сложное">Сложное</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={eventPlayer} onValueChange={setEventPlayer}>
                        <SelectTrigger className="bg-input">
                          <SelectValue placeholder="Кто решает?" />
                        </SelectTrigger>
                        <SelectContent>
                          {alivePlayers.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.nickname}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={triggerEvent}
                        disabled={busy || !eventPlayer}
                        className="w-full bg-warning text-background hover:opacity-90 stencil"
                      >
                        <Zap className="w-4 h-4 mr-2" /> Запустить
                      </Button>
                    </div>

                    <div className="space-y-2 pt-3 border-t border-border">
                      <div className="stencil text-[10px] text-muted-foreground">ИЗГНАНИЕ</div>
                      <Select onValueChange={(v) => {
                        const p = players.find((x) => x.id === v);
                        if (p) exilePlayer(p.id, p.nickname);
                      }}>
                        <SelectTrigger className="bg-input">
                          <SelectValue placeholder="Изгнать игрока" />
                        </SelectTrigger>
                        <SelectContent>
                          {alivePlayers.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.nickname}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {alivePlayers.length <= (room.capacity || 0) && (
                      <Button
                        onClick={finish}
                        disabled={busy}
                        className="w-full bg-destructive text-destructive-foreground stencil"
                      >
                        <Trophy className="w-4 h-4 mr-2" /> Финал
                      </Button>
                    )}
                  </>
                )}

                {finished && (
                  <div className="text-xs text-muted-foreground stencil text-center py-4">
                    // партия завершена //
                  </div>
                )}
              </div>
            )}

            {playing && room.bunker?.objects && (
              <div className="bunker-panel p-4 space-y-2">
                <div className="stencil text-xs text-muted-foreground flex items-center gap-2">
                  <Package className="w-3 h-3" /> ОБЪЕКТЫ БУНКЕРА
                </div>
                {room.bunker.objects.map((o: string, i: number) => (
                  <div key={i} className="text-xs border-l-2 border-accent pl-2 py-1">{o}</div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

function Stat({ icon, label, val }: { icon: any; label: string; val: any }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-primary">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground font-bold">{val}</span>
    </div>
  );
}

function Crown() {
  return <span className="text-warning">★</span>;
}
