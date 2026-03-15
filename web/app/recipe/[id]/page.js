import Link from "next/link";
import { notFound } from "next/navigation";
import CommentsSection from "./CommentsSection";
import { fetchCommentsByRecipeId } from "../../../lib/comments";
import { fetchRecipeById } from "../../../lib/recipes";

export const dynamic = "force-dynamic";

function buildRecipeDetailData(recipe) {
  const story = recipe.story?.trim() || "";
  const servings = recipe.servings?.trim() || "n/a";
  const notes = story || "n/a";

  return {
    time: recipe.cookingTime ? `${recipe.cookingTime} min` : "n/a",
    servings,
    estimatedCalories: "250 kcal",
    caloriesConfidence: "medium",
    notes,
    tags: recipe.flatTags?.length ? recipe.flatTags.join(", ") : "n/a"
  };
}

export default async function RecipePage({ params }) {
  const { id } = await params;
  const recipeId = String(id);
  const recipe = await fetchRecipeById(recipeId);

  if (!recipe) {
    notFound();
  }
  const detailData = buildRecipeDetailData(recipe);

  let initialComments = [];
  let commentsError = "";
  try {
    initialComments = await fetchCommentsByRecipeId(recipeId);
  } catch (error) {
    commentsError = "Comments are temporarily unavailable.";
  }

  return (
    <main className="container recipe-page">
      <Link href="/" className="back-link">
        Back to recipes
      </Link>

      <article className="recipe-detail">
        <header>
          <h1>{recipe.title}</h1>
          <div className="meta">
            <span>{recipe.author}</span>
            <span>{recipe.cookingTime ? `${recipe.cookingTime} min` : "Time n/a"}</span>
          </div>
        </header>

        {recipe.image ? <img src={recipe.image} alt={recipe.title} className="detail-image" /> : null}

        <section className="detail-grid">
          <div>
            <h2>Ingredients</h2>
            <ul>
              {recipe.ingredients.length ? (
                recipe.ingredients.map((ingredient, index) => <li key={`${ingredient}-${index}`}>{ingredient}</li>)
              ) : (
                <li>No ingredients available.</li>
              )}
            </ul>
          </div>

          <div>
            <h2>Steps</h2>
            <ol>
              {recipe.steps.length ? (
                recipe.steps.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)
              ) : (
                <li>No steps available.</li>
              )}
            </ol>
          </div>
        </section>

        <section className="recipe-extra">
          <h2>Details</h2>
          <p>Time: {detailData.time}</p>
          <p>Servings: {detailData.servings}</p>
          <p>Estimated calories (per serving): {detailData.estimatedCalories}</p>
          <p>Calories confidence: {detailData.caloriesConfidence}</p>
          <p className="extra-notes">Notes: {detailData.notes}</p>
          <p className="extra-tags">Tags: {detailData.tags}</p>
        </section>
      </article>

      <CommentsSection
        recipeId={recipeId}
        initialComments={initialComments}
        initialError={commentsError}
      />
    </main>
  );
}
