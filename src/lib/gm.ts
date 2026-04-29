// GM implementation using Pollinations.ai (FREE, NO KEY, NO LIMITS)
export async function callGM(action: string, payload: any = {}) {
  const nsfw = payload?.nsfw 
    ? "ВКЛЮЧИ ТЕМЫ 18+: черный юмор, сексуальные отношения, интимные секреты, взрослые провокации, насилие и похоть. Сделай персонажей и события максимально откровенными." 
    : "Темы 18+ выключены.";

  const system = `Ты — Game Master «Бункера». Реализм, атмосфера выживания. Русский язык. Всегда отвечай ТОЛЬКО чистым JSON без пояснений.`;
  
  let prompt = "";
  let schema = "";

  if (action === "scenario") {
    prompt = `Создай катастрофу и бункер для ${payload.players} чел. ${nsfw}. Дай 6 интерактивных объектов.`;
    schema = `{ "catastrophe": { "name": "Название", "description": "Описание", "image_prompt": "Промпт для фото" }, "bunker": { "capacity": 0, "food_months": 0, "stay_years": 0, "objects": [{ "name": "...", "description": "...", "status": "...", "action": "..." }], "description": "..." } }`;
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

  const finalPrompt = `${system}\n\nЗАДАНИЕ: ${prompt}\n\nОТВЕТЬ СТРОГО В ЭТОМ ФОРМАТЕ JSON:\n${schema}`;

  try {
    // Используем простой GET запрос к Pollinations, это самый надежный способ
    const url = `https://text.pollinations.ai/${encodeURIComponent(finalPrompt)}?model=openai&json=true&seed=${Math.floor(Math.random() * 1000000)}`;
    const response = await fetch(url);

    if (!response.ok) throw new Error(`AI error: ${response.status}`);
    const text = await response.text();
    
    // Пытаемся найти JSON в ответе
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI не вернул JSON");
    
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("Pollinations Error:", e);
    // Фолбек на случай ошибки - пробуем еще раз с другим сидом
    throw new Error("Ошибка связи с ИИ. Пожалуйста, попробуйте еще раз через секунду.");
  }
}