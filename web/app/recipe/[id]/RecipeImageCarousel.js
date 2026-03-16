"use client";

import { useRef, useState } from "react";

export default function RecipeImageCarousel({ title, images }) {
  const safeImages = Array.isArray(images) ? images.filter(Boolean) : [];
  const [activeSlide, setActiveSlide] = useState(0);
  const scrollerRef = useRef(null);

  const onCarouselScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const width = scroller.clientWidth || 1;
    const nextIndex = Math.round(scroller.scrollLeft / width);
    setActiveSlide(Math.max(0, Math.min(nextIndex, safeImages.length - 1)));
  };

  const goToSlide = (index) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({
      left: index * scroller.clientWidth,
      behavior: "smooth"
    });
  };

  if (!safeImages.length) {
    return null;
  }

  return (
    <div className="detail-image-wrap">
      <div
        className="detail-image-carousel"
        ref={scrollerRef}
        onScroll={onCarouselScroll}
        aria-label={`${title} photos`}
      >
        {safeImages.map((image, index) => (
          <img
            key={`${title}-detail-photo-${index}`}
            src={image}
            alt={`${title} photo ${index + 1}`}
            className="detail-image"
          />
        ))}
      </div>

      {safeImages.length > 1 ? (
        <div className="detail-image-dots" aria-label="Photo pagination">
          {safeImages.map((_, index) => (
            <button
              key={`${title}-detail-dot-${index}`}
              type="button"
              className={`detail-image-dot${index === activeSlide ? " active" : ""}`}
              onClick={() => goToSlide(index)}
              aria-label={`View photo ${index + 1}`}
              aria-pressed={index === activeSlide}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
