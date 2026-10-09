import { CheckInBoard } from '@/components/CheckInBoard';
import { requireSession } from '@kids/auth/next';
import { loadBoard } from '@/lib/board';

export default async function CheckInPage({ params }: { params: { eventId: string } }) {
  requireSession({ roles: ['admin', 'manager', 'staff'], eventId: params.eventId });
  const board = await loadBoard(params.eventId);
  return <CheckInBoard eventId={params.eventId} initial={board} registrationUrl={process.env.NEXT_PUBLIC_REGISTRATION_URL} />;
}
