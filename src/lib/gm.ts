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

  const difficultyBalance = difficulty === "easy" 
    ? "СЛОЖНОСТЬ ЛЕГКАЯ: У персонажей должны быть в основном ПОЛОЖИТЕЛЬНЫЕ характеристики (отличное здоровье, полезные профессии, ценный багаж). Фобии должны быть легкими или забавными."
    : difficulty === "hard"
    ? "СЛОЖНОСТЬ ТЯЖЕЛАЯ: У персонажей должны быть в основном ОТРИЦАТЕЛЬНЫЕ характеристики (хронические болезни, бесполезные профессии, пустой багаж). Фобии должны быть серьезными и мешающими."
    : "СЛОЖНОСТЬ НОРМАЛЬНАЯ: Смешивай хорошие и плохие характеристики 50/50.";

  const system = `Ты — опытный Game Master выживательной игры «Бункер». 
${nsfwSystem}
${difficultyBalance}
ОБЯЗАТЕЛЬНО: Все тексты ТОЛЬКО НА РУССКОМ ЯЗЫКЕ. Отвечай ТОЛЬКО в формате JSON без пояснений.`;

  const user = `Создай полный сценарий для ${players.length} игроков. Сложность: ${difficulty}.
Игроки: ${players.map(p => p.nickname).join(", ")}.
Каждому игроку ровно ${cardsCount} спец-карты(ы).

ПРАВИЛА ДЛЯ ХАРАКТЕРИСТИК:
- gender_age: СТРОГОЕ РАЗНООБРАЗИЕ! Возраст от 18 до 75 лет. Не используй часто 28 лет. Разные возраста (23, 45, 62, 19, 37 и т.д.). Пол: Мужчина, Женщина, Небинарный (если уместно).
- profession: конкретная уникальная профессия, соответствующая возрасту.
- health: детальное состояние здоровья. Если легко — богатырское здоровье, если тяжело — инвалидность или болезни.
- phobia: конкретная странная фобия с деталями.
- baggage: конкретный предмет с объяснением почему он взят.
- hobby: необычное хобби с деталями.
- traits: 2-3 черты характера.
- special_cards типы: SPY, MUTATION, DOUBLE_VOTE, STEAL, UPGRADE.

ФОРМАТ JSON (точно такой):
{
  "catastrophe": {
    "name": "Название",
    "description": "Детальное описание угрозы",
    "image_prompt": "english cinematic apocalyptic scene description"
  },
  "bunker": {
    "capacity": 4,
    "food_months": 24,
    "stay_years": 2,
    "description": "Описание бункера",
    "objects": [
      {"name": "...", "description": "...", "status": "...", "action": "..."}
    ]
  },
  "characters": {
    ${players.map(p => `"${p.nickname}": {
      "gender_age": "Строка (Пол, Возраст)",
      "profession": "Строка",
      "health": "Строка",
      "phobia": "Строка",
      "baggage": "Строка",
      "hobby": "Строка",
      "traits": ["..."],
      "special_cards": [
        {"id": "sc_${p.nickname}_1", "type": "SPY", "title": "...", "description": "..."}
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