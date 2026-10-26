'use client';

import { useState, useTransition } from 'react';
import { Alert, Button, Card, Field, Input } from '@kids/ui';
import { familyLogin, familySetPin, familySignOut, familyVerifyChild } from '@/lib/actions';

type Step = 'login' | 'birthday' | 'setPin';

const pinInput = { inputMode: 'numeric' as const, autoComplete: 'off', maxLength: 4, pattern: '\\d{4}', type: 'password' as const };
const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

/**
 * 「家長登入」：：手機＋4 位數 PIN。
 * 忘記 PIN 或還沒設定（舊資料）→ 用任一位孩子的全名＋生日驗證 → 設定新 PIN。
 * remembered：這台裝置記住的家庭，可直接繼續。
 */
export function FamilyLogin({ remembered, onVerified }: { remembered?: { name: string; phone: string }; onVerified: () => void }) {
  const [step, setStep] = useState<Step>('login');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [childName, setChildName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showRemembered, setShowRemembered] = useState(!!remembered);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok?: boolean; error?: string; needsSetup?: boolean }>, next?: Step) =>
    startTransition(async () => {
      setError('');
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? '驗證失敗');
        if (res.needsSetup) {
          setNotice(res.error ?? '');
          setError('');
          setStep('birthday');
        }
        return;
      }
      if (next) {
        setStep(next);
        setNotice('');
      } else onVerified();
    });

  if (showRemembered && remembered) {
    return (
      <Card title="歡迎回來">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            這台裝置記得 <span className="font-semibold">{remembered.name}</span>（{remembered.phone}）的家庭資料。
          </p>
          <div className="flex flex-wrap gap-2" data-tour="login-remembered">
            <Button onClick={onVerified}>以這個家庭繼續報名</Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await familySignOut();
                  setShowRemembered(false);
                })
              }
            >
              不是我，換一支手機
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const rememberBox = (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
      記住這台裝置（90 天內不用再輸入 PIN；共用電腦請不要勾）
    </label>
  );

  return (
    <Card title={step === 'login' ? '輸入手機與 PIN' : step === 'birthday' ? '驗證孩子的資料' : '設定新的 PIN'}>
      <div className="space-y-4">
        {notice && <Alert tone="blue">{notice}</Alert>}
        {error && <Alert>{error}</Alert>}

        {step === 'login' && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => familyLogin(phone, pin, remember));
            }}
          >
            <div data-tour="login-phone">
              <Field label="家長手機號碼" required>
                <Input inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </Field>
            </div>
            <div data-tour="login-pin">
              <Field label="PIN（4 位數字）" hint="初次報名時設定的 PIN" required>
                <Input {...pinInput} value={pin} onChange={(e) => setPin(digits(e.target.value))} required />
              </Field>
            </div>
            <div data-tour="login-remember">{rememberBox}</div>
            <div className="flex flex-wrap items-center gap-3" data-tour="login-submit">
              <Button type="submit" disabled={pending || !phone || pin.length !== 4}>
                {pending ? '驗證中…' : '送出'}
              </Button>
              <button
                type="button"
                className="text-sm text-gray-600 underline"
                onClick={() => {
                  setError('');
                  setNotice('');
                  setStep('birthday');
                }}
              >
                忘記 PIN／還沒設定過 PIN
              </button>
            </div>
          </form>
        )}

        {step === 'birthday' && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => familyVerifyChild(phone, childName, birthday), 'setPin');
            }}
          >
            <p className="text-sm text-gray-600">輸入家長手機，以及任何一位曾經報名過的孩子的全名與生日，驗證後就能設定新的 PIN。</p>
            <Field label="家長手機號碼" required>
              <Input inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </Field>
            <Field label="孩子的全名" hint="和當初報名時填的一樣" required>
              <Input value={childName} onChange={(e) => setChildName(e.target.value)} required />
            </Field>
            <Field label="孩子的生日" required>
              <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} required />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={pending || !phone || !childName || !birthday}>
                {pending ? '驗證中…' : '驗證'}
              </Button>
              <button type="button" className="text-sm text-gray-600 underline" onClick={() => setStep('login')}>
                返回用 PIN 登入
              </button>
            </div>
          </form>
        )}

        {step === 'setPin' && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => familySetPin(pin, confirm, remember));
            }}
          >
            <p className="text-sm text-gray-600">驗證成功！請設定 4 位數字的 PIN，下次報名時用手機＋PIN 就能帶入資料。</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="新的 PIN" required>
                <Input {...pinInput} value={pin} onChange={(e) => setPin(digits(e.target.value))} required />
              </Field>
              <Field label="再輸入一次" required>
                <Input {...pinInput} value={confirm} onChange={(e) => setConfirm(digits(e.target.value))} required />
              </Field>
            </div>
            {rememberBox}
            <Button type="submit" disabled={pending || pin.length !== 4 || confirm.length !== 4}>
              {pending ? '儲存中…' : '設定 PIN 並帶入資料'}
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}
