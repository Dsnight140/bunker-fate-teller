// GM implementation using Pollinations.ai (FREE, NO KEY, NO LIMITS)
export async function callGM(action: string, payload: any = {}) {
  const nsfw = payload?.nsfw 
    ? "ВКЛЮЧИ ТЕМЫ 18+: черный юмор, сексуальные отношения, интимные секреты, взрослые провокации, насилие и похоть. Сделай персонажей и события максимально откровенными." 
    : "Темы 18+ выключены.";

  const system = `Ты — Game Master «Бункера». Реализм, атмосфера выживания. Русский язык. Всегда отвечай ТОЛЬКО в формате JSON. Не пиши ничего, кроме JSON.`;
  
  let prompt = "";
  let schema = "";

  if (action === "scenario") {
    prompt = `Создай катастрофу и бункер для ${payload.players} чел. ${nsfw}. Дай 6 интерактивных объектов.`;
    schema = `{ "catastrophe": { "name": "...", "description": "...", "image_prompt": "..." }, "bunker": { "capacity": 0, "food_months": 0, "stay_years": 0, "objects": [{ "name": "...", "description": "...", "status": "...", "action": "..." }], "description": "..." } }`;
  }
  else if (action === "character") {
    const diff = payload.difficulty || "normal";
    const cardsCount = diff === "easy" ? 4 : diff === "hard" ? 1 : 2;
    prompt = `Персонаж для игры. ${nsfw}. Сгенерируй ${cardsCount} спец-карты. Промпт для фото: Simple English, person, face, portrait.`;
    schema = `{ "gender_age": "...", "profession": "...", "health": "...", "phobia": "...", "baggage": "...", "hobby": "...", "traits": ["..."], "special_cards": [{ "id": "...", "type": "SPY|MUTATION|DOUBLE_VOTE|STEAL|UPGRADE", "title": "...", "description": "..." }], "image_prompt": "..." }`;
  }
  else if (action === "event_situation") {
    prompt = `Сгенерируй завязку события. ${nsfw}.`;
    schema = `{ "situation": "...", "image_prompt": "..." }`;
  }
  else if (action === "event") {
    prompt = `Разреши исход события. Ситуация: "${payload.situation}". Игрок: ${payload.player.nickname}. ${nsfw}.`;
    schema = `{ "situation": "...", "image_prompt": "...", "analysis": "...", "outcome": "death|survival", "narration": "...", "effect": { "food_delta": 0, "player_dies": false, "bunker_change": "..." } }`;
  }
  else if (action === "epilogue") {
    prompt = `Финал. Выжившие: ${JSON.stringify(payload.survivors)}. ${nsfw}.`;
    schema = `{ "verdict": "survived|died", "epilogue": "..." }`;
  }

  const finalPrompt = `ЗАДАНИЕ: ${prompt}\n\nОТВЕТЬ СТРОГО В ЭТОМ ФОРМАТЕ JSON:\n${schema}`;

  try {
    const response = await fetch("https://text.pollinations.ai/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: finalPrompt }
        ],
        model: "openai",
        json: true,
        seed: Math.floor(Math.random() * 1000000)
      })
    });

    if (!response.ok) throw new Error(`AI error: ${response.status}`);
    const text = await response.text();
    
    // Продвинутая очистка JSON
    let cleaned = text.trim();
    // Убираем маркдаун если есть
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    // Находим первый { и последний }
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("AI не вернул валидный JSON объект");
    cleaned = cleaned.substring(start, end + 1);

    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Pollinations Error:", e);
    // Пробуем еще раз через секунду (рекурсия с ограничением была бы лучше, но пока так)
    throw new Error("Сбой генерации. Пожалуйста, нажмите кнопку еще раз.");
  }
}