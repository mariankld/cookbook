import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container">
      <h1>Recipe not found</h1>
      <p>The recipe may have been removed or the link is invalid.</p>
      <Link href="/" className="back-link">
        Back to recipes
      </Link>
    </main>
  );
}
