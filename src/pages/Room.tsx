import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { clearIdentity, loadIdentity } from "@/lib/identity";
import { callGM } from "@/lib/gm";
import { CharacterCard } from "@/components/CharacterCard";
import { PlayersList } from "@/components/PlayersList";
import { EventLog } from "@/components/EventLog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

const FIELDS = [
  { key: "gender_age", label: "Пол/Возраст" },
  { key: "profession", label: "Профессия" },
  { key: "health", label: "Здоровье" },
  { key: "phobia", label: "Фобия" },
  { key: "baggage", label: "Багаж" },
  { key: "hobby", label: "Хобби" },
  { key: "traits", label: "Особенности" },
  { key: "abilities", label: "Способности" },
];

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
  const [gameDifficulty, setGameDifficulty] = useState("normal");
  const [turnLimit, setTurnLimit] = useState(5);

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
    if (!room || players.length < 1) {
      toast.error("Нужен хотя бы 1 игрок");
      return;
    }
    setBusy(true);
    try {
      toast.info("GM генерирует катастрофу...");
      const scenario = await callGM("scenario", { players: players.length, difficulty: gameDifficulty });

      await supabase
        .from("rooms")
        .update({
          status: "playing",
          catastrophe: scenario.catastrophe,
          bunker: { ...scenario.bunker, gameDifficulty, turnLimit },
          capacity: scenario.bunker.capacity,
          current_round: 1,
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
          difficulty: gameDifficulty,
        });
        await supabase.from("players").update({ character }).eq("id", p.id);
        // Добавлена пауза 4 секунды, чтобы не упираться в лимиты бесплатного API Gemini (15 RPM)
        await new Promise((resolve) => setTimeout(resolve, 4000));
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

  const resolveVoting = async () => {
    if (!room.bunker?.voting?.active) return;
    setBusy(true);
    try {
      const votes = room.bunker.voting.votes || {};
      const tallies: Record<string, number> = {};
      Object.values(votes).forEach((targetId: any) => {
        tallies[targetId] = (tallies[targetId] || 0) + 1;
      });
      let maxVotes = -1;
      let targetIds: string[] = [];
      Object.entries(tallies).forEach(([tid, count]) => {
        if (count > maxVotes) {
          maxVotes = count;
          targetIds = [tid];
        } else if (count === maxVotes) {
          targetIds.push(tid);
        }
      });
      let finalTargetId = targetIds[Math.floor(Math.random() * targetIds.length)];
      if (!finalTargetId) {
        // if no one voted, pick random
        finalTargetId = alivePlayers[Math.floor(Math.random() * alivePlayers.length)]?.id;
      }
      const target = players.find((p) => p.id === finalTargetId);
      if (!target) throw new Error("Цель не найдена");

      toast.info(`Голосование завершено. Жертва: ${target.nickname}. Генерация события...`);

      // Determine event difficulty randomly based on game difficulty
      const diffRoll = Math.random();
      let eventDiff = "среднее";
      if (room.bunker.gameDifficulty === "hard") {
        eventDiff = diffRoll < 0.6 ? "сложное" : diffRoll < 0.9 ? "среднее" : "легкое";
      } else if (room.bunker.gameDifficulty === "easy") {
        eventDiff = diffRoll < 0.6 ? "легкое" : diffRoll < 0.9 ? "среднее" : "сложное";
      } else {
        eventDiff = diffRoll < 0.33 ? "легкое" : diffRoll < 0.66 ? "среднее" : "сложное";
      }

      const ev = await callGM("event", {
        difficulty: eventDiff,
        gameDifficulty: room.bunker?.gameDifficulty || "normal",
        situation: room.bunker.voting.situation,
        player: { nickname: target.nickname, character: target.character },
        bunker: room.bunker,
      });

      let extraText = "";
      if (ev.outcome === "death" || ev.effect.player_dies) {
        await supabase.from("players").update({ status: "dead" }).eq("id", target.id);
        extraText = `\n\n☠️ **${target.nickname} погибает.**`;
      }
      
      let bunker = { ...room.bunker };
      bunker.voting = { active: false, votes: {} };
      if (typeof ev.effect.food_delta === "number") {
        bunker.food_months = Math.max(0, (bunker.food_months || 0) + ev.effect.food_delta);
      }
      await supabase.from("rooms").update({ bunker }).eq("id", room.id);

      await supabase.from("messages").insert({
        room_id: room.id,
        kind: "event",
        content: `**[ИТОГ СОБЫТИЯ]** ${room.bunker.voting.situation}\n\n_По итогам голосования угроза настигла:_ **${target.nickname}**\n\n${ev.narration}\n\n_Изменения:_ еда ${ev.effect.food_delta >= 0 ? "+" : ""}${ev.effect.food_delta} мес. • ${ev.effect.bunker_change}${extraText}`,
      });
      // Automatically end round after event so we don't stick in voting state
      const nextRound = (room.current_round || 1) + 1;
      await supabase.from("rooms").update({ current_round: nextRound }).eq("id", room.id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const castVote = async (targetId: string) => {
    if (!room.bunker?.voting?.active || me?.status === "dead") return;
    const bunker = { ...room.bunker };
    if (!bunker.voting.votes) bunker.voting.votes = {};
    bunker.voting.votes[me.id] = targetId;
    await supabase.from("rooms").update({ bunker }).eq("id", room.id);
    toast.success("Голос принят");
  };

  const endRound = async () => {
    if (!room || room.bunker?.voting?.active) return;
    setBusy(true);
    try {
      const nextRound = (room.current_round || 1) + 1;
      const tLimit = room.bunker?.turnLimit || 0;

      if (tLimit > 0 && nextRound % tLimit === 0) {
        // Start voting
        toast.info("Генерация завязки события...");
        
        // Determine event difficulty randomly based on game difficulty
        const diffRoll = Math.random();
        let eventDiff = "среднее";
        if (room.bunker?.gameDifficulty === "hard") {
          eventDiff = diffRoll < 0.6 ? "сложное" : diffRoll < 0.9 ? "среднее" : "легкое";
        } else if (room.bunker?.gameDifficulty === "easy") {
          eventDiff = diffRoll < 0.6 ? "легкое" : diffRoll < 0.9 ? "среднее" : "сложное";
        } else {
          eventDiff = diffRoll < 0.33 ? "легкое" : diffRoll < 0.66 ? "среднее" : "сложное";
        }

        const sit = await callGM("event_situation", {
          difficulty: eventDiff,
          bunker: room.bunker,
        });

        let bunker = { ...room.bunker };
        bunker.voting = { active: true, votes: {}, situation: sit.situation };
        await supabase.from("rooms").update({ current_round: nextRound, bunker }).eq("id", room.id);
        await supabase.from("messages").insert({
          room_id: room.id,
          kind: "system",
          content: `**Раунд ${nextRound}. Внимание! Надвигается угроза.**\n\n${sit.situation}\n\nГолосуйте за того, кто должен с ней столкнуться.`,
        });
      } else {
        await supabase.from("rooms").update({ current_round: nextRound }).eq("id", room.id);
        await supabase.from("messages").insert({
          room_id: room.id,
          kind: "system",
          content: `**Раунд ${nextRound} начался.** Обсуждение продолжается.`,
        });
      }
    } catch(e: any) {
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
              <Stat icon={<Zap className="w-3 h-3" />} label="Раунд" val={room.current_round || 1} />
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <aside className="lg:col-span-3 space-y-3 min-w-0">
            <div className="stencil text-xs text-muted-foreground flex items-center gap-2">
              <Users className="w-3 h-3" /> Выжившие ({players.length})
            </div>
            <PlayersList players={players} currentId={identity.playerId} />

            <Dialog open={playing && room.bunker?.voting?.active} onOpenChange={() => {}}>
              <DialogContent className="bunker-panel sm:max-w-md bg-background border-warning text-foreground">
                <DialogHeader>
                  <DialogTitle className="text-warning font-stencil text-xl flicker">АВТО-СОБЫТИЕ</DialogTitle>
                  <DialogDescription className="text-muted-foreground text-sm">
                    {room.bunker?.voting?.situation || "Надвигается случайная угроза."}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 mt-4">
                  {alivePlayers.map(p => {
                    const votesCount = Object.values(room.bunker?.voting?.votes || {}).filter(id => id === p.id).length;
                    const myVote = room.bunker?.voting?.votes?.[me?.id || ""] === p.id;
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-3 text-sm bg-input/40 p-3 border border-border">
                        <span className={myVote ? "text-primary font-bold" : ""}>{p.nickname}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground bg-black/40 px-2 py-1 rounded">Голосов: {votesCount}</span>
                          <Button 
                            size="sm" 
                            variant={myVote ? "default" : "outline"}
                            className="h-8 text-[10px] stencil min-w-[90px]"
                            onClick={() => castVote(p.id)}
                            disabled={me?.status === "dead" || finished}
                          >
                            {myVote ? "Выбран" : "Голосовать"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {isHost && (
                  <div className="pt-4 mt-4 border-t border-border">
                    <Button
                      onClick={resolveVoting}
                      disabled={busy}
                      className="w-full bg-warning text-background hover:opacity-90 stencil"
                    >
                      Подвести итоги и запустить событие
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {isHost && (
              <div className="bunker-panel p-4 space-y-3 animate-pulse-glow">
                <div className="stencil text-xs text-primary flex items-center gap-2">
                  <Crown /> ПУЛЬТ ХОСТА
                </div>

                {!playing && !finished && (
                  <>
                    <div className="space-y-2 mb-4">
                      <div className="stencil text-[10px] text-muted-foreground">СЛОЖНОСТЬ (КАРТОЧКИ И СОБЫТИЯ)</div>
                      <Select value={gameDifficulty} onValueChange={setGameDifficulty}>
                        <SelectTrigger className="bg-input"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easy">Лёгкая (1-2 плохих свойства, низкая смертность)</SelectItem>
                          <SelectItem value="normal">Нормальная (баланс)</SelectItem>
                          <SelectItem value="hard">Сложная (3-4 плохих свойства, хуже условия)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 mb-4">
                      <div className="stencil text-[10px] text-muted-foreground">АВТО-СОБЫТИЯ (РАУНДЫ)</div>
                      <Select value={turnLimit.toString()} onValueChange={(v) => setTurnLimit(parseInt(v))}>
                        <SelectTrigger className="bg-input"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Выключены</SelectItem>
                          <SelectItem value="3">Каждые 3 раунда</SelectItem>
                          <SelectItem value="5">Каждые 5 раундов</SelectItem>
                          <SelectItem value="7">Каждые 7 раундов</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={startGame}
                      disabled={busy || players.length < 1}
                      className="w-full bg-primary text-primary-foreground hover:bg-primary-glow stencil"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      {busy ? "..." : "Начать игру"}
                    </Button>
                  </>
                )}

                {playing && (
                  <>
                    {!room.bunker?.voting?.active ? (
                      <div className="space-y-2 pt-3 border-t border-border">
                        <Button
                          onClick={endRound}
                          disabled={busy}
                          variant="outline"
                          className="w-full stencil hover:bg-primary hover:text-primary-foreground"
                        >
                          Завершить раунд {room.current_round || 1}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2 pt-3 border-t border-border">
                        <div className="text-xs text-warning stencil text-center py-2 animate-pulse">
                          Ожидание голосования...
                        </div>
                      </div>
                    )}

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

          <section className="lg:col-span-9 space-y-4 flex flex-col min-w-0">
            <div className="bunker-panel p-4 overflow-hidden bg-black/40">
              <div className="stencil text-xs text-primary mb-3">ОТКРЫТЫЕ ХАРАКТЕРИСТИКИ</div>
              <div className="overflow-x-auto custom-scrollbar pb-2">
                <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground stencil w-[80px]">Фото</TableHead>
                    <TableHead className="text-muted-foreground stencil w-[120px]">Игрок</TableHead>
                    {FIELDS.map((f) => (
                      <TableHead key={f.key} className="text-muted-foreground stencil min-w-[120px]">{f.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {players.map((p) => {
                    const rev = p.revealed || {};
                    const char = p.character || {};
                    const photoUrl = char.image_prompt ? `https://image.pollinations.ai/prompt/${encodeURIComponent(char.image_prompt)}?width=100&height=100&nologo=true` : "";
                    return (
                      <TableRow key={p.id} className="border-border hover:bg-input/20">
                        <TableCell>
                          {photoUrl ? (
                            <img src={photoUrl} alt="avatar" className="w-10 h-10 object-cover rounded-md border border-border" />
                          ) : (
                            <div className="w-10 h-10 bg-input/50 rounded-md border border-border flex items-center justify-center">
                              <Users className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-bold text-primary">{p.nickname} {p.status === "dead" && "☠️"}</TableCell>
                        {FIELDS.map((f) => (
                          <TableCell key={f.key} className="text-xs">
                            {rev[f.key] ? (
                              <span className="text-foreground">{Array.isArray(char[f.key]) ? char[f.key].join(" • ") : char[f.key]}</span>
                            ) : (
                              <span className="text-muted-foreground/50 italic">Скрыто</span>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
                </Table>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <EventLog messages={messages} />
              </div>
              <div className="space-y-4">
                <CharacterCard
                  identity={identity}
                  roomId={room.id}
                  revealed={(me?.revealed as any) || {}}
                  disabled={finished || me?.status === "dead"}
                  hasCharacter={!!me?.character}
                  allPlayers={players}
                />
              </div>
            </div>
          </section>
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
