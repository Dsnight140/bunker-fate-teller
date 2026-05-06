// GM implementation using Groq API (FREE, fast, generous limits - console.groq.com)
const GROQ_MODEL = "llama-3.3-70b-versatile"; // Smarter model for better content quality

// Helper function to generate diverse ages
function generateDiverseAges(playerCount: number): string[] {
  const ageRanges = [
    "18-25", "26-35", "36-45", "46-55", "56-65", "66-75"
  ];
  const ages: string[] = [];
  for (let i = 0; i < playerCount; i++) {
    const rangeIdx = i % ageRanges.length;
    const range = ageRanges[rangeIdx];
    const [min, max] = range.split("-").map(Number);
    const age = Math.floor(Math.random() * (max - min + 1)) + min;
    ages.push(String(age));
  }
  return ages;
}

// Helper function to generate diverse age examples for prompt
function getAgeExamples(playerCount: number): string {
  const genders = ["Мужчина", "Женщина", "Небинарный человек"];
  const ages = generateDiverseAges(playerCount);
  return ages.map((age, idx) => `"${genders[idx % genders.length]}, ${age} лет"`).join(", ");
}

async function callAI(systemPrompt: string, userPrompt: string, retries = 3): Promise<any> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) throw new Error("Groq API ключ не найден. Добавьте VITE_GROQ_API_KEY в .env и Vercel.");

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
        temperature: 1.0,
        response_format: { type: "json_object" },
        max_tokens: 8000,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`AI Error ${res.status}: ${JSON.stringify(err)}`);
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Пустой ответ от AI");

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("AI не вернул JSON");
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

function simplifyText(value: any, maxWords = 18): any {
  if (typeof value !== "string") return value;
  const normalized = value.replace(/\s+/g, " ").trim();
  const words = normalized.split(" ").filter(Boolean);
  return words.slice(0, maxWords).join(" ").trim();
}

function normalizeCharacter(character: any) {
  if (!character || typeof character !== "object") return character;

  const rawStrengths = Array.isArray(character.strengths) ? character.strengths : [];
  const rawRisks = Array.isArray(character.risks) ? character.risks : [];
  const strengths = rawStrengths
    .map((t: string) => simplifyText(t, 10))
    .filter(Boolean);
  const risks = rawRisks
    .map((t: string) => simplifyText(t, 10))
    .filter(Boolean);

  // Enforce required ranges:
  // - 1..3 strengths
  // - 2..4 risks
  const normalizedStrengths =
    strengths.length >= 1 ? strengths.slice(0, 3) : ["Есть шанс помочь группе, но не всегда."];

  const normalizedRisks =
    risks.length >= 2 ? risks.slice(0, 4) : ["Большой риск для команды.", "Непредсказуемая угроза для выживания."].slice(0, 4);

  return {
    ...character,
    profession: simplifyText(character.profession),
    health: simplifyText(character.health),
    phobia: simplifyText(character.phobia),
    baggage: simplifyText(character.baggage),
    hobby: simplifyText(character.hobby),
    survival_skill: simplifyText(character.survival_skill),
    psychology: simplifyText(character.psychology),
    weakness: simplifyText(character.weakness),
    catastrophe_fit: simplifyText(character.catastrophe_fit, 24),
    traits: Array.isArray(character.traits)
      ? character.traits.map((t: string) => simplifyText(t, 10))
      : character.traits,
    strengths: normalizedStrengths,
    risks: normalizedRisks,
  };
}

