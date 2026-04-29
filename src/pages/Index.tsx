import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { generateRoomCode, generateToken, saveIdentity } from "@/lib/identity";
import { Radiation, DoorOpen, Plus } from "lucide-react";

const Index = () => {
  const nav = useNavigate();
  const [mode, setMode] = useState<"menu" | "create" | "join">("menu");
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const createRoom = async () => {
    if (!nickname.trim()) return toast.error("Введите имя");
    setLoading(true);
    try {
      // generate unique 4-digit code
      let roomCode = generateRoomCode();
      for (let i = 0; i < 5; i++) {
        const { data: existing } = await supabase
          .from("rooms")
          .select("id")
          .eq("code", roomCode)
          .maybeSingle();
        if (!existing) break;
        roomCode = generateRoomCode();
      }

      const hostToken = generateToken();
      const { data: room, error } = await supabase
        .from("rooms")
        .insert({ code: roomCode, status: "lobby", host_token: hostToken })
        .select()
        .single();
      if (error) throw error;

      const playerToken = generateToken();
      const { data: player, error: pErr } = await supabase
        .from("players")
        .insert({
          room_id: room.id,
          secret_token: playerToken,
          nickname: nickname.trim(),
          is_host: true,
        })
        .select()
        .single();
      if (pErr) throw pErr;

      await supabase.from("messages").insert({
        room_id: room.id,
        kind: "system",
        content: `Лобби ${roomCode} открыто. Хост: ${nickname}.`,
      });

      saveIdentity({
        playerId: player.id,
        token: playerToken,
        roomId: room.id,
        roomCode,
        nickname: nickname.trim(),
        isHost: true,
      });
      nav(`/room/${roomCode}`);
    } catch (e: any) {
      toast.error(e.message || "Ошибка создания");
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async () => {
    if (!nickname.trim()) return toast.error("Введите имя");
    if (!/^\d{4}$/.test(code)) return toast.error("Код — 4 цифры");
    setLoading(true);
    try {
      const { data: room, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code)
        .maybeSingle();
      if (error) throw error;
      if (!room) return toast.error("Лобби не найдено");

      const playerToken = generateToken();
      const { data: player, error: pErr } = await supabase
        .from("players")
        .insert({
          room_id: room.id,
          secret_token: playerToken,
          nickname: nickname.trim(),
        })
        .select()
        .single();
      if (pErr) throw pErr;

      await supabase.from("messages").insert({
        room_id: room.id,
        kind: "system",
        content: `${nickname} вошёл в бункер.`,
      });

      saveIdentity({
        playerId: player.id,
        token: playerToken,
        roomId: room.id,
        roomCode: code,
        nickname: nickname.trim(),
        isHost: false,
      });
      nav(`/room/${code}`);
    } catch (e: any) {
      toast.error(e.message || "Ошибка входа");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 scanline">
      <div className="w-full max-w-xl bunker-panel p-8 md:p-12 animate-fade-in">
        <div className="flex items-center gap-3 mb-2">
          <Radiation className="w-8 h-8 text-primary flicker" />
          <span className="stencil text-xs text-muted-foreground">// SECTOR-04 // EMERGENCY PROTOCOL</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-stencil glow-text flicker mb-4">БУНКЕР</h1>
        <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
          Катастрофа неизбежна. Места ограничены. Кто-то останется снаружи.
          Игра-обсуждение с AI Game Master. Соберитесь по 4-значному коду.
        </p>

        {mode === "menu" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setMode("create")}
              className="bunker-panel p-6 text-left hover:border-primary transition-colors group"
            >
              <Plus className="w-6 h-6 text-primary mb-3 group-hover:rotate-90 transition-transform" />
              <div className="stencil text-sm">Создать лобби</div>
              <div className="text-xs text-muted-foreground mt-1">Стать хостом и пригласить игроков</div>
            </button>
            <button
              onClick={() => setMode("join")}
              className="bunker-panel p-6 text-left hover:border-primary transition-colors group"
            >
              <DoorOpen className="w-6 h-6 text-accent mb-3" />
              <div className="stencil text-sm">Войти по коду</div>
              <div className="text-xs text-muted-foreground mt-1">У вас есть 4-значный код</div>
            </button>
          </div>
        )}

        {mode !== "menu" && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <label className="stencil text-xs text-muted-foreground block mb-2">Имя выжившего</label>
              <Input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="напр. Кир"
                maxLength={24}
                className="bg-input border-border font-mono"
              />
            </div>
            {mode === "join" && (
              <div>
                <label className="stencil text-xs text-muted-foreground block mb-2">Код лобби</label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="0000"
                  inputMode="numeric"
                  className="bg-input border-border font-stencil text-3xl tracking-[0.4em] text-center"
                />
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setMode("menu")} disabled={loading}>
                Назад
              </Button>
              <Button
                onClick={mode === "create" ? createRoom : joinRoom}
                disabled={loading}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary-glow stencil"
              >
                {loading ? "..." : mode === "create" ? "Открыть бункер" : "Войти"}
              </Button>
            </div>
          </div>
        )}

        <div className="mt-10 pt-6 border-t border-border text-[10px] text-muted-foreground stencil flex justify-between">
          <span>BUNKER ENGINE v1.0</span>
          <span className="text-primary">● ONLINE</span>
        </div>
      </div>
    </main>
  );
};

export default Index;
