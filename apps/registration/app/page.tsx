import { redirect } from 'next/navigation';

/** 同工端首頁：家長頁已拆到 apps/parents（家長網址），這裡直接到同工入口 */
export default function Home() {
  redirect('/staff');
}
