import { notFound } from 'next/navigation';
import { Alert } from '@kids/ui';
import { SurveyAnswerForm } from '@/components/SurveyAnswerForm';
import { loadSurvey } from '@/lib/survey-data';
import { BackLink } from '@/components/BackLink';

export default async function SurveyPage({ params }: { params: { eventId: string; surveyId: string } }) {
  const data = await loadSurvey(params.eventId, params.surveyId);
  if (!data) notFound();
  return (
    <>
      <BackLink eventId={params.eventId} />
      <div>
        <div className="text-sm text-gray-500">{data.event.名稱}</div>
        <h1 className="text-xl font-bold">{data.survey.標題}</h1>
      </div>
      {data.available ? (
        <SurveyAnswerForm eventId={params.eventId} surveyId={params.surveyId} questions={data.questions} />
      ) : (
        <Alert tone="amber">問卷目前不開放填寫</Alert>
      )}
    </>
  );
}
