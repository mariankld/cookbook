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

export async function formatRecipeWithTags(rawInput, userLanguageHint = "auto", photoUrl = "") {
  const prompt = `
You are a structured recipe editor for a family cookbook website.

Input can be in Russian or English and may be incomplete or casual.
You may also receive a dish photo.
Your tasks:
1) Convert final output to English.
2) Normalize structure and wording while preserving intent.
3) Infer missing but obvious details only when safe, otherwise keep concise.
4) Infer likely "implicit" ingredients when appropriate from recipe + photo context (for example oil used for frying), and keep them separate from explicitly provided ingredients.
5) Estimate calories per serving.
6) Create practical tags for filtering, including dietary tags inferred from ingredients and cooking method.
7) Return strict JSON only.

Output JSON schema:
{
  "title": "string",
  "story": "string",
  "ingredients": ["string", "..."],
  "inferred_ingredients": ["string", "..."],
  "instructions": ["string", "..."],
  "time_minutes": number,
  "servings": "string",
  "nutrition": {
    "estimated_calories_per_serving": number,
    "calorie_estimation_confidence": "low|medium|high"
  },
  "tags": {
    "cuisine": ["..."],
    "main_ingredients": ["..."],
    "meal_type": ["..."],
    "dietary": ["..."]
  },
  "source_language": "ru|en|mixed"
}

Rules:
- Keep ingredients and instructions concise and clear.
- If no story is provided, set story to "".
- If time is unknown, set time_minutes to 0.
- If servings unknown, set servings to "".
- If inferred ingredients are uncertain, include only high-confidence items.
- Calorie values must be integers; use 0 only when impossible to estimate.
- Set calorie_estimation_confidence to low, medium, or high.
- For dietary tags, infer values such as vegetarian, vegan, gluten-free, dairy-free, and low-calory where appropriate.
- Keep tags limited to these filtering categories only: cuisine, dietary, meal_type, main_ingredients.
- Use lower-case tag values.
- Do not include markdown.
`;

  const userContent = [
    {
      type: "text",
      text: `Language hint: ${userLanguageHint}\n\nRecipe input:\n${rawInput}`
    }
  ];
  if (photoUrl) {
    userContent.push({
      type: "image_url",
      image_url: { url: photoUrl }
    });
  }

  const completion = await client.chat.completions.create({
    model: textModel,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: userContent }
    ]
  });

  const content = completion.choices?.[0]?.message?.content || "{}";
  return JSON.parse(content);
}

export function renderRecipeForTelegram(recipe) {
  const ingredients = (recipe.ingredients || [])
    .map((line) => `- ${line}`)
    .join("\n");
  const inferredIngredients = (recipe.inferred_ingredients || [])
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
    ...(tags.dietary || [])
  ];
  const nutrition = recipe.nutrition || {};

  return [
    `*${recipe.title || "Untitled Recipe"}*`,
    "",
    recipe.story ? `_${recipe.story}_` : "",
    recipe.story ? "" : "",
    "*Ingredients*",
    ingredients || "-",
    "",
    "*Inferred ingredients*",
    inferredIngredients || "-",
    "",
    "*Instructions*",
    instructions || "-",
    "",
    `*Time:* ${recipe.time_minutes || 0} min`,
    `*Servings:* ${recipe.servings || "-"}`,
    `*Estimated calories (per serving):* ${nutrition.estimated_calories_per_serving || 0} kcal`,
    `*Calories confidence:* ${nutrition.calorie_estimation_confidence || "-"}`,
    `*Tags:* ${(flatTags.length ? flatTags.join(", ") : "-").replaceAll("_", " ")}`
  ]
    .filter(Boolean)
    .join("\n");
}
