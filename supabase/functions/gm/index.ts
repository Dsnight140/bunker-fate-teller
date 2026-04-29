import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
const MODEL = "gemini-1.5-flash";

async function callAI(systemPrompt: string, userPrompt: string, schema?: any) {
  // Добавляем инструкцию для JSON в промпт если есть schema
  let fullPrompt = userPrompt;
  if (schema) {
    fullPrompt = `Ответь ТОЛЬКО валидным JSON без markdown форматирования. ${userPrompt}`;
  }

  const body: any = {
    contents: [
      { role: "user", parts: [{ text: systemPrompt + "\n\n" + fullPrompt }] },
    ],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  };

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GOOGLE_API_KEY}`, {
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

  if (schema) {
    // Очищаем JSON от возможных markdown блоков
    const cleanJson = text?.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleanJson);
  }
  return text;
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
      gender_age: { type: "string", description: "Пол (преимущественно бисексуальной ориентации, с небольшими отклонениями) и возраст, например 'Мужчина (би), 34 года'" },
      profession: { type: "string", description: "Профессия + краткое пояснение" },
      health: { type: "string", description: "Состояние здоровья (менее смертельное)" },
      phobia: { type: "string", description: "Фобия" },
      baggage: { type: "string", description: "Один предмет багажа" },
      hobby: { type: "string", description: "Хобби" },
      traits: { type: "array", items: { type: "string" }, description: "Особенности характера (количество плохих зависит от сложности)" },
      abilities: { type: "array", items: { type: "string" }, description: "Две спец-способности из 5 доступных" },
      image_prompt: { type: "string", description: "Детальный промпт на английском для генерации реалистичного фото (портрета) этого персонажа. Опиши внешность, возраст, пол, одежду в стиле постапокалипсиса/бункера." },
    },
    required: ["gender_age", "profession", "health", "phobia", "baggage", "hobby", "traits", "abilities", "image_prompt"],
  },
};

const eventSituationSchema = {
  name: "create_situation",
  description: "Создать завязку события/угрозы для бункера",
  parameters: {
    type: "object",
    properties: {
      situation: { type: "string", description: "Атмосферное описание завязки. Например: 'Кто-то яростно стучит в шлюзовую дверь снаружи. Кого мы отправим на разведку?'" },
    },
    required: ["situation"],
  },
};

const eventSchema = {
  name: "resolve_event",
  description: "Разрешить исход уже произошедшего события на основе характеристик игрока",
  parameters: {
    type: "object",
    properties: {
      analysis: { type: "string", description: "Анализ: почему игрок справился или провалился, опираясь на его здоровье, возраст, профессию и черты." },
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
    required: ["analysis", "outcome", "narration", "effect"],
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
const SYSTEM = `Ты — Game Master игры «Бункер». Атмосферный, реалистичный, лаконичный стиль. Только русский язык. Не принимай решения за игроков — только обрабатывай механику и описывай мир. 
Создавай разнообразных, но реалистичных персонажей (избегай совсем нелепых абсурдных сочетаний, старайся соблюдать жизненную логику). Профессии, хобби, фобии и способности должны быть креативными и провокационными для дебатов, но возможными в реальном мире.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY not set");
    const { action, payload } = await req.json();

    let result: any;

    if (action === "scenario") {
      const diffInfo = payload?.difficulty === "hard" ? "Условия бункера очень плохие, мало еды." : payload?.difficulty === "easy" ? "Условия бункера хорошие, много еды." : "Условия бункера средние.";
      result = await callAI(
        SYSTEM,
        `Сгенерируй РЕАЛИСТИЧНУЮ катастрофу (экологическая, техногенная, эпидемия, война и т.п. Без пришельцев и магии) и параметры бункера для ${payload?.players ?? 6}-${(payload?.players ?? 6) + 2} игроков. Сложность: ${payload?.difficulty ?? "normal"}. ${diffInfo} Бункер: вместимость 50-70% от числа игроков, 2 случайных объекта.`,
        catastropheSchema
      );
    } else if (action === "character") {
      const diffInfo = payload?.difficulty === "hard" ? "Дай персонажу 3-4 плохие характеристики (здоровье, фобии, черты)." : payload?.difficulty === "easy" ? "Дай персонажу 1-2 плохие характеристики. Сделай карточку менее смертельной." : "Дай персонажу 2-3 плохие характеристики.";
      result = await callAI(
        SYSTEM,
        `Сгенерируй уникального персонажа. ${diffInfo} Пол и ориентация: преимущественно бисексуалы с небольшими отклонениями. 
        ВНИМАНИЕ НА ЛОГИКУ: возраст, профессия и здоровье должны быть связаны. Если персонаж старше 50 лет, он НЕ МОЖЕТ быть полностью здоровым (обязательно добавь возрастные заболевания, хронические болезни или проблемы с суставами/сердцем). Молодые могут иметь случайные травмы или болезни. 
        Выдай ровно ДВЕ спец-способности из этого списка 5 способностей: 1. Обмен любой своей характеристики с другим игроком. 2. Любовная связь (если один изгнан/убит, второй уходит за ним). 3. Узнать одну скрытую характеристику любого игрока. 4. Иммунитет к одному событию/катастрофе. 5. Украсть предмет из бункера. Ник игрока: ${payload?.nickname ?? "Игрок"}.`,
        characterSchema
      );
    } else if (action === "event_situation") {
      const diff = payload?.difficulty ?? "среднее";
      result = await callAI(
        SYSTEM,
        `Сгенерируй только завязку случайного события/угрозы для бункера (сложность: ${diff}). Опиши ситуацию, которая требует действий одного человека. Заверши фразой вроде "Кого отправим?" или "Кто возьмет на себя этот риск?". Состояние бункера: ${JSON.stringify(payload?.bunker)}.`,
        eventSituationSchema
      );
    } else if (action === "event") {
      const gameDiff = payload?.gameDifficulty ?? "normal";
      const lethality = gameDiff === "hard" ? "повышенная смертность" : gameDiff === "easy" ? "смертность минимальна (очень редко кто-то умирает)" : "средняя смертность";
      result = await callAI(
        SYSTEM,
        `Разреши исход события. Ситуация: "${payload?.situation}". Выбран игрок ${payload?.player?.nickname}. Его карточка: ${JSON.stringify(payload?.player?.character)}. Сложность игры: ${gameDiff} - ${lethality}. Проанализируй сильные и слабые стороны игрока (профессия, здоровье, возраст, предметы). В зависимости от них высчитай исход: успех, провал или смерть. Опиши последствия.`,
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