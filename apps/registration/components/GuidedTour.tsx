'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

export interface TourStep {
  /** 要標示的元素（data-tour 屬性值） */
  target: string;
  title: string;
  text: string;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;

/**
 * 報名教學：按下按鈕後依序標示頁面上的區塊（周圍變暗、目標挖空），
 * 旁邊顯示說明與「上一步／下一步／略過」。頁面上找不到的步驟會自動略過。
 */
export function GuidedTour({
  steps,
  label = '報名教學',
  finishText = '開始報名吧！',
}: {
  steps: TourStep[];
  /** 開始按鈕文字 */
  label?: string;
  /** 最後一步的按鈕文字 */
  finishText?: string;
}) {
  const [active, setActive] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const step = active?.[index];

  const measure = useCallback(() => {
    const el = step && document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) return setBox(null);
    const r = el.getBoundingClientRect();
    setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [step]);

  // 換步驟時把目標捲到畫面中間，捲動完再量位置
  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    measure();
    const t = window.setTimeout(measure, 450);
    return () => window.clearTimeout(t);
  }, [step, measure]);

  // 導覽結束（完成、略過、按 Esc 或點暗處）後回到頁面最上方
  const close = useCallback(() => {
    setActive(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, active.length - 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      window.removeEventListener('keydown', onKey);
    };
  }, [active, measure, close]);

  const start = () => {
    const available = steps.filter((s) => document.querySelector(`[data-tour="${s.target}"]`));
    if (available.length === 0) return;
    setIndex(0);
    setActive(available);
  };

  const last = !!active && index === active.length - 1;

  // 說明框放在目標下方；下方空間不夠時放上方
  const below = box ? box.top + box.height + 16 : 0;
  const placeAbove = !!box && typeof window !== 'undefined' && below + 220 > window.innerHeight && box.top > 240;

  return (
    <>
      <button type="button" className="rb-tour-start" onClick={start}>
        <span aria-hidden>🧭</span> {label}
      </button>
      {active && step && (
        <div className="rb-tour" role="dialog" aria-modal="true" aria-label={label}>
          {/* 目標以外的區域變暗（點暗處可結束） */}
          <div className="rb-tour-backdrop" onClick={close} />
          {box && <div className="rb-tour-spot" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />}
          <div
            className="rb-tour-tip"
            style={
              box
                ? placeAbove
                  ? { bottom: window.innerHeight - box.top + 16 }
                  : { top: Math.min(below, window.innerHeight - 200) }
                : { top: '30%' }
            }
          >
            <div className="rb-tour-progress">
              {active.map((s, i) => (
                <span key={s.target} className={i === index ? 'is-current' : i < index ? 'is-done' : ''} />
              ))}
            </div>
            <div className="rb-tour-step">
              步驟 {index + 1} / {active.length}
            </div>
            <h3 className="rb-tour-title">{step.title}</h3>
            <p className="rb-tour-text">{step.text}</p>
            <div className="rb-tour-actions">
              {last ? (
                <span />
              ) : (
                <button type="button" className="rb-tour-skip" onClick={close}>
                  略過
                </button>
              )}
              <div className="flex gap-2">
                {index > 0 && (
                  <button type="button" className="rb-tour-btn is-secondary" onClick={() => setIndex(index - 1)}>
                    上一步
                  </button>
                )}
                <button type="button" className="rb-tour-btn" onClick={() => (last ? close() : setIndex(index + 1))}>
                  {last ? finishText : '下一步'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
