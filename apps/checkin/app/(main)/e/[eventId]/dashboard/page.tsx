import { Dashboard } from '@/components/Dashboard';
import { requireSession } from '@kids/auth/next';
import { loadBoard, loadSlots } from '@/lib/board';

export default async function DashboardPage({ params }: { params: { eventId: string } }) {
  requireSession({ roles: ['admin', 'manager', 'staff'], eventId: params.eventId });
  const [board, slots] = await Promise.all([loadBoard(params.eventId), loadSlots(params.eventId)]);
  return <Dashboard eventId={params.eventId} initial={board} initialSlots={slots} />;
}
