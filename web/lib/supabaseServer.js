import { createClient } from "@supabase/supabase-js";

function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getSupabaseServerClient() {
  const url = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false }
  });
}

export function getRecipesTableName() {
  return process.env.SUPABASE_RECIPES_TABLE || "recipes";
}
