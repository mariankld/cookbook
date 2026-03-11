import { getSupabaseServerClient } from "./supabaseServer";

function getCommentsTableName() {
  return process.env.SUPABASE_COMMENTS_TABLE || "recipe_comments";
}

function normalizeComment(row) {
  return {
    id: String(row.id),
    recipeId: String(row.recipe_id),
    authorName: row.author_name || "Anonymous",
    body: row.body || "",
    createdAt: row.created_at || new Date().toISOString()
  };
}

export async function fetchCommentsByRecipeId(recipeId) {
  const supabase = getSupabaseServerClient();
  const table = getCommentsTableName();

  const { data, error } = await supabase
    .from(table)
    .select("id, recipe_id, author_name, body, created_at")
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed loading comments: ${error.message}`);
  }

  return (data || []).map(normalizeComment);
}

export async function createComment({ recipeId, authorName, body }) {
  const cleanAuthor = (authorName || "").trim() || "Anonymous";
  const cleanBody = (body || "").trim();

  if (!cleanBody) {
    throw new Error("Comment cannot be empty.");
  }

  if (cleanBody.length > 1000) {
    throw new Error("Comment is too long. Max 1000 characters.");
  }

  const supabase = getSupabaseServerClient();
  const table = getCommentsTableName();
  const payload = {
    recipe_id: recipeId,
    author_name: cleanAuthor.slice(0, 80),
    body: cleanBody
  };

  const { data, error } = await supabase
    .from(table)
    .insert(payload)
    .select("id, recipe_id, author_name, body, created_at")
    .single();

  if (error) {
    throw new Error(`Failed creating comment: ${error.message}`);
  }

  return normalizeComment(data);
}
