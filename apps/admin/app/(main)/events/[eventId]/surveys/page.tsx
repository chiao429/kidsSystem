import Link from 'next/link';
import { Badge, Card, Empty, Table } from '@kids/ui';
import { SurveyForm } from '@/components/SurveyForm';
import { getEvent } from '@/lib/events';
import { saveSurvey } from '@/lib/survey-actions';
import { surveyResponses, surveys } from '@/lib/tables';

export default async function SurveysPage({ params }: { params: { eventId: string } }) {
  const event = await getEvent(params.eventId);
  const [list, responses] = await Promise.all([surveys(event.活動ID).all(), surveyResponses(event.活動ID).all()]);
  return (
    <>
      <Card title="問卷">
        {list.length === 0 ? (
          <Empty>尚無問卷</Empty>
        ) : (
          <Table head={['標題', '對象', '狀態', '回覆數', '']}>
            {list.map((s) => (
              <tr key={s.問卷ID}>
                <td className="px-2 py-2 font-medium">{s.標題}</td>
                <td className="px-2 py-2">{s.對象}</td>
                <td className="px-2 py-2">
                  <Badge tone={s.狀態 === '開放' ? 'green' : 'gray'}>{s.狀態}</Badge>
                </td>
                <td className="px-2 py-2 tabular-nums">{responses.filter((r) => r.問卷ID === s.問卷ID).length}</td>
                <td className="px-2 py-2 text-right">
                  <Link href={`/events/${params.eventId}/surveys/${s.問卷ID}`} className="text-purple-700 hover:underline">
                    編輯／結果
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title="新增問卷">
        <SurveyForm action={saveSurvey.bind(null, params.eventId, null)} />
      </Card>
    </>
  );
}
