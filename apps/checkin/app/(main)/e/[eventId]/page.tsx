import { CheckInBoard } from '@/components/CheckInBoard';
import { requireSession } from '@kids/auth/next';
import { loadBoard } from '@/lib/board';

export default async function CheckInPage({ params, searchParams }: { params: { eventId: string }; searchParams: { checkin?: string } }) {
  requireSession({ permission: 'checkin', eventId: params.eventId });
  const board = await loadBoard(params.eventId);
  // 現場報名完成後帶回來的報名ID：進到看板就直接幫這些孩子報到
  const autoCheckIn = (searchParams.checkin ?? '').split(',').filter((id) => /^R-\d{8}-[A-Z0-9]{6}$/.test(id)).slice(0, 20);
  return <CheckInBoard eventId={params.eventId} initial={board} autoCheckIn={autoCheckIn} />;
}
