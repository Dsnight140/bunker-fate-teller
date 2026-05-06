import { serve } from "[https://deno.land/std@0.168.0/http/server.ts](https://deno.land/std@0.168.0/http/server.ts)";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
const MODEL = "gemini-1.5-flash";

async function callAI(systemPrompt: string, userPrompt: string, responseSchema?: any) {
  const body: any = {
    system_instruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      { role: "user", parts: [{ text: userPrompt }] },
    ],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 8192,
      // Включаем строгий режим JSON
      responseMimeType: "application/json",
      // Если передана схема, Gemini будет строго ей следовать
      responseSchema: responseSchema?.parameters 
    },
  };

  const r = await fetch(`[https://generativelanguage.googleapis.com/v1beta/models/$](https://generativelanguage.googleapis.com/v1beta/models/$){MODEL}:generateContent?key=${GOOGLE_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`AI ${r.status}: ${t}`);
  }
  
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) throw new Error("Модель вернула пустой ответ");

  try {
    // При responseMimeType: "application/json" блоки ```json не приходят
    return JSON.parse(text);
  } catch (e) {
    console.error("Ошибка парсинга JSON:", text);
    throw new Error("Ошибка в структуре данных ИИ");
  }
}

// ---------- Исправленные Schemas (формат для Gemini) ----------
// Gemini ожидает чистый JSON Schema объект в responseSchema

const catastropheSchema = {
  parameters: {
    type: "object",
    properties: {
      catastrophe: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          consequences: { type: "string" },
        },
        required: ["name", "description", "consequences"],
      },
      bunker: {
        type: "object",
        properties: {
          capacity: { type: "number" },
          food_months: { type: "number" },
          objects: { type: "array", items: { type: "string" } },
          description: { type: "string" },
        },
        required: ["capacity", "food_months", "objects", "description"],
      },
    },
    required: ["catastrophe", "bunker"],
  }
};

const characterSchema = {
  parameters: {
    type: "object",
    properties: {
      gender_age: { type: "string" },
      profession: { type: "string" },
      health: { type: "string" },
      phobia: { type: "string" },
      baggage: { type: "string" },
      hobby: { type: "string" },
      traits: { type: "array", items: { type: "string" } },
      ability: { type: "string" },
    },
    required: ["gender_age", "profession", "health", "phobia", "baggage", "hobby", "traits", "ability"],
  }
};

const eventSchema = {
  parameters: {
    type: "object",
    properties: {
      difficulty: { type: "string" },
      situation: { type: "string" },
      analysis: { type: "string" },
      outcome: { type: "string" },
      narration: { type: "string" },
      effect: {
        type: "object",
        properties: {
          food_delta: { type: "number" },
          health_change: { type: "string" },
          bunker_change: { type: "string" },
          player_dies: { type: "boolean" },
        },
        required: ["food_delta", "health_change", "bunker_change", "player_dies"],
      },
    },
    required: ["difficulty", "situation", "analysis", "outcome", "narration", "effect"],
  }
};

const epilogueSchema = {
  parameters: {
    type: "object",
    properties: {
      verdict: { type: "string" },
      analysis: { type: "string" },
      epilogue: { type: "string" },
    },
    required: ["verdict", "analysis", "epilogue"],
  }
};

// ---------- Handler ----------
const SYSTEM = `Ты — Game Master игры «Бункер». Твой стиль: мрачный, постапокалиптический, лаконичный. Только русский язык.
Твоя задача — генерировать данные строго по запросу. Давай сложные пояснения к медицинским или техническим терминам в скобках.
Если создаешь персонажа, делай его уникальным и противоречивым. На лёгкой сложности персонажи должны иметь полезные навыки и способности.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY not set");
    
    const body = await req.json();
    const { action, payload } = body;

    let result: any;

    // Используем system_instruction вместо склеивания строк для лучшего качества
    if (action === "scenario") {
      result = await callAI(
        SYSTEM,
        `Сгенерируй катастрофу и бункер для группы из ${payload?.players ?? 6} человек. Вместимость бункера должна быть меньше количества игроков (примерно на 30-40%).`,
        catastropheSchema
      );
    } else if (action === "character") {
      const ageRange = payload?.ageRange || "любой";
      const difficulty = payload?.difficulty || "среднее";
      result = await callAI(
        SYSTEM,
        `Создай персонажа. Возраст: ВСЕГДА генерируй разный возраст (18-75 лет), НЕ повторяй 28 и другие уже использованные числа. Варьируй между молодыми (18-25), средними (26-50) и старшими (51-75). Сложность: ${difficulty} (на лёгкой давай больше полезных способностей). Катастрофа: ${JSON.stringify(payload?.catastrophe)}. Ник: ${payload?.nickname}. Характеристики должны быть разнообразными. ЗАПОМНИ: каждый персонаж должен иметь УНИКАЛЬНЫЙ возраст!`,
        characterSchema
      );
    } else if (action === "event") {
      result = await callAI(
        SYSTEM,
        `Событие сложности ${payload?.difficulty || 'среднее'}. Игрок: ${JSON.stringify(payload?.player)}. Состояние ресурсов: ${JSON.stringify(payload?.bunker)}. На лёгкой сложности давай выживаемость 80-95%.`,
        eventSchema
      );
    } else if (action === "epilogue") {
      result = await callAI(
        SYSTEM,
        `ФИНАЛ. Выжившие: ${JSON.stringify(payload?.survivors)}. Ресурсы: ${JSON.stringify(payload?.bunker)}. Напиши итог их жизни.`,
        epilogueSchema
      );
    } else if (action === "save_game_state") {
      // Сохранение состояния игры
      result = {
        timestamp: new Date().toISOString(),
        game_id: payload?.game_id,
        players: payload?.players,
        events: payload?.events || [],
        current_bunker: payload?.bunker,
        catastrophe: payload?.catastrophe,
      };
    } else {
      throw new Error("Unknown action: " + action);
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("GM Engine Error:", e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});