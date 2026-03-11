import { createComment, fetchCommentsByRecipeId } from "../../../../../lib/comments";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const comments = await fetchCommentsByRecipeId(String(id));
    return Response.json({ comments });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load comments." }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const comment = await createComment({
      recipeId: String(id),
      authorName: payload?.authorName || "",
      body: payload?.body || ""
    });

    return Response.json({ comment }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to create comment." }, { status: 400 });
  }
}