// ─── BATCH START GAME ────────────────────────────────────────────────────────
export async function callGM_StartGame(payload: {
  players: { id: string; nickname: string }[];
  difficulty: string;
  nsfw: boolean;
}): Promise<{ scenario: any; characters: Record<string, any> }> {
  const { players, difficulty, nsfw } = payload;
  const cardsCount = difficulty === "easy" ? 4 : difficulty === "hard" ? 1 : 2;
  const targetCapacity = Math.max(1, Math.floor(players.length / 2));

  const nsfwSystem = nsfw
    ? `РЕЖИМ 18+: Ты работаешь в режиме для взрослых. Создавай персонажей с:
    - Сексуальными тайнами и странными фетишами как фобии/хобби
    - Пикантными профессиями (стриптизёр, секс-блогер, массажист с репутацией)
    - Интимными предметами в багаже (вибратор, эротическая литература, контрацептивы)
    - Неловкими или провокационными чертами характера
    - Спец-карты могут включать сексуальные сделки, шантаж интимными фото
    - События должны быть с сексуальным подтекстом, изменами, ревностью
    Не стесняйся, пиши откровенно и смело для взрослой аудитории.`
    : `Создавай умеренный семейный контент без 18+ тем.`;

  const system = `Ты — опытный Game Master выживательной игры «Бункер». 
${nsfwSystem}
ОБЯЗАТЕЛЬНО: Все тексты ТОЛЬКО НА РУССКОМ ЯЗЫКЕ. Отвечай ТОЛЬКО в формате JSON без пояснений.`;

  const user = `Создай полный сценарий для ${players.length} игроков. Сложность: ${difficulty}.
Игроки: ${players.map(p => p.nickname).join(", ")}.
Каждому игроку ровно ${cardsCount} спец-карты(ы).

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА ДЛЯ СЦЕНАРИЯ:
⚠️ Вместимость бункера ДОЛЖНА БЫТЬ ровно ${targetCapacity} (половина от ${players.length} игроков, округление вниз).

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА ДЛЯ ВОЗРАСТА И ПОЛА:
⚠️ ОСОБО ВАЖНО: Каждый персонаж ДОЛЖЕН ИМЕТЬ РАЗНЫЙ ВОЗРАСТ!
- Генерируй возраста в разных диапазонах: ${getAgeExamples(players.length)}
- НЕ ставь одинаковые возраста!
- НЕ повторяй числа (28, 30, и т.д. - они должны быть РАЗНЫМИ)
- Варьируй пол и возраст: молодой парень, средневозрастная женщина, пожилой мужчина и т.д.
- Возраст: от 18 до 75 лет, КАЖДЫЙ РАЗНЫЙ

ПРАВИЛА ДЛЯ ХАРАКТЕРИСТИК - КОНКРЕТИЗАЦИЯ ОБЯЗАТЕЛЬНА:
⚠️ ВСЕ ХАРАКТЕРИСТИКИ ДОЛЖНЫ БЫТЬ МАКСИМАЛЬНО КОНКРЕТНЫМИ И СПЕЦИФИЧНЫМИ!
⚠️ ХАРАКТЕРИСТИКИ НЕЗАВИСИМЫ - не связывай их между собой!
⚠️ РАНДОМИЗМ - КАЖДОЕ поле генерируется отдельно и случайно.
⚠️ ЗАПРЕЩЕНО связывать поля между собой: профессия НЕ должна автоматически влиять на багаж, хобби, здоровье, фобию и т.д.
⚠️ Делай возможные "нелогичные" сочетания. Это важно для баланса игры.
⚠️ Формулировки должны быть понятными и развернутыми: 8-18 слов на каждую характеристику.
⚠️ Избегай узкоспециализированного жаргона.
⚠️ У КАЖДОГО персонажа обязательно должны быть и плюсы, и минусы под текущую катастрофу.
⚠️ Для каждого персонажа верни два массива:
- strengths: 1-3 хорошие характеристики для этой катастрофы
- risks: 2-4 ужасные/опасные характеристики (риски) для этой катастрофы
⚠️ Остальные поля персонажа держи в "среднем" диапазоне: полезные с оговорками или нейтральные.

Примеры для ПРОФЕССИИ (конкретная специализация):
✅ ХОРОШИЕ: Врач (кардиолог), Инженер (специалист по ГИС), Учитель математики, Повар (шеф-повар), Программист (backend), Стоматолог, Психолог, Летчик
❌ ПЛОХИЕ: Уголовник с судимостью, Алкоголик в запое, Наркоман, Игрок с долгами, Безработный, Бродяга

Примеры для ЗДОРОВЬЯ (конкретное состояние + диагноз):
✅ ХОРОШИЕ: Отличная физическая форма (марафонец), Полностью здоров, В спортивной форме, Никогда не болел
❌ ПЛОХИЕ: Астма (приступы при физических нагрузках), Диабет 1 типа (нужен инсулин), Слепота на левый глаз, Паралич нижних конечностей, Туберкулез (заразен), Рак на поздней стадии, Гемофилия (свертываемость крови), Эпилепсия (частые приступы)

Примеры для ФОБИИ (конкретная иррациональная фобия):
✅ ПОЛЕЗНЫЕ: Фобия диких животных (не пойдет гулять в лес), Боязнь высоты (не полезет на крышу)
❌ ПЛОХИЕ/МЕШАЮЩИЕ: Агорафобия (боязнь открытых пространств, не выйдет из бункера), Клаустрофобия (боязнь тесных помещений, не переносит бункер), Арахнофобия (боязнь пауков - панический страх), Триффобия (боязнь отверстий - полный стресс), Номофобия (боязнь без телефона)

Примеры для ХОББИ (необычная деятельность):
✅ ПОЛЕЗНЫЕ: Легкая атлетика, Альпинизм, Выживание на природе, Оказание первой помощи, Стрелковый спорт
❌ ВРЕДНЫЕ: Наркотические вещества, Компьютерные игры по 12 часов, Азартные игры, Шопинг-зависимость, Сексуальные извращения

Примеры для БАГАЖА (конкретный физический предмет с назначением):
✅ ХОРОШИЕ: Спасательный жилет, Аптечка первой помощи, Складной нож, Компас, Фильтр воды, Армейский нож Swiss Army, Солнечная батарея
❌ ПЛОХИЕ: Кирпич (бесполезен), Старая книга, Плюшевая игрушка, Долговая расписка, Порнография, Наркотики, Ядовитое вещество

Примеры для ЧЕРТ ХАРАКТЕРА (влияние на выживание):
✅ ПЛЮС: Лидер, Аналитик, Очень осторожен, Харизматичен, Быстро принимает решения
❌ МИНУС: Коллекционер мусора, Психопат без эмпатии, Параноик, Наркоман, Садист, Трус в кризисе, Агрессивен к людям

АЛГОРИТМ РАНДОМИЗАЦИИ:
1. Каждое поле персонажа генерируй независимо (без логических связок).
2. strengths формируй как 1-3 пункта под катастрофу (плюсы).
3. risks формируй как 2-4 пункта под катастрофу (ужасные минусы/риски).
4. Остальные поля держи "в середине": полезно или нейтрально, без гарантированного эффекта спасения или гибели.
5. ЧЕРТЫ ХАРАКТЕРА - 3-4 пункта, смешай положительные и отрицательные.
6. Профессия, багаж, хобби, фобия, здоровье, выживание, психология - независимы друг от друга.

ФОРМАТ JSON (точно такой):
{
  "catastrophe": {
    "name": "Название",
    "description": "Детальное описание угрозы и последствий для человечества",
    "image_prompt": "english cinematic apocalyptic scene description for image generation"
  },
  "bunker": {
    "capacity": 4,
    "food_months": 24,
    "stay_years": 2,
    "description": "Детальное описание бункера, его истории и возможностей",
    "objects": [
      {"name": "Название", "description": "Описание и назначение", "status": "Исправен", "action": "Что можно сделать"},
      {"name": "Название2", "description": "Описание2", "status": "Требует ремонта", "action": "Действие2"},
      {"name": "Название3", "description": "Описание3", "status": "Исправен", "action": "Действие3"},
      {"name": "Название4", "description": "Описание4", "status": "Сломан", "action": "Действие4"},
      {"name": "Название5", "description": "Описание5", "status": "Исправен", "action": "Действие5"},
      {"name": "Название6", "description": "Описание6", "status": "Частично работает", "action": "Действие6"}
    ]
  },
  "characters": {
    ${players.map((p, idx) => {
      const ages = generateDiverseAges(players.length);
      const genders = ["Мужчина", "Женщина", "Небинарный человек"];
      const exampleGender = genders[idx % genders.length];
      const exampleAge = ages[idx];
      return `"${p.nickname}": {
      "gender_age": "${exampleGender}, ${exampleAge} лет",
      "profession": "Конкретная специализация (примеры: кардиолог, backend-разработчик, профессиональный пилот или уголовник с судимостью)",
      "health": "Конкретный диагноз (примеры: астма с приступами, отличная физформа, диабет 1 типа, полностью здоров, рак, слепота на левый глаз)",
      "phobia": "Конкретная иррациональная фобия (примеры: агорафобия, клаустрофобия, триффобия, боязнь высоты, арахнофобия)",
      "baggage": "Конкретный предмет с функцией (примеры: спасательный жилет, аптечка первой помощи, компас, кирпич, долговая расписка, наркотики)",
      "hobby": "Конкретное хобби с деталями (примеры: легкая атлетика, альпинизм, компьютерные игры 12ч в день, наркотические вещества, выживание на природе)",
      "survival_skill": "Навык выживания в практике и опыте",
      "psychology": "Психологическая устойчивость в кризисе",
      "weakness": "Личная слабость, мешающая группе",
      "catastrophe_fit": "Кратко: как персонаж влияет именно на выживание при этой катастрофе",
      "traits": ["черта 1 (положительная или отрицательная)", "черта 2", "черта 3", "черта 4"],
      "strengths": ["сильная сторона 1 для катастрофы", "сильная сторона 2 для катастрофы", "сильная сторона 3 (может отсутствовать)"],
      "risks": ["риск 1 для катастрофы", "риск 2 для катастрофы", "риск 3 (может отсутствовать)", "риск 4 (может отсутствовать)"],
      "special_cards": [
        {"id": "sc_${p.nickname}_1", "type": "SPY", "title": "Название карты", "description": "Описание эффекта"}
      ]
    }`;
    }).join(",\n    ")}
  }
}`;

  const result = await callAI(system, user);

  const charactersByPlayerId: Record<string, any> = {};
  for (const player of players) {
    charactersByPlayerId[player.id] = normalizeCharacter(result.characters?.[player.nickname] || null);
  }

  const bunker = {
    ...result.bunker,
    capacity: targetCapacity,
  };

  return { scenario: { catastrophe: result.catastrophe, bunker }, characters: charactersByPlayerId };
}

