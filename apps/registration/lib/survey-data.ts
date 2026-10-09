import 'server-only';
import { SurveyStatus, parseQuestions } from '@kids/schema';
import { getEvent, parseTaipei } from './events';
import { surveys } from './tables';

export async function loadSurvey(eventId: string, surveyId: string) {
  const event = await getEvent(eventId);
  if (!event) return null;
  const survey = await surveys(event.sheetId).findById(surveyId);
  if (!survey) return null;
  const now = new Date();
  const open = parseTaipei(survey.開放);
  const close = parseTaipei(survey.截止);
  const available = survey.狀態 === SurveyStatus.Open && (!open || now >= open) && (!close || now <= close);
  return { event, survey, questions: parseQuestions(survey.題目JSON), available };
}
