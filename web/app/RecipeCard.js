"use client";

import Link from "next/link";
import { useRef, useState } from "react";

export default function RecipeCard({ recipe }) {
  const images = Array.isArray(recipe.images) ? recipe.images.filter(Boolean) : [];
  const [activeSlide, setActiveSlide] = useState(0);
  const scrollerRef = useRef(null);

  const onCarouselScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const width = scroller.clientWidth || 1;
    const nextIndex = Math.round(scroller.scrollLeft / width);
    setActiveSlide(Math.max(0, Math.min(nextIndex, images.length - 1)));
  };

  const goToSlide = (index) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({
      left: index * scroller.clientWidth,
      behavior: "smooth"
    });
  };

  return (
    <article className="card">
      <div className="image-wrap">
        {images.length ? (
          <>
            <div
              className="image-carousel"
              ref={scrollerRef}
              onScroll={onCarouselScroll}
              aria-label={`${recipe.title} photos`}
            >
              {images.map((image, index) => (
                <img
                  key={`${recipe.id}-photo-${index}`}
                  src={image}
                  alt={`${recipe.title} photo ${index + 1}`}
                  loading="lazy"
                  className="image-slide"
                />
              ))}
            </div>

            {images.length > 1 ? (
              <div className="image-dots" aria-label="Photo pagination">
                {images.map((_, index) => (
                  <button
                    key={`${recipe.id}-dot-${index}`}
                    type="button"
                    className={`image-dot${index === activeSlide ? " active" : ""}`}
                    onClick={() => goToSlide(index)}
                    aria-label={`View photo ${index + 1}`}
                    aria-pressed={index === activeSlide}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="image-fallback">No image</div>
        )}
      </div>

      <Link href={`/recipe/${recipe.id}`} className="card-link">
        <div className="card-content">
          <h2>{recipe.title}</h2>
          <div className="meta">
            <span>{recipe.author}</span>
            <span>{recipe.cookingTime ? `${recipe.cookingTime} min` : "Time n/a"}</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
