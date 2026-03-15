"use client";

import { useMemo, useState } from "react";

function formatDate(isoDate) {
  try {
    return new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(isoDate));
  } catch {
    return "";
  }
}

export default function CommentsSection({ recipeId, initialComments, initialError }) {
  const [comments, setComments] = useState(initialComments || []);
  const [authorName, setAuthorName] = useState("");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(initialError || "");

  const canSubmit = useMemo(() => body.trim().length > 0 && !isSubmitting, [body, isSubmitting]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/recipes/${recipeId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorName, body })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to post comment.");
      }

      setComments((current) => [data.comment, ...current]);
      setBody("");
      setAuthorName("");
    } catch (submitError) {
      setError(submitError.message || "Failed to post comment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="comments-section">
      <h2>Comments</h2>
      <div className="comments-frame published-comments">
        <h3>Published comments</h3>
        <div className="comments-list">
          {comments.length ? (
            comments.map((comment) => (
              <article key={comment.id} className="comment-item">
                <div className="comment-head">
                  <strong>{comment.authorName || "Anonymous"}</strong>
                  <span>{formatDate(comment.createdAt)}</span>
                </div>
                <p>{comment.body}</p>
              </article>
            ))
          ) : (
            <p className="empty">No comments yet. Be the first to share feedback.</p>
          )}
        </div>
      </div>

      <div className="comments-frame comment-compose">
        <h3>Add a comment</h3>
        <p className="comments-note">No account needed. Share your thoughts, tweaks, or serving tips.</p>

        <form className="comment-form" onSubmit={handleSubmit}>
          <label>
            Name (optional)
            <input
              type="text"
              value={authorName}
              onChange={(event) => setAuthorName(event.target.value)}
              placeholder="Anonymous"
              maxLength={80}
            />
          </label>

          <label>
            Comment
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What did you think of this recipe?"
              rows={4}
              maxLength={1000}
              required
            />
          </label>

          <button type="submit" disabled={!canSubmit}>
            {isSubmitting ? "Posting..." : "Post comment"}
          </button>
        </form>

        {error ? <p className="comment-error">{error}</p> : null}
      </div>
    </section>
  );
}