// ─── EVENTS & EPILOGUE ───────────────────────────────────────────────────────
export async function callGM(action: string, payload: any = {}): Promise<any> {
  const nsfw = payload?.nsfw;

  const nsfwSystem = nsfw
    ? `РЕЖИМ 18+: Создавай события с сексуальным подтекстом, изменами, шантажом, ревностью, интимными конфликтами. Будь откровенен.`
    : `Умеренный контент без 18+ тем.`;

  const system = `Ты — Game Master игры «Бункер». ${nsfwSystem} Все тексты ТОЛЬКО НА РУССКОМ ЯЗЫКЕ. Отвечай ТОЛЬКО в формате JSON.`;

  if (action === "event_situation") {
    return callAI(system, `Придумай неожиданную чрезвычайную ситуацию в бункере. Она должна быть интересной и создавать моральную дилемму.
JSON: { "situation": "Детальное описание ситуации и угрозы (2-4 предложения)", "image_prompt": "dramatic underground scene, cinematic lighting, tension" }`);
  }

  if (action === "event") {
    return callAI(system, `Разреши событие в бункере.
Ситуация: "${payload.situation}"
Выбранный участник: ${payload.player?.nickname}
Характеристики участника: ${JSON.stringify(payload.player?.character || {})}

Определи исход. Учитывай характеристики игрока при формировании нарратива.
JSON: {
  "narration": "Детальное описание того что произошло (3-5 предложений, атмосферно и захватывающе)",
  "effect": {
    "food_delta": -2,
    "player_dies": false,
    "bunker_change": "Что изменилось в бункере"
  }
}`);
  }

  if (action === "epilogue") {
    return callAI(system, `Напиши эпичный финальный эпилог для игры Бункер.
Выжившие: ${JSON.stringify(payload.survivors?.map((p: any) => ({ name: p.nickname, character: p.character })))}.
Катастрофа: ${JSON.stringify(payload.catastrophe)}.

Напиши захватывающий эпилог о том как они прожили в бункере и что случилось потом.
JSON: { "verdict": "survived", "epilogue": "Длинный атмосферный финальный текст (5-8 предложений)" }`);
  }

  throw new Error(`Unknown GM action: ${action}`);
}