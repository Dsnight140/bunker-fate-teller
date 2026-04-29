import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { clearIdentity, loadIdentity } from "@/lib/identity";
import { callGM } from "@/lib/gm";
import { CharacterCard } from "@/components/CharacterCard";
import { PlayersList } from "@/components/PlayersList";
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
  Clock,
  Shield,
  Eye,
  Info
} from "lucide-react";

const FIELDS = [
  { key: "gender_age", label: "Пол/Возраст" },
  { key: "profession", label: "Профессия" },
  { key: "health", label: "Здоровье" },
  { key: "phobia", label: "Фобия" },
  { key: "baggage", label: "Багаж" },
  { key: "hobby", label: "Хобби" },
  { key: "traits", label: "Особенности" },
];

export default function Room() {
  const { code } = useParams();
  const nav = useNavigate();
  const [identity] = useState(loadIdentity());
  const [room, setRoom] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [gameDifficulty, setGameDifficulty] = useState("normal");
  const [turnLimit, setTurnLimit] = useState(5);
  const [nsfw, setNsfw] = useState(false);
  const [showBunkerModal, setShowBunkerModal] = useState(false);

  useEffect(() => {
    if (!identity || identity.roomCode !== code) {
      nav("/");
      return;
    }
    let mounted = true;
    const init = async () => {
      const { data: r } = await supabase.from("rooms").select("*").eq("code", code).maybeSingle();
      if (!r) {
        toast.error("Лобби закрыто");
        clearIdentity();
        nav("/");
        return;
      }
      if (!mounted) return;
      setRoom(r);

      const { data: ps } = await supabase.from("players").select("*").eq("room_id", r.id).order("joined_at");
      setPlayers(ps || []);
      setLoading(false);

      const ch = supabase.channel(`room:${r.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${r.id}` }, (p) => setRoom(p.new))
        .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${r.id}` }, async () => {
          const { data } = await supabase.from("players").select("*").eq("room_id", r.id).order("joined_at");
          setPlayers(data || []);
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${r.id}` }, (p) => {
            const msg = p.new;
            if (msg.kind === "reveal") toast.info(msg.content, { duration: 5000, icon: <Eye className="w-4 h-4" /> });
            else if (msg.kind === "system") toast(msg.content, { duration: 5000, icon: <Info className="w-4 h-4" /> });
            else if (msg.kind === "gm") toast.warning(msg.content, { duration: 7000, icon: <Zap className="w-4 h-4" /> });
            else if (msg.kind === "event") toast.error(msg.content, { duration: 10000, icon: <Skull className="w-4 h-4" /> });
        })
        .subscribe();

      return () => { supabase.removeChannel(ch); };
    };
    const unsubP = init();
    return () => {
      mounted = false;
      unsubP.then((fn) => fn?.());
    };
  }, [code]);

  const me = useMemo(() => players.find((p) => p.id === identity?.playerId), [players, identity]);
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
      const scenario = await callGM("scenario", { players: players.length, difficulty: gameDifficulty, nsfw });
      if (!scenario?.catastrophe) throw new Error("Сбой генерации сценария. Попробуйте еще раз.");

      await supabase.from("rooms").update({
          status: "playing",
          catastrophe: scenario.catastrophe,
          bunker: { ...scenario.bunker, gameDifficulty, turnLimit, nsfw },
          capacity: scenario.bunker.capacity,
          current_round: 1,
      }).eq("id", room.id);

      toast.info("Раздача карточек...");
      for (const p of players) {
        const character = await callGM("character", {
          catastrophe: scenario.catastrophe,
          nickname: p.nickname,
          difficulty: gameDifficulty,
          nsfw
        });
        await supabase.from("players").update({ character }).eq("id", p.id);
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }

      await supabase.from("messages").insert({ room_id: room.id, kind: "system", content: "Игра началась! Изучите свои карточки." });
      toast.success("Все готово!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const endRound = async () => {
    if (!room || room.bunker?.voting?.active) return;
    setBusy(true);
    try {
      const nextRound = (room.current_round || 1) + 1;
      const tLimit = room.bunker?.turnLimit || 0;

      if (tLimit > 0 && nextRound % tLimit === 0) {
        toast.info("Надвигается угроза...");
        const sit = await callGM("event_situation", { difficulty: room.bunker?.gameDifficulty, bunker: room.bunker, nsfw });
        if (!sit?.situation) throw new Error("AI не смог сгенерировать событие. Пропускаем.");

        let bunker = { ...room.bunker };
        bunker.voting = { active: true, votes: {}, situation: sit.situation, image_prompt: sit.image_prompt };
        await supabase.from("rooms").update({ current_round: nextRound, bunker }).eq("id", room.id);
      } else {
        await supabase.from("rooms").update({ current_round: nextRound }).eq("id", room.id);
      }
    } catch(e: any) {
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
      Object.values(votes).forEach((targetId: any) => { tallies[targetId] = (tallies[targetId] || 0) + 1; });
      let maxVotes = -1;
      let targetIds: string[] = [];
      Object.entries(tallies).forEach(([tid, count]) => {
        if (count > maxVotes) { maxVotes = count; targetIds = [tid]; }
        else if (count === maxVotes) targetIds.push(tid);
      });
      let finalTargetId = targetIds[Math.floor(Math.random() * targetIds.length)] || alivePlayers[Math.floor(Math.random() * alivePlayers.length)]?.id;
      const target = players.find((p) => p.id === finalTargetId);
      if (!target) throw new Error("Цель не найдена");

      const ev = await callGM("event", {
        situation: room.bunker.voting.situation,
        player: { nickname: target.nickname, character: target.character },
        bunker: room.bunker,
        nsfw: room.bunker.nsfw
      });

      let extraText = "";
      if (ev.effect.player_dies) {
        await supabase.from("players").update({ status: "dead" }).eq("id", target.id);
        extraText = ` ☠️ ${target.nickname} погибает.`;
      }
      
      let bunker = { ...room.bunker };
      bunker.voting = { active: false, votes: {} };
      bunker.food_months = Math.max(0, (bunker.food_months || 0) + ev.effect.food_delta);
      await supabase.from("rooms").update({ bunker }).eq("id", room.id);
      await supabase.from("messages").insert({ room_id: room.id, kind: "event", content: `ИТОГ: ${ev.narration}${extraText}` });
      await supabase.from("rooms").update({ current_round: (room.current_round || 1) + 1 }).eq("id", room.id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const castVote = async (targetId: string) => {
    if (!room.bunker?.voting?.active || me?.status === "dead") return;
    const bunker = { ...room.bunker };
    bunker.voting.votes = { ...(bunker.voting.votes || {}), [me.id]: targetId };
    await supabase.from("rooms").update({ bunker }).eq("id", room.id);
    toast.success("Голос принят");
  };

  const finish = async () => {
    setBusy(true);
    try {
      const epi = await callGM("epilogue", { survivors: alivePlayers, bunker: room.bunker, catastrophe: room.catastrophe, nsfw: room.bunker.nsfw });
      await supabase.from("rooms").update({ status: "finished", epilogue: epi.epilogue }).eq("id", room.id);
      await supabase.from("messages").insert({ room_id: room.id, kind: "gm", content: `ФИНАЛ: ${epi.epilogue}` });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  if (loading || !room || !identity) return <div className="min-h-screen flex items-center justify-center stencil text-muted-foreground animate-pulse">// connecting //</div>;

  const playing = room.status === "playing";
  const finished = room.status === "finished";

  return (
    <main className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column - Sidebar */}
        <aside className="lg:col-span-3 space-y-6 lg:sticky lg:top-6">
          <div className="bunker-panel p-4 flex flex-col gap-4">
             <div className="flex items-center justify-between">
                <Radiation className="w-6 h-6 text-primary flicker" />
                <Button variant="ghost" size="icon" onClick={() => nav("/")}><LogOut className="w-4 h-4" /></Button>
             </div>
             <div className="text-center">
                <div className="stencil text-[10px] text-muted-foreground">КОД ЛОББИ</div>
                <div className="font-stencil text-2xl tracking-widest text-primary glow-text cursor-pointer" onClick={() => { navigator.clipboard.writeText(code || ""); toast.success("Копировано"); }}>{code}</div>
             </div>
             <PlayersList players={players} currentId={identity.playerId} />
          </div>

          {isHost && (
            <div className="bunker-panel p-4 space-y-4 border-primary/20">
              <div className="stencil text-[10px] text-primary flex items-center gap-2"><Zap className="w-3 h-3" /> ПУЛЬТ УПРАВЛЕНИЯ</div>
              {!playing && !finished && (
                <div className="space-y-4">
                   <div className="space-y-1">
                      <div className="stencil text-[9px] text-muted-foreground">СЛОЖНОСТЬ</div>
                      <Select value={gameDifficulty} onValueChange={setGameDifficulty}>
                        <SelectTrigger className="h-8 bg-black/40"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="easy">ЛЕГКО (4 КАРТЫ)</SelectItem><SelectItem value="normal">НОРМА (2 КАРТЫ)</SelectItem><SelectItem value="hard">ХАРД (1 КАРТА)</SelectItem></SelectContent>
                      </Select>
                   </div>
                   <div className="flex items-center justify-between p-2 bg-destructive/5 border border-destructive/20">
                      <span className="stencil text-[9px]">РЕЖИМ 18+</span>
                      <Button size="sm" variant={nsfw ? "destructive" : "outline"} onClick={() => setNsfw(!nsfw)} className="h-6 text-[8px] stencil">{nsfw ? "ON" : "OFF"}</Button>
                   </div>
                   <Button className="w-full bg-primary text-black font-bold stencil" onClick={startGame} disabled={busy}><Play className="w-4 h-4 mr-2" /> НАЧАТЬ ВЫЖИВАНИЕ</Button>
                </div>
              )}
              {playing && (
                <div className="space-y-2">
                   {!room.bunker?.voting?.active ? (
                     <Button className="w-full stencil" variant="outline" onClick={endRound} disabled={busy}>СЛЕД. РАУНД ({room.current_round})</Button>
                   ) : (
                     <Button className="w-full bg-warning text-black stencil" onClick={resolveVoting} disabled={busy}>ЗАВЕРШИТЬ СОБЫТИЕ</Button>
                   )}
                   {alivePlayers.length <= (room.capacity || 0) && (
                      <Button className="w-full bg-destructive stencil" onClick={finish} disabled={busy}><Trophy className="w-4 h-4 mr-2" /> ФИНАЛ</Button>
                   )}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Right Column - Main Area */}
        <section className="lg:col-span-9 space-y-6 min-w-0">
          
          {/* Disaster Banner */}
          {playing && room.catastrophe && (
            <div className="bunker-panel p-0 overflow-hidden border-b-2 border-destructive animate-fade-in shadow-2xl">
              <div className="relative h-64 md:h-80 w-full">
                <img 
                  src={`https://image.pollinations.ai/prompt/${encodeURIComponent(room.catastrophe.image_prompt)}?width=1600&height=600&nologo=true&seed=${room.id}`} 
                  className="w-full h-full object-cover grayscale-[30%] contrast-125"
                  alt="Catastrophe"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6">
                   <div className="stencil text-xs text-destructive mb-1 flex items-center gap-2"><Radiation className="w-4 h-4" /> ОБЪЕКТ: ЗЕМЛЯ — КАТАСТРОФА ПРЯМО СЕЙЧАС</div>
                   <h1 className="text-4xl md:text-5xl font-stencil uppercase text-white glow-text mb-2 tracking-tighter leading-none">{room.catastrophe.name}</h1>
                   <p className="text-sm md:text-base text-gray-300 max-w-4xl line-clamp-3 md:line-clamp-none">{room.catastrophe.description}</p>
                </div>
              </div>
              <div className="bg-black/80 backdrop-blur p-4 grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-white/10">
                 <Stat icon={<Clock className="w-4 h-4" />} label="СРОК" val={`${room.bunker.stay_years} ЛЕТ`} />
                 <Stat icon={<Shield className="w-4 h-4" />} label="ЗАЩИТА" val={`${room.capacity} МЕСТ`} />
                 <Stat icon={<Utensils className="w-4 h-4" />} label="РЕСУРСЫ" val={`${room.bunker.food_months} МЕС.`} />
                 <Button variant="ghost" size="sm" className="stencil text-[10px]" onClick={() => setShowBunkerModal(true)}><Info className="w-3 h-3 mr-1" /> О БУНКЕРЕ</Button>
              </div>
            </div>
          )}

          {/* Table */}
          {playing && (
            <div className="bunker-panel p-4 overflow-hidden bg-black/40">
              <div className="stencil text-xs text-primary mb-4 flex items-center gap-2"><Users className="w-4 h-4" /> ОТКРЫТЫЕ ДАННЫЕ ВЫЖИВШИХ</div>
              <div className="overflow-x-auto custom-scrollbar pb-2">
                <Table className="min-w-[1000px]">
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="stencil w-[60px]">ФОТО</TableHead>
                      <TableHead className="stencil w-[150px]">ИГРОК</TableHead>
                      {FIELDS.map(f => <TableHead key={f.key} className="stencil">{f.label}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {players.map(p => {
                       const rev = p.revealed || {};
                       const char = p.character || {};
                       const avatar = char.image_prompt ? `https://image.pollinations.ai/prompt/${encodeURIComponent(char.image_prompt)}?width=80&height=80&nologo=true&seed=${p.id}` : null;
                       return (
                         <TableRow key={p.id} className="border-white/5 hover:bg-white/5 transition-colors">
                           <TableCell>{avatar ? <img src={avatar} className="w-8 h-8 rounded border border-white/10 grayscale" /> : <Users className="w-6 h-6 opacity-20" />}</TableCell>
                           <TableCell className="font-bold text-primary">{p.nickname} {p.status === "dead" && "☠️"}</TableCell>
                           {FIELDS.map(f => (
                             <TableCell key={f.key} className="text-[11px]">
                               {rev[f.key] ? <span className="text-gray-200">{Array.isArray(char[f.key]) ? char[f.key].join(" • ") : char[f.key]}</span> : <span className="text-white/10 italic">СКРЫТО</span>}
                             </TableCell>
                           ))}
                         </TableRow>
                       );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Dossier */}
          {playing && (
             <div className="grid grid-cols-1 xl:grid-cols-1 gap-6">
                <CharacterCard
                   identity={identity}
                   roomId={room.id}
                   revealed={(me?.revealed as any) || {}}
                   disabled={finished || me?.status === "dead"}
                   hasCharacter={!!me?.character}
                   allPlayers={players}
                   room={room}
                />
             </div>
          )}
        </section>

        {/* Modals */}
        <Dialog open={showBunkerModal} onOpenChange={setShowBunkerModal}>
           <DialogContent className="bunker-panel bg-background border-primary/40 text-foreground max-w-2xl">
              <DialogHeader>
                 <DialogTitle className="stencil text-primary">ТЕХНИЧЕСКИЙ ПАСПОРТ ОБЪЕКТА</DialogTitle>
                 <DialogDescription className="text-gray-400 mt-4 leading-relaxed">{room?.bunker?.description}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 max-h-[400px] overflow-y-auto custom-scrollbar p-2">
                 {room?.bunker?.objects?.map((o: any, i: number) => (
                    <div key={i} className="bg-white/5 border border-white/10 p-3 flex flex-col justify-between">
                       <div>
                          <div className="text-xs font-bold uppercase text-primary">{o.name}</div>
                          <div className="text-[10px] text-gray-400 mt-1">{o.description}</div>
                       </div>
                       <div className="text-[9px] mt-2 stencil flex items-center gap-2">
                          СТАТУС: <span className={o.status.includes("Исправен") ? "text-success" : "text-destructive"}>{o.status}</span>
                       </div>
                    </div>
                 ))}
              </div>
           </DialogContent>
        </Dialog>

        <Dialog open={playing && !!room.bunker?.voting?.active} onOpenChange={() => {}}>
           <DialogContent className="bunker-panel bg-background border-warning max-w-4xl p-0 overflow-hidden">
              <div className="relative h-48 w-full">
                 <img src={`https://image.pollinations.ai/prompt/${encodeURIComponent(room?.bunker?.voting?.image_prompt || "threat") }?width=1000&height=400&nologo=true`} className="w-full h-full object-cover" />
                 <div className="absolute inset-0 bg-black/60" />
                 <div className="absolute inset-0 flex items-center justify-center">
                    <h2 className="text-3xl font-stencil text-warning glow-text uppercase flicker">ЧРЕЗВЫЧАЙНАЯ СИТУАЦИЯ</h2>
                 </div>
              </div>
              <div className="p-6 space-y-4">
                 <div className="text-center max-w-2xl mx-auto italic text-gray-200">« {room?.bunker?.voting?.situation} »</div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {alivePlayers.map(p => {
                       const votesCount = Object.values(room.bunker?.voting?.votes || {}).filter(id => id === p.id).length;
                       const myVote = room.bunker?.voting?.votes?.[me?.id || ""] === p.id;
                       return (
                         <Button key={p.id} variant={myVote ? "default" : "outline"} className={`h-12 stencil text-[10px] ${myVote ? "bg-warning text-black" : "border-warning/40"}`} onClick={() => castVote(p.id)} disabled={me?.status === "dead"}>
                            {p.nickname} ({votesCount})
                         </Button>
                       );
                    })}
                 </div>
                 {isHost && <Button className="w-full bg-warning text-black stencil" onClick={resolveVoting} disabled={busy}>ПРИНЯТЬ РЕШЕНИЕ (GM)</Button>}
              </div>
           </DialogContent>
        </Dialog>

      </div>
    </main>
  );
}

function Stat({ icon, label, val }: { icon: any; label: string; val: any }) {
  return (
    <div className="flex flex-col md:flex-row items-center gap-2">
      <div className="p-2 bg-white/5 rounded border border-white/10 text-primary">{icon}</div>
      <div className="text-center md:text-left">
         <div className="text-[8px] stencil text-gray-500">{label}</div>
         <div className="text-sm font-bold text-white leading-none">{val}</div>
      </div>
    </div>
  );
}
