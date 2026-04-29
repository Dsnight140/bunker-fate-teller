import { Skull, User, Crown } from "lucide-react";

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

export function PlayersList({ players, currentId }: { players: any[]; currentId: string }) {
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
              {me && <span className="text-[9px] stencil text-primary">[вы]</span>}
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