import { createClient } from "@supabase/supabase-js";

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

function getStorageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET || "recipe-images";
}

function getRecipesTable() {
  return process.env.SUPABASE_RECIPES_TABLE || "recipes";
}

function inferFileExtension(filePath = "") {
  const clean = filePath.split("?")[0];
  const ext = clean.includes(".") ? clean.slice(clean.lastIndexOf(".") + 1).toLowerCase() : "";
  return ext || "jpg";
}

function inferContentType(extension) {
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "image/jpeg";
}

export async function uploadRecipeImage({ userId, fileId, filePath, buffer }) {
  const extension = inferFileExtension(filePath);
  const contentType = inferContentType(extension);
  const objectPath = `telegram/${userId}/${Date.now()}-${fileId}.${extension}`;
  const bucket = getStorageBucket();

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(objectPath, buffer, { contentType, upsert: false });

  if (uploadError) {
    throw new Error(`Supabase image upload failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return data?.publicUrl || "";
}

export async function saveRecipeToSupabase(payload) {
  const row = {
    submitted_by: payload.submittedBy || "",
    telegram_user_id: payload.telegramUserId || "",
    telegram_username: payload.telegramUsername || "",
    photo_url: payload.photoUrl || "",
    title: payload.title || "",
    story: payload.story || "",
    ingredients: payload.ingredients || [],
    instructions: payload.instructions || [],
    time_minutes: payload.timeMinutes || 0,
    servings: payload.servings || "",
    tags: payload.tags || {},
    source_language: payload.sourceLanguage || "",
    raw_input: payload.rawInput || ""
  };

  const { error } = await supabase.from(getRecipesTable()).insert(row);
  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }
}
