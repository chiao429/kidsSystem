import QRCode from 'qrcode';
import { notFound } from 'next/navigation';
import { Card, Empty, buttonClass, withBase } from '@kids/ui';
import { parseQuestions, type Answers } from '@kids/schema';
import { SurveyForm } from '@/components/SurveyForm';
import { getEvent } from '@/lib/events';
import { saveSurvey } from '@/lib/survey-actions';
import { surveyResponses, surveys } from '@/lib/tables';

export default async function SurveyDetailPage({ params }: { params: { eventId: string; surveyId: string } }) {
  const event = await getEvent(params.eventId);
  const survey = await surveys(event.活動ID).findById(params.surveyId);
  if (!survey) notFound();
  const questions = parseQuestions(survey.題目JSON);
  const responses = (await surveyResponses(event.活動ID).all())
    .filter((r) => r.問卷ID === survey.問卷ID)
    .map((r) => {
      try {
        return JSON.parse(r.答案JSON) as Answers;
      } catch {
        return {} as Answers;
      }
    });
  const base = (process.env.NEXT_PUBLIC_REGISTRATION_URL ?? '').replace(/\/+$/, '');
  const url = `${base}/e/${params.eventId}/survey/${survey.問卷ID}`;
  const qr = base ? await QRCode.toDataURL(url, { margin: 1, width: 200 }) : '';

  return (
    <>
      <Card title="填寫連結" actions={<a href={withBase(`/events/${params.eventId}/surveys/${survey.問卷ID}/export`)} className={buttonClass('secondary', 'sm')}>匯出回覆 CSV</a>}>
        <div className="flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="問卷 QR Code" className="h-32 w-32" />}
          <div className="space-y-1 text-sm">
            <a href={url} target="_blank" rel="noreferrer" className="break-all text-[#315bc7] underline">
              {url}
            </a>
            <p className="text-gray-500">狀態需為「開放」才能填寫。共 {responses.length} 份回覆。</p>
          </div>
        </div>
      </Card>

      <Card title="結果">
        {responses.length === 0 ? (
          <Empty>尚無回覆</Empty>
        ) : (
          <div className="space-y-5">
            {questions.map((q, i) => {
              const values = responses.map((r) => r[q.id]).filter((v) => v !== undefined);
              return (
                <div key={q.id}>
                  <div className="mb-1 font-medium">
                    {i + 1}. {q.title} <span className="text-sm font-normal text-gray-500">（{values.length} 人回答）</span>
                  </div>
                  {q.type === 'text' ? (
                    <ul className="list-inside list-disc space-y-0.5 text-sm text-gray-700">
                      {values.map((v, vi) => (
                        <li key={vi}>{String(v)}</li>
                      ))}
                    </ul>
                  ) : q.type === 'rating' ? (
                    <div className="text-sm">
                      平均 <span className="text-xl font-bold">{(values.reduce((s, v) => s + Number(v), 0) / (values.length || 1)).toFixed(1)}</span> / 5
                      <span className="ml-3 text-gray-500">
                        {[5, 4, 3, 2, 1].map((n) => `${n}分 ${values.filter((v) => v === String(n)).length}`).join('・')}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {(q.options ?? []).map((o) => {
                        const n = values.filter((v) => (Array.isArray(v) ? v.includes(o) : v === o)).length;
                        const pct = values.length ? Math.round((n / values.length) * 100) : 0;
                        return (
                          <div key={o} className="flex items-center gap-2 text-sm">
                            <span className="w-32 shrink-0 truncate">{o}</span>
                            <div className="h-3 flex-1 rounded bg-gray-100">
                              <div className="h-3 rounded bg-[#315bc7]" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-16 text-right tabular-nums">
                              {n}（{pct}%）
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="編輯問卷">
        <SurveyForm action={saveSurvey.bind(null, params.eventId, survey.問卷ID)} survey={survey} questions={questions} />
      </Card>
    </>
  );
}
