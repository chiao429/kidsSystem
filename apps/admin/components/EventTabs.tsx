'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabClass = 'relative -mb-px rounded-t-lg border-b-[3px] px-3 py-2 text-sm transition-colors';
const idleClass = 'border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900';
const activeClass = 'border-[#315bc7] bg-[#315bc7]/10 font-bold text-[#315bc7]';

/** 活動分頁：目前所在的分頁以藍色底線＋粗體標示；「更多」裡的分頁被選中時，標籤改顯示該分頁名稱 */
export function EventTabs({ base, tabs, more }: { base: string; tabs: string[][]; more: string[][] }) {
  const pathname = usePathname();
  const isActive = (path: string) => (path ? pathname === base + path || pathname.startsWith(`${base + path}/`) : pathname === base);
  const activeMore = more.find(([path]) => isActive(path));
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-gray-200">
      {tabs.map(([path, label]) => (
        <Link key={path} href={base + path} aria-current={isActive(path) ? 'page' : undefined} className={`${tabClass} ${isActive(path) ? activeClass : idleClass}`}>
          {label}
        </Link>
      ))}
      <details className="relative">
        <summary className={`${tabClass} ${activeMore ? activeClass : idleClass} cursor-pointer list-none`}>{activeMore ? activeMore[1] : '更多'} ▾</summary>
        <div className="absolute left-0 z-20 mt-1 min-w-32 rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
          {more.map(([path, label]) => (
            <Link
              key={path}
              href={base + path}
              aria-current={isActive(path) ? 'page' : undefined}
              className={`block rounded-lg px-3 py-2 text-sm ${isActive(path) ? 'bg-[#315bc7]/10 font-bold text-[#315bc7]' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              {label}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}
