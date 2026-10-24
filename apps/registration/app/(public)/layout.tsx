import { Shell } from '@kids/ui';

export const dynamic = 'force-dynamic';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell title="活動報名" brand="#315bc7" staffHome={null}>
      <div className="mx-auto max-w-2xl space-y-4">{children}</div>
    </Shell>
  );
}
