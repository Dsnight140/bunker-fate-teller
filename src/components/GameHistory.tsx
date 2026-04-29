import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

interface HistoryEntry {
  timestamp: string;
  type: "character" | "event" | "item_used" | "health_change" | "death";
  player: string;
  description: string;
  details?: any;
}

interface GameHistoryProps {
  gameId: string;
  players: any[];
  events: any[];
  isOpen: boolean;
  onClose: () => void;
}

export function GameHistory({ gameId, players, events, isOpen, onClose }: GameHistoryProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    // Преобразуем события в историю
    const newHistory: HistoryEntry[] = [];
    
    // Добавляем персонажей
    players.forEach((player: any) => {
      newHistory.push({
        timestamp: new Date().toISOString(),
        type: "character",
        player: player.nickname,
        description: `Персонаж создан: ${player.character?.profession || "неизвестная"}`,
        details: player.character,
      });
    });

    // Добавляем события
    events.forEach((event: any, index: number) => {
      newHistory.push({
        timestamp: event.timestamp || new Date().toISOString(),
        type: "event",
        player: event.player?.nickname || "Неизвестный",
        description: event.narration || `Событие #${index + 1}`,
        details: event,
      });

      // Добавляем эффекты события
      if (event.effect) {
        if (event.effect.player_dies) {
          newHistory.push({
            timestamp: event.timestamp || new Date().toISOString(),
            type: "death",
            player: event.player?.nickname || "Неизвестный",
            description: "Персонаж погиб",
            details: event.effect,
          });
        }
        if (event.effect.health_change) {
          newHistory.push({
            timestamp: event.timestamp || new Date().toISOString(),
            type: "health_change",
            player: event.player?.nickname || "Неизвестный",
            description: `Здоровье: ${event.effect.health_change}`,
            details: event.effect,
          });
        }
      }
    });

    setHistory(newHistory);
  }, [players, events]);

  const downloadHistory = () => {
    const data = {
      gameId,
      exportDate: new Date().toISOString(),
      players,
      history,
      totalEvents: events.length,
    };
    
    const element = document.createElement("a");
    element.setAttribute("href", "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2)));
    element.setAttribute("download", `bunker-game-${gameId}.json`);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      character: "👤 ПЕРСОНАЖ",
      event: "⚡ СОБЫТИЕ",
      item_used: "🎁 ИСПОЛЬЗОВАНО",
      health_change: "❤️ ЗДОРОВЬЕ",
      death: "💀 СМЕРТЬ",
    };
    return labels[type] || type;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      character: "text-blue-400",
      event: "text-yellow-400",
      item_used: "text-green-400",
      health_change: "text-orange-400",
      death: "text-red-400",
    };
    return colors[type] || "text-white";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[600px] overflow-y-auto bg-slate-900 border-cyan-500/50">
        <DialogHeader>
          <DialogTitle className="text-cyan-400">История игры #{gameId}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground mb-4">
            <div>👥 Игроков: {players.length}</div>
            <div>⚡ Событий: {events.length}</div>
            <div>📋 Записей в истории: {history.length}</div>
            <div>📅 Экспорт доступен</div>
          </div>

          <div className="max-h-[400px] overflow-y-auto space-y-1 border border-cyan-500/30 rounded p-3 bg-slate-950/50">
            {history.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">История пуста</div>
            ) : (
              history.map((entry, idx) => (
                <div key={idx} className="text-xs font-mono space-y-1 pb-2 border-b border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">[{new Date(entry.timestamp).toLocaleTimeString()}]</span>
                    <span className={`${getTypeColor(entry.type)} font-bold`}>
                      {getTypeLabel(entry.type)}
                    </span>
                    <span className="text-cyan-300 font-bold">{entry.player}</span>
                  </div>
                  <div className="text-slate-400 pl-4">{entry.description}</div>
                  {entry.details && (
                    <div className="text-slate-600 pl-4 text-[10px] max-h-12 overflow-y-auto">
                      <details>
                        <summary className="cursor-pointer hover:text-slate-400">Детали</summary>
                        <pre className="mt-1 whitespace-pre-wrap break-words">
                          {JSON.stringify(entry.details, null, 1)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2 justify-end mt-4">
            <Button 
              onClick={downloadHistory}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              📥 Скачать историю JSON
            </Button>
            <Button 
              onClick={onClose}
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              Закрыть
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
