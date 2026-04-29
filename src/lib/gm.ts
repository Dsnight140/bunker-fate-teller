// GM implementation using Groq API (FREE, fast, generous limits)
// Sign up at console.groq.com to get a free API key
const GROQ_MODEL = "llama-3.1-8b-instant"; // Fast and smart

async function callAI(systemPrompt: string, userPrompt: string, retries = 3): Promise<any> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) throw new Error("Groq API ключ не найден. Добавьте VITE_GROQ_API_KEY в .env");

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.9,
        response_format: { type: "json_object" },
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(JSON.stringify(err));
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Пустой ответ от AI");

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("JSON not found in response");
    return JSON.parse(text.substring(start, end + 1));
  } catch (e) {
    console.error(`AI failed (retries left: ${retries}):`, e);
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 2000));
      return callAI(systemPrompt, userPrompt, retries - 1);
    }
    throw e;
  }
}

// ─── BATCH START GAME ────────────────────────────────────────────────────────
export async function callGM_StartGame(payload: {
  players: { id: string; nickname: string }[];
  difficulty: string;
  nsfw: boolean;
}): Promise<{ scenario: any; characters: Record<string, any> }> {
  const { players, difficulty, nsfw } = payload;
  const cardsCount = difficulty === "easy" ? 4 : difficulty === "hard" ? 1 : 2;
  const nsfwLine = nsfw
    ? "Включи темы 18+: черный юмор, сексуальные отношения, жесткий реализм."
    : "Контент обычный, без 18+.";

  const playerNames = players.map((p) => p.nickname).join(", ");

  const system = `Ты — Game Master выживательной игры «Бункер». Все тексты ТОЛЬКО НА РУССКОМ ЯЗЫКЕ. Отвечай ТОЛЬКО в формате JSON.`;

  const user = `${nsfwLine}
Создай катастрофу, бункер и персонажей для игроков: ${playerNames}. Сложность: ${difficulty}.
Каждому игроку дай ровно ${cardsCount} уникальных спец-карты.

ОТВЕТЬ В ТОЧНОСТИ В ЭТОМ ФОРМАТЕ JSON:
{
  "catastrophe": { "name": "Название катастрофы", "description": "Описание катастрофы" },
  "bunker": {
    "capacity": 4,
    "food_months": 24,
    "stay_years": 2,
    "description": "Описание бункера",
    "objects": [
      { "name": "Название", "description": "Описание", "status": "Исправен", "action": "Действие" }
    ]
  },
  "characters": {
    ${players.map(p => `"${p.nickname}": {
      "gender_age": "...",
      "profession": "...",
      "health": "...",
      "phobia": "...",
      "baggage": "...",
      "hobby": "...",
      "traits": ["..."],
      "special_cards": [{ "id": "card_1", "type": "SPY", "title": "...", "description": "..." }]
    }`).join(",\n    ")}
  }
}`;

  const result = await callAI(system, user);

  const charactersByPlayerId: Record<string, any> = {};
  for (const player of players) {
    charactersByPlayerId[player.id] = result.characters?.[player.nickname] || null;
  }

  return { scenario: { catastrophe: result.catastrophe, bunker: result.bunker }, characters: charactersByPlayerId };
}

// ─── EVENTS & EPILOGUE ───────────────────────────────────────────────────────
export async function callGM(action: string, payload: any = {}): Promise<any> {
  const nsfw = payload?.nsfw;
  const nsfwLine = nsfw
    ? "Включи темы 18+: черный юмор, сексуальные отношения, жесткий реализм."
    : "Контент обычный, без 18+.";
  const system = `Ты — Game Master игры «Бункер». Все тексты ТОЛЬКО НА РУССКОМ ЯЗЫКЕ. Отвечай ТОЛЬКО в формате JSON.`;

  if (action === "event_situation") {
    return callAI(
      system,
      `${nsfwLine} Создай завязку чрезвычайной ситуации в бункере.
JSON: { "situation": "Описание ситуации" }`
    );
  }

  if (action === "event") {
    return callAI(
      system,
      `${nsfwLine} Разреши событие.
Ситуация: "${payload.situation}". Жертва: ${payload.player?.nickname}.
JSON: { "narration": "Описание итога", "effect": { "food_delta": 0, "player_dies": false, "bunker_change": "..." } }`
    );
  }

  if (action === "epilogue") {
    return callAI(
      system,
      `${nsfwLine} Финальный эпилог.
Выжившие: ${JSON.stringify(payload.survivors?.map((p: any) => p.nickname))}.
JSON: { "verdict": "survived", "epilogue": "Текст эпилога" }`
    );
  }

  throw new Error(`Unknown action: ${action}`);
}