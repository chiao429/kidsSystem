'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MENU_PIN_KEY, withBase, type NavItem } from './components';

/** 左側選單的可展開群組（例如「系統設定」）；目前所在頁面屬於這個群組時自動展開 */
export function NavGroup({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const children = item.children ?? [];
  const active = children.some((c) => pathname === c.href || pathname.startsWith(`${c.href}/`));
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left font-medium text-white/85 transition hover:bg-white/15 hover:text-white"
      >
        {item.label}
        <span aria-hidden className={`text-xs transition-transform ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1 border-l border-white/25 pl-3 ml-5">
          {children.map((c) => {
            const current = pathname === c.href || pathname.startsWith(`${c.href}/`);
            return (
              <a
                key={c.href}
                href={withBase(c.href)}
                aria-current={current ? 'page' : undefined}
                className={`rounded-xl px-3 py-2 transition hover:bg-white/15 hover:text-white ${current ? 'bg-white/20 font-semibold text-white' : 'text-white/80'}`}
              >
                {c.label}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 主選單：漢堡按鈕，點開後由左側滑出完整選單（含系統設定群組、其他系統、改密碼、登出）。
 * 寬螢幕可以「固定在左側」一直顯示；固定與否由 html[data-menu-pinned] 決定，純 CSS 切換，不會閃爍。
 */
export function MobileMenu({ nav, systems, user, logoutAction, title }: { nav: NavItem[]; title?: string; systems: NavItem[]; user?: string; logoutAction?: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(true);
  const pathname = usePathname();
  // 換頁後收起選單
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => setPinned(document.documentElement.hasAttribute('data-menu-pinned')), []);
  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    setOpen(false);
    document.documentElement.toggleAttribute('data-menu-pinned', next);
    try {
      localStorage.setItem(MENU_PIN_KEY, next ? '1' : '0');
    } catch {
      // 無痕模式等無法儲存時，只在這次瀏覽有效
    }
  };
  const link = 'block rounded-xl px-4 py-3 font-medium text-white/85 hover:bg-white/15 hover:text-white';
  return (
    <div>
      <button
        type="button"
        aria-label={open ? '關閉選單' : '開啟選單'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-xl hover:bg-white/15 lg:[html[data-menu-pinned]_&]:hidden`}
      >
        <span className={`h-0.5 w-6 rounded bg-white transition ${open ? 'translate-y-2 rotate-45' : ''}`} />
        <span className={`h-0.5 w-6 rounded bg-white transition ${open ? 'opacity-0' : ''}`} />
        <span className={`h-0.5 w-6 rounded bg-white transition ${open ? '-translate-y-2 -rotate-45' : ''}`} />
      </button>
      {open && <div className={`fixed inset-0 z-40 bg-black/40 lg:[html[data-menu-pinned]_&]:hidden`} onClick={() => setOpen(false)} aria-hidden />}
      <nav
        className={`fixed inset-y-0 left-0 w-72 max-w-[85vw] flex-col overflow-y-auto bg-gradient-to-b from-[#5969ed] via-[#4c7cf0] to-[#20d1d3] px-4 py-5 text-sm text-white ${
          open ? 'z-50 flex shadow-2xl' : `z-40 hidden lg:[html[data-menu-pinned]_&]:flex`
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-1 px-2">
          <span className="text-lg font-extrabold">{title}</span>
          <div className="flex items-center">
            {/* 固定／收起只在寬螢幕有意義 */}
            <button
              type="button"
              onClick={togglePin}
              title={pinned ? '收起選單（改用漢堡按鈕開啟）' : '固定在左側'}
              className="hidden whitespace-nowrap rounded-xl px-2 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/15 hover:text-white lg:block"
            >
              {pinned ? '« 收起' : '固定在左側'}
            </button>
            <button
              type="button"
              aria-label="關閉選單"
              onClick={() => setOpen(false)}
              className={`flex h-9 w-9 items-center justify-center rounded-xl text-xl hover:bg-white/15 lg:[html[data-menu-pinned]_&]:hidden`}
            >
              ×
            </button>
          </div>
        </div>
        {user && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-white/15 px-3 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-sm font-bold text-[#315bc7]">{user.slice(0, 1)}</span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{user}</div>
              <div className="text-xs text-white/70">目前登入</div>
            </div>
          </div>
        )}
        {nav.map((n) =>
          n.children ? (
            <NavGroup key={n.label} item={n} />
          ) : (
            <a key={n.href} href={withBase(n.href)} className={link}>
              {n.label}
            </a>
          ),
        )}
        <div className="mt-3 border-t border-white/20 pt-3">
          {systems.length > 0 && <div className="px-4 pb-1 text-xs text-white/60">其他系統</div>}
          {systems.map((n) => (
            <a key={n.href} href={n.href} className={link}>
              {n.label}
            </a>
          ))}
          {systems.length > 0 && user && <div className="my-2 border-t border-white/20" />}
          {user && (
            <>
              <a href={withBase('/password')} className={link}>
                改密碼
              </a>
              <form action={logoutAction}>
                <button className={`${link} w-full text-left`}>登出</button>
              </form>
            </>
          )}
        </div>
      </nav>
    </div>
  );
}
