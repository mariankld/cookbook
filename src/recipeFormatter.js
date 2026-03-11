import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const textModel = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
const transcribeModel =
  process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";

export async function transcribeAudio(buffer, fileName = "voice.ogg") {
  const response = await client.audio.transcriptions.create({
    file: new File([buffer], fileName, { type: "audio/ogg" }),
    model: transcribeModel
  });

  return response.text?.trim() || "";
}

export async function formatRecipeWithTags(rawInput, userLanguageHint = "auto") {
  const prompt = `
You are a structured recipe editor for a family cookbook website.

Input can be in Russian or English and may be incomplete or casual.
Your tasks:
1) Convert final output to English.
2) Normalize structure and wording while preserving intent.
3) Infer missing but obvious details only when safe, otherwise keep concise.
4) Create practical tags for filtering.
5) Return strict JSON only.

Output JSON schema:
{
  "title": "string",
  "story": "string",
  "ingredients": ["string", "..."],
  "instructions": ["string", "..."],
  "time_minutes": number,
  "servings": "string",
  "tags": {
    "cuisine": ["..."],
    "main_ingredients": ["..."],
    "meal_type": ["..."],
    "dietary": ["..."],
    "allergens": ["..."],
    "occasion": ["..."]
  },
  "source_language": "ru|en|mixed"
}

Rules:
- Keep ingredients and instructions concise and clear.
- If no story is provided, set story to "".
- If time is unknown, set time_minutes to 0.
- If servings unknown, set servings to "".
- Use lower-case tag values.
- Do not include markdown.
`;

  const completion = await client.chat.completions.create({
    model: textModel,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: `Language hint: ${userLanguageHint}\n\nRecipe input:\n${rawInput}`
      }
    ]
  });

  const content = completion.choices?.[0]?.message?.content || "{}";
  return JSON.parse(content);
}

export function renderRecipeForTelegram(recipe) {
  const ingredients = (recipe.ingredients || [])
    .map((line) => `- ${line}`)
    .join("\n");
  const instructions = (recipe.instructions || [])
    .map((line, idx) => `${idx + 1}. ${line}`)
    .join("\n");

  const tags = recipe.tags || {};
  const flatTags = [
    ...(tags.cuisine || []),
    ...(tags.main_ingredients || []),
    ...(tags.meal_type || []),
    ...(tags.dietary || []),
    ...(tags.allergens || []),
    ...(tags.occasion || [])
  ];

  return [
    `*${recipe.title || "Untitled Recipe"}*`,
    "",
    recipe.story ? `_${recipe.story}_` : "",
    recipe.story ? "" : "",
    "*Ingredients*",
    ingredients || "-",
    "",
    "*Instructions*",
    instructions || "-",
    "",
    `*Time:* ${recipe.time_minutes || 0} min`,
    `*Servings:* ${recipe.servings || "-"}`,
    `*Tags:* ${(flatTags.length ? flatTags.join(", ") : "-").replaceAll("_", " ")}`
  ]
    .filter(Boolean)
    .join("\n");
}
