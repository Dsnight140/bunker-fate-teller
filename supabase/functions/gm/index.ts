import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const MODEL = "google/gemini-2.5-flash";

async function callAI(systemPrompt: string, userPrompt: string, schema?: any) {
  const body: any = {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };
  if (schema) {
    body.tools = [{ type: "function", function: schema }];
    body.tool_choice = { type: "function", function: { name: schema.name } };
  }

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`AI ${r.status}: ${t}`);
  }
  const data = await r.json();
  if (schema) {
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    return JSON.parse(args);
  }
  return data.choices?.[0]?.message?.content;
}

// ---------- Schemas ----------
const catastropheSchema = {
  name: "create_scenario",
  description: "Сгенерировать катастрофу и параметры бункера",
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
          capacity: { type: "integer" },
          food_months: { type: "integer" },
          objects: { type: "array", items: { type: "string" } },
          description: { type: "string" },
        },
        required: ["capacity", "food_months", "objects", "description"],
      },
    },
    required: ["catastrophe", "bunker"],
  },
};

const characterSchema = {
  name: "create_character",
  description: "Сгенерировать персонажа для игры Бункер",
  parameters: {
    type: "object",
    properties: {
      gender_age: { type: "string", description: "Пол и возраст, например 'Мужчина, 34 года'" },
      profession: { type: "string", description: "Профессия + краткое пояснение" },
      health: { type: "string", description: "Состояние здоровья + пояснение простыми словами" },
      phobia: { type: "string", description: "Фобия + в чём проявляется" },
      baggage: { type: "string", description: "Один предмет багажа" },
      hobby: { type: "string", description: "Хобби" },
      traits: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 },
      ability: { type: "string", description: "Уникальная спец-способность" },
    },
    required: ["gender_age", "profession", "health", "phobia", "baggage", "hobby", "traits", "ability"],
  },
};

const eventSchema = {
  name: "resolve_event",
  description: "Создать случайное событие и разрешить его исход",
  parameters: {
    type: "object",
    properties: {
      difficulty: { type: "string", enum: ["легкое", "среднее", "сложное"] },
      situation: { type: "string", description: "Атмосферное описание события" },
      analysis: { type: "string", description: "Анализ карточки выбранного игрока" },
      outcome: { type: "string", enum: ["success", "fail", "death"] },
      narration: { type: "string", description: "Драматическое описание исхода" },
      effect: {
        type: "object",
        properties: {
          food_delta: { type: "integer" },
          health_change: { type: "string" },
          bunker_change: { type: "string" },
          player_dies: { type: "boolean" },
        },
        required: ["food_delta", "health_change", "bunker_change", "player_dies"],
      },
    },
    required: ["difficulty", "situation", "analysis", "outcome", "narration", "effect"],
  },
};

const epilogueSchema = {
  name: "write_epilogue",
  description: "Финальный вердикт и эпилог на 5 лет",
  parameters: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["survived", "perished"] },
      analysis: { type: "string", description: "Краткий анализ навыков выживших" },
      epilogue: { type: "string", description: "История жизни в бункере на 5 лет, с причинами смертей если необходимо. Атмосферно, мрачно." },
    },
    required: ["verdict", "analysis", "epilogue"],
  },
};

// ---------- Handler ----------
const SYSTEM = `Ты — Game Master игры «Бункер». Атмосферный, мрачный, лаконичный стиль. Только русский язык. Не принимай решения за игроков — только обрабатывай механику и описывай мир. Создавай разнообразных, неожиданных, иногда абсурдных персонажей. Профессии, хобби, фобии и способности должны быть креативными и провокационными для дебатов.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not set");
    const { action, payload } = await req.json();

    let result: any;

    if (action === "scenario") {
      result = await callAI(
        SYSTEM,
        `Сгенерируй катастрофу и параметры бункера для ${payload?.players ?? 6}-${(payload?.players ?? 6) + 2} игроков. Бункер: вместимость 50-70% от числа игроков, запасы еды 6-24 месяцев, 2 случайных уникальных объекта (могут быть и плохими, и хорошими).`,
        catastropheSchema
      );
    } else if (action === "character") {
      result = await callAI(
        SYSTEM,
        `Сгенерируй уникального персонажа. Контекст катастрофы: ${JSON.stringify(payload?.catastrophe ?? {})}. Избегай шаблонов. Ник игрока: ${payload?.nickname ?? "Игрок"}.`,
        characterSchema
      );
    } else if (action === "event") {
      const diff = payload?.difficulty ?? "среднее";
      result = await callAI(
        SYSTEM,
        `Сгенерируй событие в бункере (сложность: ${diff}). Выбран игрок ${payload?.player?.nickname}. Его полная карточка: ${JSON.stringify(payload?.player?.character)}. Состояние бункера: ${JSON.stringify(payload?.bunker)}. Проанализируй сильные/слабые стороны игрока и определи исход. Шанс смерти: лёгкое 5%, среднее 20%, сложное до 50%.`,
        eventSchema
      );
    } else if (action === "epilogue") {
      result = await callAI(
        SYSTEM,
        `Игра окончена. Выжившие в бункере: ${JSON.stringify(payload?.survivors)}. Бункер: ${JSON.stringify(payload?.bunker)}. Катастрофа: ${JSON.stringify(payload?.catastrophe)}. Проверь баланс навыков (нужны: врач/медик, инженер/техник, кто-то для пищи). Учти здоровье и фобии. Напиши вердикт и историю на 5 лет.`,
        epilogueSchema
      );
    } else {
      throw new Error("Unknown action");
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gm error:", e);
    const msg = e instanceof Error ? e.message : "Unknown";
    const status = msg.includes("429") ? 429 : msg.includes("402") ? 402 : 500;
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});