import Link from "next/link";
import { buildFilterOptions, fetchRecipes, filterRecipes } from "../lib/recipes";

export const dynamic = "force-dynamic";

function normalizeSearchParams(searchParams) {
  return {
    cuisine: typeof searchParams.cuisine === "string" ? searchParams.cuisine : "",
    dietary: typeof searchParams.dietary === "string" ? searchParams.dietary : "",
    occasion: typeof searchParams.occasion === "string" ? searchParams.occasion : ""
  };
}

export default async function HomePage({ searchParams }) {
  const filters = normalizeSearchParams(await searchParams);
  const recipes = await fetchRecipes();
  const options = buildFilterOptions(recipes);
  const visibleRecipes = filterRecipes(recipes, filters);

  return (
    <main className="container">
      <header className="hero">
        <h1>Neklyudov Family Recipes</h1>
        <p>Simple, searchable, and organized.</p>
      </header>

      <form className="filters" action="/" method="get">
        <label>
          Cuisine
          <select name="cuisine" defaultValue={filters.cuisine}>
            <option value="">All cuisines</option>
            {options.cuisines.map((cuisine) => (
              <option key={cuisine} value={cuisine}>
                {cuisine}
              </option>
            ))}
          </select>
        </label>

        <label>
          Dietary
          <select name="dietary" defaultValue={filters.dietary}>
            <option value="">All dietary</option>
            {options.dietary.map((dietary) => (
              <option key={dietary} value={dietary}>
                {dietary}
              </option>
            ))}
          </select>
        </label>

        <label>
          Occasion
          <select name="occasion" defaultValue={filters.occasion}>
            <option value="">All occasions</option>
            {options.occasions.map((occasion) => (
              <option key={occasion} value={occasion}>
                {occasion}
              </option>
            ))}
          </select>
        </label>

        <button type="submit">Apply</button>
        <Link href="/" className="reset-link">
          Reset
        </Link>
      </form>

      <section className="recipe-grid">
        {visibleRecipes.map((recipe) => (
          <article key={recipe.id} className="card">
            <Link href={`/recipe/${recipe.id}`} className="card-link">
              <div className="image-wrap">
                {recipe.image ? (
                  <img src={recipe.image} alt={recipe.title} loading="lazy" />
                ) : (
                  <div className="image-fallback">No image</div>
                )}
              </div>
              <div className="card-content">
                <h2>{recipe.title}</h2>
                {recipe.story ? <p>{recipe.story}</p> : null}
                <div className="meta">
                  <span>{recipe.author}</span>
                  <span>{recipe.cookingTime ? `${recipe.cookingTime} min` : "Time n/a"}</span>
                </div>
              </div>
            </Link>
          </article>
        ))}
      </section>

      {visibleRecipes.length === 0 ? (
        <p className="empty">No recipes match these filters.</p>
      ) : null}
    </main>
  );
}
