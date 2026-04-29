// GM implementation using Groq API (FREE, fast, generous limits - console.groq.com)
const GROQ_MODEL = "llama-3.3-70b-versatile"; // Smarter model for better content quality

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

// ─── BATCH START GAME ────────────────────────────────────────────────────────
export async function callGM_StartGame(payload: {
  players: { id: string; nickname: string }[];
  difficulty: string;
  nsfw: boolean;
}): Promise<{ scenario: any; characters: Record<string, any> }> {
  const { players, difficulty, nsfw } = payload;
  const cardsCount = difficulty === "easy" ? 4 : difficulty === "hard" ? 1 : 2;

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

ПРАВИЛА ДЛЯ ХАРАКТЕРИСТИК:
- gender_age: реалистичный пол и возраст (например "Женщина, 34 года")
- profession: конкретная уникальная профессия
- health: детальное состояние здоровья (не просто "хорошее")
- phobia: конкретная странная фобия с деталями
- baggage: конкретный предмет с объяснением почему он взят
- hobby: необычное хобби с деталями
- traits: 2-3 черты характера влияющие на выживание
- special_cards типы: SPY (узнать секрет), MUTATION (изменить здоровье), DOUBLE_VOTE (двойной голос), STEAL (обменяться багажом), UPGRADE (улучшить объект бункера)

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
    ${players.map(p => `"${p.nickname}": {
      "gender_age": "Женщина, 28 лет",
      "profession": "Уникальная профессия",
      "health": "Детальное состояние здоровья",
      "phobia": "Конкретная фобия с деталями",
      "baggage": "Конкретный предмет и причина",
      "hobby": "Необычное хобби с деталями",
      "traits": ["черта 1", "черта 2"],
      "special_cards": [
        {"id": "sc_${p.nickname}_1", "type": "SPY", "title": "Название карты", "description": "Описание эффекта"}
      ]
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