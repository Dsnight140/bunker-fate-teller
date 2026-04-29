// GM implementation - single batch call to minimize quota usage
const GOOGLE_API_KEY = () => (typeof window !== "undefined"
  ? (window as any).__env?.VITE_GOOGLE_API_KEY || import.meta.env.VITE_GOOGLE_API_KEY
  : import.meta.env.VITE_GOOGLE_API_KEY);

const MODEL = "gemini-2.0-flash-lite";

async function callAI(prompt: string, schema: any, retries = 3): Promise<any> {
  const apiKey = GOOGLE_API_KEY();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.9,
        },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(JSON.stringify(err));
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty response from AI");
    return JSON.parse(text);
  } catch (e) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 3000));
      return callAI(prompt, schema, retries - 1);
    }
    throw e;
  }
}

// ─── BATCH START GAME ────────────────────────────────────────────────────────
// Generates scenario + ALL characters in ONE single API call
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

  const prompt = `Ты — Game Master выживательной игры «Бункер». ${nsfwLine}
  
Создай сценарий и персонажей для игроков: ${playerNames}. Сложность: ${difficulty}.
Все тексты ТОЛЬКО НА РУССКОМ ЯЗЫКЕ.
Каждому игроку дай ${cardsCount} уникальных спец-карт.`;

  const playerCharSchema = {
    type: "OBJECT",
    properties: {
      gender_age: { type: "STRING" },
      profession: { type: "STRING" },
      health: { type: "STRING" },
      phobia: { type: "STRING" },
      baggage: { type: "STRING" },
      hobby: { type: "STRING" },
      traits: { type: "ARRAY", items: { type: "STRING" } },
      special_cards: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            id: { type: "STRING" },
            type: { type: "STRING", enum: ["SPY", "MUTATION", "DOUBLE_VOTE", "STEAL", "UPGRADE"] },
            title: { type: "STRING" },
            description: { type: "STRING" },
          },
          required: ["id", "type", "title", "description"],
        },
      },
    },
    required: ["gender_age", "profession", "health", "phobia", "baggage", "hobby", "traits", "special_cards"],
  };

  const schema = {
    type: "OBJECT",
    properties: {
      catastrophe: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          description: { type: "STRING" },
        },
        required: ["name", "description"],
      },
      bunker: {
        type: "OBJECT",
        properties: {
          capacity: { type: "INTEGER" },
          food_months: { type: "INTEGER" },
          stay_years: { type: "INTEGER" },
          description: { type: "STRING" },
          objects: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                description: { type: "STRING" },
                status: { type: "STRING" },
                action: { type: "STRING" },
              },
              required: ["name", "description", "status", "action"],
            },
          },
        },
        required: ["capacity", "food_months", "stay_years", "description", "objects"],
      },
      characters: {
        type: "OBJECT",
        properties: Object.fromEntries(players.map((p) => [p.nickname, playerCharSchema])),
      },
    },
    required: ["catastrophe", "bunker", "characters"],
  };

  const result = await callAI(prompt, schema);

  // Map characters by player id
  const charactersByPlayerId: Record<string, any> = {};
  for (const player of players) {
    charactersByPlayerId[player.id] = result.characters?.[player.nickname] || null;
  }

  return { scenario: { catastrophe: result.catastrophe, bunker: result.bunker }, characters: charactersByPlayerId };
}

// ─── EVENTS ──────────────────────────────────────────────────────────────────
export async function callGM(action: string, payload: any = {}): Promise<any> {
  const nsfw = payload?.nsfw;
  const nsfwLine = nsfw
    ? "Включи темы 18+: черный юмор, сексуальные отношения, жесткий реализм."
    : "Контент обычный, без 18+.";

  if (action === "event_situation") {
    return callAI(
      `Game Master «Бункер». ${nsfwLine} Создай завязку чрезвычайного события на русском.`,
      {
        type: "OBJECT",
        properties: { situation: { type: "STRING" } },
        required: ["situation"],
      }
    );
  }

  if (action === "event") {
    return callAI(
      `Game Master «Бункер». ${nsfwLine} Разреши событие на русском.
Ситуация: "${payload.situation}". Жертва: ${payload.player?.nickname}.`,
      {
        type: "OBJECT",
        properties: {
          narration: { type: "STRING" },
          effect: {
            type: "OBJECT",
            properties: {
              food_delta: { type: "INTEGER" },
              player_dies: { type: "BOOLEAN" },
              bunker_change: { type: "STRING" },
            },
            required: ["food_delta", "player_dies", "bunker_change"],
          },
        },
        required: ["narration", "effect"],
      }
    );
  }

  if (action === "epilogue") {
    return callAI(
      `Game Master «Бункер». ${nsfwLine} Напиши финальный эпилог на русском.
Выжившие: ${JSON.stringify(payload.survivors?.map((p: any) => p.nickname))}.`,
      {
        type: "OBJECT",
        properties: {
          verdict: { type: "STRING", enum: ["survived", "died"] },
          epilogue: { type: "STRING" },
        },
        required: ["verdict", "epilogue"],
      }
    );
  }

  throw new Error(`Unknown action: ${action}`);
}