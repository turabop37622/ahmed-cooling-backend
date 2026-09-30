'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function ScrollObserver() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      document.querySelectorAll('.scroll-reveal, .scroll-reveal-scale, .scroll-reveal-left, .scroll-reveal-right, .scroll-reveal-fade')
        .forEach((el) => el.classList.add('revealed'));
      return;
    }

    // Fallback if IntersectionObserver not supported
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.scroll-reveal, .scroll-reveal-scale, .scroll-reveal-left, .scroll-reveal-right, .scroll-reveal-fade')
        .forEach((el) => el.classList.add('revealed'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            // Unobserve once revealed for peak performance
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.08,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    const observeAll = () => {
      const elements = document.querySelectorAll(
        '.scroll-reveal:not(.revealed), .scroll-reveal-scale:not(.revealed), .scroll-reveal-left:not(.revealed), .scroll-reveal-right:not(.revealed), .scroll-reveal-fade:not(.revealed)'
      );
      elements.forEach((el) => observer.observe(el));
    };

    // Initial observation
    observeAll();

    // Re-check periodically in first 2 seconds for initial render/hydration settling
    const timer1 = setTimeout(observeAll, 150);
    const timer2 = setTimeout(observeAll, 600);

    // MutationObserver to automatically catch dynamic content (e.g. tabs change, API fetch)
    const mutationObserver = new MutationObserver(() => {
      observeAll();
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [pathname]);

  return null;
}
