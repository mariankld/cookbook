import { getRecipesTableName, getSupabaseServerClient } from "./supabaseServer";

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTagList(value) {
  return safeArray(value)
    .filter(Boolean)
    .map((tag) => String(tag).toLowerCase());
}

function flattenTags(tags) {
  if (!tags || typeof tags !== "object") {
    return [];
  }

  return [
    ...safeArray(tags.cuisine),
    ...safeArray(tags.main_ingredients),
    ...safeArray(tags.meal_type),
    ...safeArray(tags.dietary)
  ]
    .filter(Boolean)
    .map((tag) => String(tag).toLowerCase());
}

export function mapRecipe(row) {
  const tags = row.tags || {};
  const cuisineTags = normalizeTagList(tags.cuisine);
  const mealTypeTags = normalizeTagList(tags.meal_type);
  const dessertInCuisine = cuisineTags.includes("dessert");
  const tagGroups = {
    cuisine: cuisineTags.filter((tag) => tag !== "dessert"),
    dietary: normalizeTagList(tags.dietary),
    occasion: Array.from(
      new Set([
        ...mealTypeTags,
        ...(dessertInCuisine ? ["dessert"] : [])
      ])
    )
  };

  return {
    id: String(row.id),
    title: row.title || "Untitled recipe",
    story: row.story || "",
    image: row.photo_url || "",
    author: row.submitted_by || "Unknown",
    cookingTime: Number(row.time_minutes) || 0,
    servings: row.servings ? String(row.servings) : "",
    tags,
    tagGroups,
    flatTags: flattenTags(tags),
    ingredients: safeArray(row.ingredients),
    steps: safeArray(row.instructions)
  };
}

export async function fetchRecipes() {
  const supabase = getSupabaseServerClient();
  const table = getRecipesTableName();

  const { data, error } = await supabase
    .from(table)
    .select(
      "id, title, story, photo_url, submitted_by, time_minutes, servings, tags, ingredients, instructions"
    )
    .order("id", { ascending: false });

  if (error) {
    throw new Error(`Failed loading recipes: ${error.message}`);
  }

  return (data || []).map(mapRecipe);
}

export async function fetchRecipeById(id) {
  const supabase = getSupabaseServerClient();
  const table = getRecipesTableName();

  const { data, error } = await supabase
    .from(table)
    .select(
      "id, title, story, photo_url, submitted_by, time_minutes, servings, tags, ingredients, instructions"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed loading recipe: ${error.message}`);
  }

  return data ? mapRecipe(data) : null;
}

export function filterRecipes(recipes, filters) {
  return recipes.filter((recipe) => {
    const cuisineOk =
      !filters.cuisine || recipe.tagGroups.cuisine.includes(filters.cuisine.toLowerCase());
    const dietaryOk =
      !filters.dietary || recipe.tagGroups.dietary.includes(filters.dietary.toLowerCase());
    const occasionOk =
      !filters.occasion || recipe.tagGroups.occasion.includes(filters.occasion.toLowerCase());

    return cuisineOk && dietaryOk && occasionOk;
  });
}

export function buildFilterOptions(recipes) {
  const cuisines = new Set();
  const dietary = new Set();
  const occasions = new Set();

  for (const recipe of recipes) {
    for (const tag of recipe.tagGroups.cuisine) cuisines.add(tag);
    for (const tag of recipe.tagGroups.dietary) dietary.add(tag);
    for (const tag of recipe.tagGroups.occasion) occasions.add(tag);
  }

  return {
    cuisines: Array.from(cuisines).sort((a, b) => a.localeCompare(b)),
    dietary: Array.from(dietary).sort((a, b) => a.localeCompare(b)),
    occasions: Array.from(occasions).sort((a, b) => a.localeCompare(b))
  };
}
