// GM implementation using Pollinations.ai (FREE, NO KEY, NO LIMITS)
export async function callGM(action: string, payload: any = {}, retries = 3) {
  const nsfwPrompt = payload?.nsfw 
    ? "ВКЛЮЧИ ТЕМЫ 18+: черный юмор, сексуальные отношения, интимные секреты, взрослые провокации, насилие и похоть. Сделай персонажей и события максимально откровенными." 
    : "Темы 18+ выключены.";

  let task = "";
  let schema = "";

  if (action === "scenario") {
    task = `Создай катастрофу и бункер для ${payload.players} чел. ${nsfwPrompt}. Дай 6 интерактивных объектов.`;
    schema = `{ "catastrophe": { "name": "Название", "description": "Описание" }, "bunker": { "capacity": 0, "food_months": 0, "stay_years": 0, "objects": [{ "name": "...", "description": "...", "status": "...", "action": "..." }], "description": "..." } }`;
  }
  else if (action === "character") {
    const diff = payload.difficulty || "normal";
    const cardsCount = diff === "easy" ? 4 : diff === "hard" ? 1 : 2;
    task = `Персонаж для игры. ${nsfwPrompt}. Сгенерируй ${cardsCount} спец-карты.`;
    schema = `{ "gender_age": "...", "profession": "...", "health": "...", "phobia": "...", "baggage": "...", "hobby": "...", "traits": ["..."], "special_cards": [{ "id": "...", "type": "SPY|MUTATION|DOUBLE_VOTE|STEAL|UPGRADE", "title": "...", "description": "..." }] }`;
  }
  else if (action === "event_situation") {
    task = `Сгенерируй завязку события. ${nsfwPrompt}.`;
    schema = `{ "situation": "..." }`;
  }
  else if (action === "event") {
    task = `Разреши исход события. Ситуация: "${payload.situation}". Игрок: ${payload.player.nickname}. ${nsfwPrompt}.`;
    schema = `{ "situation": "...", "analysis": "...", "outcome": "death|survival", "narration": "...", "effect": { "food_delta": 0, "player_dies": false, "bunker_change": "..." } }`;
  }
  else if (action === "epilogue") {
    task = `Финал. Выжившие: ${JSON.stringify(payload.survivors)}. ${nsfwPrompt}.`;
    schema = `{ "verdict": "survived|died", "epilogue": "..." }`;
  }

  const finalPrompt = `Ты — Game Master игры «Бункер». Твоя задача: ${task}.
  
  ВАЖНО: ПИШИ ТОЛЬКО НА РУССКОМ ЯЗЫКЕ.
  ОТВЕТЬ СТРОГО В ФОРМАТЕ JSON ПО ЭТОМУ ШАБЛОНУ (НИКАКИХ ПРЕАМБУЛ):
  ${schema}`;

  try {
    const response = await fetch("https://text.pollinations.ai/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: finalPrompt }],
        model: "mistral", // Mistral обычно быстрее и лучше следует языку
        json: true,
        seed: Math.floor(Math.random() * 1000000)
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("JSON missing");
    
    return JSON.parse(text.substring(start, end + 1));
  } catch (e) {
    console.error(`AI Attempt failed (left: ${retries}):`, e);
    if (retries > 0) {
      await new Promise(res => setTimeout(res, 2000));
      return callGM(action, payload, retries - 1);
    }
    throw new Error("ИИ временно перегружен. Попробуйте еще раз.");
  }
}