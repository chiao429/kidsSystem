'use client';

import { useLayoutEffect, useRef } from 'react';

/** 單行標題：字級在 min～max 之間自動縮放到剛好放得下，不換行 */
export function FitTitle({ children, className, max = 56, min = 18 }: { children: string; className?: string; max?: number; min?: number }) {
  const el = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const fit = () => {
      node.style.fontSize = `${max}px`;
      const ratio = node.clientWidth / node.scrollWidth;
      if (ratio < 1) node.style.fontSize = `${Math.max(min, Math.floor(max * ratio))}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node.parentElement ?? node);
    // 圓體字型載入後寬度會變，再量一次
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, [children, max, min]);

  return (
    <h1 ref={el} className={className} style={{ whiteSpace: 'nowrap', fontSize: max }}>
      {children}
    </h1>
  );
}
