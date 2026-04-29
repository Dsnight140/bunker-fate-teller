// Client-side GM implementation replacing Edge Function
const MODEL = "gemini-2.5-flash-lite";

async function callAI(systemPrompt: string, userPrompt: string, schema?: any, retries = 3): Promise<any> {
  const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
  if (!GOOGLE_API_KEY) throw new Error("VITE_GOOGLE_API_KEY not set in .env");

  const body: any = {
    contents: [
      { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] },
    ],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  };

  if (schema) {
    body.generationConfig.responseSchema = schema;
  }

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GOOGLE_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const t = await r.text();
      if ((r.status === 429 || r.status === 503) && retries > 0) {
        console.warn(`AI Error ${r.status}, retrying in 5s...`);
        await new Promise(res => setTimeout(res, 5000));
        return callAI(systemPrompt, userPrompt, schema, retries - 1);
      }
      throw new Error(`AI ${r.status}: ${t}`);
    }
    
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (schema) {
      const cleanJson = text?.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim() || "{}";
      return JSON.parse(cleanJson);
    }
    return text;
  } catch (e: any) {
    if (retries > 0 && e.message.includes("AI")) {
      throw e; // already handled
    } else if (retries > 0) {
      console.warn("Network error, retrying...", e);
      await new Promise(res => setTimeout(res, 5000));
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
        consequences: { type: "STRING" },
      },
      required: ["name", "description", "consequences"],
    },
    bunker: {
      type: "OBJECT",
      properties: {
        capacity: { type: "INTEGER" },
        food_months: { type: "INTEGER" },
        objects: { type: "ARRAY", items: { type: "STRING" } },
        description: { type: "STRING" },
      },
      required: ["capacity", "food_months", "objects", "description"],
    },
  },
  required: ["catastrophe", "bunker"],
};

const characterSchema = {
  type: "OBJECT",
  properties: {
    gender_age: { type: "STRING", description: "Пол и возраст, например 'Мужчина (би), 34 года'" },
    profession: { type: "STRING", description: "Профессия + краткое пояснение" },
    health: { type: "STRING", description: "Состояние здоровья" },
    phobia: { type: "STRING", description: "Фобия" },
    baggage: { type: "STRING", description: "Один предмет багажа" },
    hobby: { type: "STRING", description: "Хобби" },
    traits: { type: "ARRAY", items: { type: "STRING" }, description: "Особенности характера" },
    special_cards: { 
      type: "ARRAY", 
      items: { 
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          type: { type: "STRING", description: "Тип: HEAL, SWAP_HEALTH, REVEAL, STEAL_ITEM, REBOOT (перегенерировать черту)" },
          title: { type: "STRING", description: "Атмосферное название карты" },
          description: { type: "STRING", description: "Понятное описание действия" }
        },
        required: ["id", "type", "title", "description"]
      },
      description: "Список игровых карт способностей" 
    },
    image_prompt: { type: "STRING", description: "Детальный промпт на английском для генерации портрета. Опиши внешность, возраст, пол, одежду." },
  },
  required: ["gender_age", "profession", "health", "phobia", "baggage", "hobby", "traits", "special_cards", "image_prompt"],
};

const eventSituationSchema = {
  type: "OBJECT",
  properties: {
    situation: { type: "STRING", description: "Атмосферное описание завязки" },
  },
  required: ["situation"],
};

const eventSchema = {
  type: "OBJECT",
  properties: {
    analysis: { type: "STRING" },
    outcome: { type: "STRING", description: "Одно из: success, fail, death" },
    narration: { type: "STRING" },
    effect: {
      type: "OBJECT",
      properties: {
        food_delta: { type: "INTEGER" },
        health_change: { type: "STRING" },
        bunker_change: { type: "STRING" },
        player_dies: { type: "BOOLEAN" },
      },
      required: ["food_delta", "health_change", "bunker_change", "player_dies"],
    },
  },
  required: ["analysis", "outcome", "narration", "effect"],
};

const epilogueSchema = {
  type: "OBJECT",
  properties: {
    verdict: { type: "STRING", description: "Одно из: survived, perished" },
    analysis: { type: "STRING" },
    epilogue: { type: "STRING" },
  },
  required: ["verdict", "analysis", "epilogue"],
};

const SYSTEM = `Ты — Game Master игры «Бункер». Атмосферный, реалистичный, лаконичный стиль. Только русский язык. Не принимай решения за игроков — только обрабатывай механику и описывай мир. 
Создавай разнообразных, но реалистичных персонажей. Профессии, хобби, фобии должны быть креативными и провокационными для дебатов.`;

export async function callGM(action: string, payload: any = {}) {
  let result: any;

  if (action === "scenario") {
    const diffInfo = payload?.difficulty === "hard" ? "Условия бункера очень плохие, мало еды." : payload?.difficulty === "easy" ? "Условия бункера хорошие, много еды." : "Условия бункера средние.";
    result = await callAI(
      SYSTEM,
      `Сгенерируй РЕАЛИСТИЧНУЮ катастрофу (экологическая, техногенная, эпидемия, война и т.п. Без пришельцев и магии) и параметры бункера для ${payload?.players ?? 6}-${(payload?.players ?? 6) + 2} игроков. Сложность: ${payload?.difficulty ?? "normal"}. ${diffInfo} Бункер: вместимость 50-70% от числа игроков, 2 случайных объекта.`,
      catastropheSchema
    );
  } else if (action === "character") {
    const diff = payload?.difficulty ?? "normal";
    const cardsCount = diff === "easy" ? 3 : diff === "hard" ? 1 : 2;
    const diffInfo = diff === "hard" ? "Дай персонажу 3-4 плохие характеристики (здоровье, фобии, черты)." : diff === "easy" ? "Дай персонажу 1-2 плохие характеристики. Сделай карточку менее смертельной." : "Дай персонажу 2-3 плохие характеристики.";
    
    result = await callAI(
      SYSTEM,
      `Сгенерируй уникального персонажа. ${diffInfo} Пол и ориентация: преимущественно бисексуалы. 
      ВНИМАНИЕ НА ЛОГИКУ: возраст, профессия и здоровье должны быть связаны. Если персонаж старше 50 лет, он НЕ МОЖЕТ быть полностью здоровым. 
      Сгенерируй ровно ${cardsCount} карты способностей из типов: HEAL, SWAP_HEALTH, REVEAL, STEAL_ITEM, REBOOT. 
      Ник игрока: ${payload?.nickname ?? "Игрок"}.`,
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

  return result;
}