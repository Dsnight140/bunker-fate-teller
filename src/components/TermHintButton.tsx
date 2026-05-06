import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

function buildHint(label: string, value: string): string {
  const v = value.toLowerCase();
  const hints: Array<{ pattern: RegExp; hint: string }> = [
    { pattern: /агорафоб/, hint: "Страх открытых пространств и больших мест." },
    { pattern: /клаустрофоб/, hint: "Страх тесных и закрытых помещений." },
    { pattern: /арахнофоб/, hint: "Сильный страх пауков." },
    { pattern: /трипофоб|триффоб/, hint: "Неприятная реакция на скопления дыр и отверстий." },
    { pattern: /номофоб/, hint: "Тревога, когда нет телефона или связи." },
    { pattern: /диабет/, hint: "Болезнь, при которой нужно контролировать сахар в крови." },
    { pattern: /эпилепс/, hint: "Болезнь с возможными внезапными приступами." },
    { pattern: /гемофил/, hint: "Кровь плохо сворачивается, раны опаснее обычного." },
    { pattern: /туберкул/, hint: "Тяжелая инфекция легких, может быть заразной." },
    { pattern: /астма/, hint: "Проблемы с дыханием, бывают приступы." },
  ];

  for (const item of hints) {
    if (item.pattern.test(v)) return item.hint;
  }

  if (label.toLowerCase().includes("фоб")) {
    return "Фобия - это сильный и часто неконтролируемый страх.";
  }

  return "Кратко: эта характеристика может влиять на выживание и решения группы.";
}

export function TermHintButton({ label, value }: { label: string; value: string }) {
  const [open, setOpen] = useState(false);
  const hint = useMemo(() => buildHint(label, value), [label, value]);

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-5 w-5 text-[10px]"
        onClick={() => setOpen(true)}
        title="Пояснение"
      >
        ?
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{label}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {value}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">{hint}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
