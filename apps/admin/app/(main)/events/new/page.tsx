import { Card } from '@kids/ui';
import { requireSession } from '@kids/auth/next';
import { EventForm } from '@/components/EventForm';
import { createEvent } from '@/lib/event-actions';

export default function NewEventPage() {
  requireSession({ roles: ['admin'] });
  return (
    <Card title="新增活動">
      <EventForm action={createEvent} />
    </Card>
  );
}
