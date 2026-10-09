/** 「問卷.題目JSON」的格式 */
export type QuestionType = 'single' | 'multi' | 'text' | 'rating';

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  options?: string[];
  required?: boolean;
}

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  single: '單選',
  multi: '多選',
  text: '文字',
  rating: '評分（1-5）',
};

export const SurveyStatus = { Draft: '草稿', Open: '開放', Closed: '關閉' } as const;

export function parseQuestions(json: string | undefined | null): Question[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? (v as Question[]).filter((q) => q && q.id && q.title) : [];
  } catch {
    return [];
  }
}

export type Answers = Record<string, string | string[]>;

/** 驗證答案並只保留合法的值 */
export function cleanAnswers(questions: Question[], raw: Answers): { answers: Answers; missing: string[] } {
  const answers: Answers = {};
  const missing: string[] = [];
  for (const q of questions) {
    const v = raw[q.id];
    let out: string | string[] | undefined;
    if (q.type === 'multi') {
      const arr = (Array.isArray(v) ? v : []).filter((x) => q.options?.includes(x));
      if (arr.length) out = arr;
    } else if (q.type === 'single') {
      if (typeof v === 'string' && q.options?.includes(v)) out = v;
    } else if (q.type === 'rating') {
      if (typeof v === 'string' && /^[1-5]$/.test(v)) out = v;
    } else if (typeof v === 'string' && v.trim()) {
      out = v.trim().slice(0, 1000);
    }
    if (out === undefined) {
      if (q.required) missing.push(q.title);
    } else {
      answers[q.id] = out;
    }
  }
  return { answers, missing };
}
