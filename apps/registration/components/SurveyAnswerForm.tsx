'use client';

import { useState, useTransition } from 'react';
import { Alert, Button, Card, Field, Input, Textarea } from '@kids/ui';
import type { Answers, Question } from '@kids/schema';
import { submitSurvey } from '@/lib/survey';

export function SurveyAnswerForm({ eventId, surveyId, questions }: { eventId: string; surveyId: string; questions: Question[] }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = (id: string, v: string | string[]) => setAnswers((a) => ({ ...a, [id]: v }));

  if (done) return <Alert tone="green">感謝您的填寫！</Alert>;

  return (
    <div className="space-y-4">
      {questions.map((q, i) => (
        <Card key={q.id}>
          <div className="mb-2 font-medium">
            {i + 1}. {q.title}
            {q.required && <span className="ml-0.5 text-red-500">*</span>}
          </div>
          {q.type === 'single' &&
            q.options?.map((o) => (
              <label key={o} className="flex items-center gap-2 py-1">
                <input type="radio" name={q.id} checked={answers[q.id] === o} onChange={() => set(q.id, o)} /> {o}
              </label>
            ))}
          {q.type === 'multi' &&
            q.options?.map((o) => {
              const cur = (answers[q.id] as string[] | undefined) ?? [];
              return (
                <label key={o} className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={cur.includes(o)}
                    onChange={(e) => set(q.id, e.target.checked ? [...cur, o] : cur.filter((x) => x !== o))}
                  />
                  {o}
                </label>
              );
            })}
          {q.type === 'rating' && (
            <div className="flex gap-2">
              {['1', '2', '3', '4', '5'].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set(q.id, n)}
                  className={`h-11 w-11 rounded-full border text-lg ${answers[q.id] === n ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          {q.type === 'text' && <Textarea rows={3} value={(answers[q.id] as string) ?? ''} onChange={(e) => set(q.id, e.target.value)} />}
        </Card>
      ))}
      <Card>
        <Field label="報名時的手機號碼（選填）" hint="填寫可讓主辦單位知道是哪個家庭的回覆">
          <Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </Card>
      {error && <Alert>{error}</Alert>}
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError('');
            const res = await submitSurvey(eventId, surveyId, answers, phone);
            if (res.error) setError(res.error);
            else setDone(true);
          })
        }
      >
        {pending ? '送出中…' : '送出'}
      </Button>
    </div>
  );
}
