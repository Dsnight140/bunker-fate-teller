import { Skull, User, Crown, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

const LABELS: Record<string, string> = {
  gender_age: "Пол/возраст",
  profession: "Профессия",
  health: "Здоровье",
  phobia: "Фобия",
  baggage: "Багаж",
  hobby: "Хобби",
  traits: "Особенности",
  ability: "Способность",
};

export function PlayersList({ 
  players, 
  currentId, 
  isHost, 
  onKick, 
  onStartKickVote 
}: { 
  players: any[]; 
  currentId: string;
  isHost?: boolean;
  onKick?: (id: string) => void;
  onStartKickVote?: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {players.map((p) => {
        const dead = p.status === "dead";
        const me = p.id === currentId;
        const revealed = p.revealed || {};
        const revealedKeys = Object.keys(revealed).filter((k) => revealed[k]);
        return (
          <div
            key={p.id}
            className={`bunker-panel p-3 ${dead ? "opacity-50" : ""} ${
              me ? "border-primary" : ""
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              {dead ? (
                <Skull className="w-4 h-4 text-destructive" />
              ) : (
                <User className="w-4 h-4 text-primary" />
              )}
              <span className={`text-sm font-medium ${dead ? "line-through" : ""}`}>
                {p.nickname}
              </span>
              {p.is_host && <Crown className="w-3 h-3 text-warning ml-auto" />}
              
              {!dead && !me && (
                <div className="flex gap-1 ml-auto">
                   <Button variant="ghost" size="icon" className="h-6 w-6 text-warning" onClick={() => onStartKickVote?.(p.id)} title="Голосовать за кик"><Skull className="w-3 h-3" /></Button>
                   {isHost && <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onKick?.(p.id)} title="Кикнуть"><LogOut className="w-3 h-3" /></Button>}
                </div>
              )}
              
              {me && !p.is_host && <span className="text-[9px] stencil text-primary ml-auto">[вы]</span>}
            </div>
            {revealedKeys.length === 0 ? (
              <div className="text-[10px] stencil text-muted-foreground">ничего не раскрыто</div>
            ) : (
              <div className="text-[10px] stencil text-accent">
                раскрыто: {revealedKeys.map((k) => LABELS[k] || k).join(", ")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}