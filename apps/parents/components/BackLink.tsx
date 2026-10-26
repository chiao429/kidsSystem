import Link from 'next/link';

/** 家長端子頁面上方的「回活動頁」（不用瀏覽器上一頁：從分享連結直接進來時也能回到活動頁） */
export function BackLink({ eventId }: { eventId: string }) {
  return (
    <Link href={`/e/${eventId}`} className="rb-back">
      <span aria-hidden>←</span> 回活動頁
    </Link>
  );
}
