// Client-side GM implementation with NSFW support and enhanced visuals
const MODEL = "gemini-1.5-flash";

async function callAI(systemPrompt: string, userPrompt: string, schema?: any, retries = 3): Promise<any> {
  const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
  if (!GOOGLE_API_KEY) throw new Error("VITE_GOOGLE_API_KEY not set in .env");

  const body: any = {
    contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
    generationConfig: {
      temperature: 1.0,
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
    if (!text) throw new Error("AI returned empty response");
    return schema ? JSON.parse(text?.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim() || "{}") : text;
  } catch (e: any) {
    if (retries > 0) {
      console.warn("Retrying AI call...", e);
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
        image_prompt: { type: "STRING" }
      },
      required: ["name", "description", "image_prompt"]
    },
    bunker: {
      type: "OBJECT",
      properties: {
        capacity: { type: "INTEGER" },
        food_months: { type: "INTEGER" },
        stay_years: { type: "INTEGER", description: "На сколько лет нужно укрыться" },
        objects: { 
          type: "ARRAY", 
          items: { 
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              description: { type: "STRING" },
              status: { type: "STRING" },
              action: { type: "STRING" }
            },
            required: ["name", "description", "status", "action"]
          }
        },
        description: { type: "STRING" }
      },
      required: ["capacity", "food_months", "stay_years", "objects", "description"]
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
          type: { type: "STRING" },
          title: { type: "STRING" },
          description: { type: "STRING" }
        },
        required: ["id", "type", "title", "description"]
      }
    },
    image_prompt: { type: "STRING" }
  },
  required: ["gender_age", "profession", "health", "phobia", "baggage", "hobby", "traits", "special_cards", "image_prompt"]
};

const eventSchema = {
  type: "OBJECT",
  properties: {
    situation: { type: "STRING" },
    image_prompt: { type: "STRING" },
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
  const nsfw = payload?.nsfw ? "ВКЛЮЧИ ТЕМЫ 18+: черный юмор, жестокий реализм, сексуальные отношения, интимные секреты, взрослые провокации, насилие и похоть. Сделай персонажей и события максимально откровенными и жесткими." : "Темы 18+ выключены.";
  
  if (action === "scenario") {
    return callAI(SYSTEM, `Создай катастрофу и бункер. ${nsfw}. Дай 6-8 интерактивных объекта. Срок пребывания в годах.`, catastropheSchema);
  }
  
  if (action === "character") {
    const diff = payload.difficulty || "normal";
    // Легче сложность -> больше карт
    const cardsCount = diff === "easy" ? 4 : diff === "hard" ? 1 : 2;
    return callAI(SYSTEM, `Персонаж для игры. ${nsfw}. Сгенерируй ${cardsCount} спец-карты. Промпт для фото: Simple English, person, face, portrait, cinematic light.`, characterSchema);
  }

  if (action === "event_situation") {
    return callAI(SYSTEM, `Сгенерируй ТОЛЬКО завязку события (JSON: { "situation": "...", "image_prompt": "..." }). ${nsfw}.`, {
        type: "OBJECT",
        properties: { situation: { type: "STRING" }, image_prompt: { type: "STRING" } },
        required: ["situation", "image_prompt"]
    });
  }
  
  if (action === "event") {
    return callAI(SYSTEM, `Разреши исход события. Ситуация: "${payload.situation}". Игрок: ${payload.player.nickname}. ${nsfw}.`, eventSchema);
  }
  
  if (action === "epilogue") {
    return callAI(SYSTEM, `Финал. Выжившие: ${JSON.stringify(payload.survivors)}. ${nsfw}.`, {
      type: "OBJECT",
      properties: { verdict: { type: "STRING" }, epilogue: { type: "STRING" } },
      required: ["verdict", "epilogue"]
    });
  }
}