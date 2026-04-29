// GM implementation using Pollinations.ai (FREE, NO KEY, NO LIMITS)
export async function callGM(action: string, payload: any = {}) {
  const nsfw = payload?.nsfw 
    ? "ВКЛЮЧИ ТЕМЫ 18+: черный юмор, сексуальные отношения, интимные секреты, насилие и похоть. Сделай персонажей и события максимально откровенными." 
    : "Темы 18+ выключены.";

  const system = `Ты — Game Master «Бункера». Реализм, атмосфера выживания. Русский язык. Всегда отвечай ТОЛЬКО в формате JSON.`;
  
  let prompt = "";
  let schemaDescription = "";

  if (action === "scenario") {
    prompt = `Создай катастрофу и бункер для ${payload.players} чел. ${nsfw}. Дай 6-8 интерактивных объекта. Срок пребывания в годах.`;
    schemaDescription = `JSON: { "catastrophe": { "name": "...", "description": "...", "image_prompt": "..." }, "bunker": { "capacity": 0, "food_months": 0, "stay_years": 0, "objects": [{ "name": "...", "description": "...", "status": "...", "action": "..." }], "description": "..." } }`;
  }
  else if (action === "character") {
    const diff = payload.difficulty || "normal";
    const cardsCount = diff === "easy" ? 4 : diff === "hard" ? 1 : 2;
    prompt = `Персонаж для игры. ${nsfw}. Сгенерируй ${cardsCount} спец-карты. Промпт для фото: Simple English, person, face, portrait.`;
    schemaDescription = `JSON: { "gender_age": "...", "profession": "...", "health": "...", "phobia": "...", "baggage": "...", "hobby": "...", "traits": ["..."], "special_cards": [{ "id": "...", "type": "SPY|MUTATION|DOUBLE_VOTE|STEAL|UPGRADE", "title": "...", "description": "..." }], "image_prompt": "..." }`;
  }
  else if (action === "event_situation") {
    prompt = `Сгенерируй только завязку события. ${nsfw}.`;
    schemaDescription = `JSON: { "situation": "...", "image_prompt": "..." }`;
  }
  else if (action === "event") {
    prompt = `Разреши исход события. Ситуация: "${payload.situation}". Игрок: ${payload.player.nickname}. ${nsfw}.`;
    schemaDescription = `JSON: { "situation": "...", "image_prompt": "...", "analysis": "...", "outcome": "death|survival", "narration": "...", "effect": { "food_delta": 0, "player_dies": false, "bunker_change": "..." } }`;
  }
  else if (action === "epilogue") {
    prompt = `Финал. Выжившие: ${JSON.stringify(payload.survivors)}. ${nsfw}.`;
    schemaDescription = `JSON: { "verdict": "survived|died", "epilogue": "..." }`;
  }

  try {
    const response = await fetch("https://text.pollinations.ai/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: `${prompt}\n\nОТВЕТЬ СТРОГО ПО СХЕМЕ:\n${schemaDescription}` }
        ],
        model: "openai", // Хорошая модель для JSON
        json: true, // Запрос JSON-формата
        seed: Math.floor(Math.random() * 1000000)
      })
    });

    if (!response.ok) throw new Error(`AI error: ${response.status}`);
    const text = await response.text();
    
    // Пытаемся распарсить JSON, очищая его от возможных маркдаун-тегов
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Pollinations Error:", e);
    throw new Error("Ошибка генерации ИИ. Попробуйте еще раз через секунду.");
  }
}