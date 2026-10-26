'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card, Empty, Input } from '@kids/ui';
import { addMember, removeMember } from '@/lib/actions';

interface Kid {
  成員ID: string;
  姓名: string;
  年級: string;
  家長: string;
  電話: string;
  inGroup: boolean;
  目前小組: string;
}

/** 組員名單＋搜尋家庭資料的孩子（姓名、家長、電話）加入 */
export function MemberPicker({ groupId, kids }: { groupId: string; kids: Kid[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const members = kids.filter((k) => k.inGroup);
  const results = useMemo(() => {
    const s = q.trim();
    if (!s) return [];
    return kids.filter((k) => !k.inGroup && (k.姓名.includes(s) || k.家長.includes(s) || k.電話.includes(s))).slice(0, 30);
  }, [kids, q]);
  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setError('');
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <Card title={`組員（${members.length}）`}>
        {members.length === 0 ? (
          <Empty>還沒有組員</Empty>
        ) : (
          <div className="divide-y">
            {members.map((k) => (
              <div key={k.成員ID} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-semibold">{k.姓名}</span>
                <span className="text-sm text-gray-500">{k.年級}</span>
                <span className="text-sm text-gray-500">
                  {k.家長} {k.電話}
                </span>
                <Button size="sm" variant="ghost" className="ml-auto text-red-600" disabled={pending} onClick={() => run(() => removeMember(groupId, k.成員ID))}>
                  移出小組
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="加入組員">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋孩子姓名、家長或電話（只列出同基地的孩子）" />
        {q.trim() && results.length === 0 && <p className="mt-3 text-sm text-gray-500">沒有符合的孩子</p>}
        <div className="mt-2 divide-y">
          {results.map((k) => (
            <div key={k.成員ID} className="flex flex-wrap items-center gap-2 py-2">
              <span className="font-semibold">{k.姓名}</span>
              <span className="text-sm text-gray-500">{k.年級}</span>
              <span className="text-sm text-gray-500">
                {k.家長} {k.電話}
              </span>
              {k.目前小組 && <Badge tone="amber">目前在 {k.目前小組}</Badge>}
              <Button size="sm" className="ml-auto" disabled={pending} onClick={() => run(() => addMember(groupId, k.成員ID))}>
                {k.目前小組 ? '換到這個小組' : '加入'}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
