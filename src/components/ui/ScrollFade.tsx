import { cn } from "@/utils/cn";
import React, { useEffect, useRef, useState } from "react";

interface ScrollFadeProps {
  children: React.ReactNode;
  className?: string;
  /** Height of the gradient at each end, in px. */
  fadeSize?: number;
}

/**
 * Scrollable box that fades its content at whichever end has more to show, so
 * a long list reads as continuing rather than being cut off. Requires a
 * bounded height from its parent.
 */
export const ScrollFade: React.FC<ScrollFadeProps> = ({
  children,
  className,
  fadeSize = 20,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const EPSILON = 2; // px tolerance for sub-pixel noise

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const maxScrollable = scrollHeight - clientHeight;
      const hasOverflow = maxScrollable > EPSILON;

      setShowTop(hasOverflow && scrollTop > EPSILON);
      setShowBottom(hasOverflow && scrollTop < maxScrollable - EPSILON);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });

    // The list is filtered by search, so the content height changes without a
    // scroll or resize event.
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);

    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  return (
    <div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
      {showTop && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-sunken to-transparent"
          style={{ height: fadeSize }}
        />
      )}

      <div
        ref={ref}
        className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:thin]"
      >
        {children}
      </div>

      {showBottom && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-sunken to-transparent"
          style={{ height: fadeSize }}
        />
      )}
    </div>
  );
};
