// Client-side GM implementation with NSFW support and enhanced visuals
const MODEL = "gemini-2.5-flash-lite";

async function callAI(systemPrompt: string, userPrompt: string, schema?: any, retries = 3): Promise<any> {
  const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
  if (!GOOGLE_API_KEY) throw new Error("VITE_GOOGLE_API_KEY not set in .env");

  const body: any = {
    contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  };

  if (schema) body.generationConfig.responseSchema = schema;

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GOOGLE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const t = await r.text();
      if ((r.status === 429 || r.status === 503) && retries > 0) {
        await new Promise(res => setTimeout(res, 4000));
        return callAI(systemPrompt, userPrompt, schema, retries - 1);
      }
      throw new Error(`AI ${r.status}: ${t}`);
    }
    
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return schema ? JSON.parse(text?.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim() || "{}") : text;
  } catch (e: any) {
    if (retries > 0 && !e.message.includes("AI")) {
      await new Promise(res => setTimeout(res, 4000));
      return callAI(systemPrompt, userPrompt, schema, retries - 1);
    }
    throw e;
  }
}

const catastropheSchema = {
  type: "OBJECT",
  properties: {
    catastrophe: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        description: { type: "STRING" },
        image_prompt: { type: "STRING", description: "Cinematic digital art prompt of the disaster, dark atmosphere" }
      },
      required: ["name", "description", "image_prompt"]
    },
    bunker: {
      type: "OBJECT",
      properties: {
        capacity: { type: "INTEGER" },
        food_months: { type: "INTEGER" },
        objects: { 
          type: "ARRAY", 
          items: { 
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              description: { type: "STRING" },
              status: { type: "STRING", description: "Например: Исправен, Требует ремонта, Заблокирован" },
              action: { type: "STRING", description: "Что можно сделать с объектом" }
            },
            required: ["name", "description", "status", "action"]
          }
        },
        description: { type: "STRING" }
      },
      required: ["capacity", "food_months", "objects", "description"]
    }
  },
  required: ["catastrophe", "bunker"]
};

const characterSchema = {
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
          type: { type: "STRING", description: "SPY, MUTATION, DOUBLE_VOTE, STEAL, UPGRADE" },
          title: { type: "STRING" },
          description: { type: "STRING" }
        },
        required: ["id", "type", "title", "description"]
      }
    },
    image_prompt: { type: "STRING", description: "Detailed portrait prompt, digital art style" }
  },
  required: ["gender_age", "profession", "health", "phobia", "baggage", "hobby", "traits", "special_cards", "image_prompt"]
};

const eventSchema = {
  type: "OBJECT",
  properties: {
    situation: { type: "STRING" },
    image_prompt: { type: "STRING", description: "Visual description of the threat/situation" },
    analysis: { type: "STRING" },
    outcome: { type: "STRING" },
    narration: { type: "STRING" },
    effect: {
      type: "OBJECT",
      properties: {
        food_delta: { type: "INTEGER" },
        player_dies: { type: "BOOLEAN" },
        bunker_change: { type: "STRING" }
      },
      required: ["food_delta", "player_dies", "bunker_change"]
    }
  },
  required: ["situation", "image_prompt", "analysis", "outcome", "narration", "effect"]
};

const SYSTEM = `Ты — Game Master «Бункера». Реализм, атмосфера выживания. Русский язык.`;

export async function callGM(action: string, payload: any = {}) {
  const nsfw = payload?.nsfw ? "ВКЛЮЧИ ТЕМЫ 18+: черный юмор, жестокий реализм, взрослые конфликты, провокации. Сделай персонажей и события более жесткими." : "Темы 18+ выключены. Соблюдай баланс.";
  
  if (action === "scenario") {
    return callAI(SYSTEM, `Катастрофа и бункер для ${payload.players} чел. ${nsfw}. Дай 4-5 интерактивных объекта в бункер.`, catastropheSchema);
  }
  
  if (action === "character") {
    const cardsCount = payload.difficulty === "easy" ? 3 : payload.difficulty === "hard" ? 1 : 2;
    return callAI(SYSTEM, `Персонаж для игры. ${nsfw}. Сгенерируй ${cardsCount} спец-карты (SPY - подсмотреть чужую черту, MUTATION - рискнуть и изменить свою фобию/здоровье, DOUBLE_VOTE - х2 голос, STEAL - забрать чужой багаж, UPGRADE - починить/улучшить объект бункера). Промпт для фото сделай максимально простым и понятным (English).`, characterSchema);
  }
  
  if (action === "event") {
    return callAI(SYSTEM, `Сгенерируй событие и его исход. Ситуация: "${payload.situation}". Игрок: ${payload.player.nickname}. ${nsfw}.`, eventSchema);
  }
  
  if (action === "epilogue") {
    return callAI(SYSTEM, `Финал истории. Выжившие: ${JSON.stringify(payload.survivors)}. ${nsfw}.`, {
      type: "OBJECT",
      properties: { verdict: { type: "STRING" }, epilogue: { type: "STRING" } },
      required: ["verdict", "epilogue"]
    });
  }
}