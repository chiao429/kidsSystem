import { SurveyStatus, type Question, type RowOf, type SurveyTable } from '@kids/schema';
import { Field, Input, Select } from '@kids/ui';
import { ActionForm, SubmitButton, type FormResult } from '@kids/ui/client';
import { QuestionEditor } from './QuestionEditor';

export function SurveyForm({
  action,
  survey,
  questions = [],
}: {
  action: (state: FormResult, formData: FormData) => Promise<FormResult>;
  survey?: RowOf<typeof SurveyTable>;
  questions?: Question[];
}) {
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="標題" required>
          <Input name="title" defaultValue={survey?.標題} />
        </Field>
      </div>
      <Field label="對象" hint="說明用，例如：全體家長、參加兒童">
        <Input name="audience" defaultValue={survey?.對象 ?? '全體家長'} />
      </Field>
      <Field label="狀態">
        <Select name="status" defaultValue={survey?.狀態 ?? SurveyStatus.Draft}>
          {Object.values(SurveyStatus).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </Field>
      <Field label="開放時間">
        <Input type="datetime-local" name="open" defaultValue={survey?.開放} />
      </Field>
      <Field label="截止時間">
        <Input type="datetime-local" name="close" defaultValue={survey?.截止} />
      </Field>
      <div className="sm:col-span-2">
        <div className="mb-2 text-sm font-medium text-gray-700">題目</div>
        <QuestionEditor initial={questions} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton>儲存問卷</SubmitButton>
      </div>
    </ActionForm>
  );
}
