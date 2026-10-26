'use client';

import { useState, useTransition } from 'react';
import { Alert, Button, Card, Field, Input } from '@kids/ui';
import { onsiteFindFamily } from '@kids/registration-core/lib/actions';
import { RegisterForm } from '@kids/registration-core/components/RegisterForm';

type FormProps = Omit<React.ComponentProps<typeof RegisterForm>, 'mode' | 'source' | 'staff' | 'onsite' | 'initialPhone'>;

/**
 * 報到現場的現場報名：先輸入家長手機。
 * 查得到家庭 → 帶出孩子勾選加報；查不到 → 新家庭表單（手機已帶入）。
 */
export function OnsiteFlow({ formProps }: { formProps: FormProps }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<{ mode: 'new' | 'returning'; phone: string; name?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const find = () =>
    startTransition(async () => {
      setError('');
      const res = await onsiteFindFamily(phone);
      if (res.error) return setError(res.error);
      setStep({ mode: res.exists ? 'returning' : 'new', phone: res.phone!, name: res.name });
    });

  if (step) {
    return (
      <div className="space-y-4">
        <Alert tone="blue">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {step.mode === 'returning' ? `已有家庭資料：${step.name}（${step.phone}），勾選這次要報名的孩子。` : `${step.phone} 還沒有家庭資料，請填寫新家庭。`}
            </span>
            <button type="button" className="text-sm underline" onClick={() => setStep(null)}>
              換一支手機
            </button>
          </div>
        </Alert>
        <RegisterForm key={`${step.mode}-${step.phone}`} {...formProps} mode={step.mode} source="現場" staff onsite initialPhone={step.phone} />
      </div>
    );
  }

  return (
    <Card title="輸入家長手機">
      <div className="space-y-3">
        {error && <Alert>{error}</Alert>}
        <Field label="家長手機號碼" required hint="查得到家庭會直接帶出孩子資料；查不到就填新家庭">
          <Input
            inputMode="tel"
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && phone && find()}
          />
        </Field>
        <Button onClick={find} disabled={pending || !phone}>
          {pending ? '查詢中…' : '下一步'}
        </Button>
      </div>
    </Card>
  );
}
