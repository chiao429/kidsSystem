import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, Field, Input, Select, Textarea } from '@kids/ui';
import { ActionForm, SubmitButton } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import { GRADE_OPTIONS, MemberType } from '@kids/schema';
import { saveHousehold, saveMember } from '@/lib/family-actions';
import { households, members } from '@/lib/tables';

export default async function FamilyPage({ params }: { params: { householdId: string } }) {
  requireSession({ roles: ['admin', 'manager'] });
  const h = await households().findById(params.householdId, { fresh: true });
  if (!h) notFound();
  const mm = (await members().all({ fresh: true })).filter((m) => m.家庭ID === h.家庭ID);
  return (
    <>
      <Link href="/families" className="text-sm text-gray-500">
        ← 家庭與成員
      </Link>
      <Card title={`家庭：${h.主要聯絡人}`} actions={<span className="font-mono text-xs text-gray-400">{h.家庭ID}</span>}>
        <ActionForm action={saveHousehold.bind(null, h.家庭ID)} className="grid gap-3 sm:grid-cols-2">
          <Field label="主要聯絡人">
            <Input name="主要聯絡人" defaultValue={h.主要聯絡人} />
          </Field>
          <Field label="電話">
            <Input name="電話" defaultValue={h.電話} />
          </Field>
          <Field label="Email">
            <Input name="Email" defaultValue={h.Email} />
          </Field>
          <Field label="地址">
            <Input name="地址" defaultValue={h.地址} />
          </Field>
          <div>
            <SubmitButton>儲存家庭</SubmitButton>
          </div>
        </ActionForm>
      </Card>
      {mm.map((m) => (
        <Card key={m.成員ID} title={m.姓名} actions={<span className="font-mono text-xs text-gray-400">{m.成員ID}</span>}>
          <ActionForm action={saveMember.bind(null, m.成員ID)} className="grid gap-3 sm:grid-cols-4">
            <Field label="姓名">
              <Input name="姓名" defaultValue={m.姓名} />
            </Field>
            <Field label="性別">
              <Select name="性別" defaultValue={m.性別}>
                <option value=""></option>
                <option>男</option>
                <option>女</option>
              </Select>
            </Field>
            <Field label="生日">
              <Input name="生日" defaultValue={m.生日} />
            </Field>
            <Field label="年級">
              <Select name="年級" defaultValue={m.年級}>
                <option value=""></option>
                {GRADE_OPTIONS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </Select>
            </Field>
            <Field label="學校">
              <Input name="學校" defaultValue={m.學校} />
            </Field>
            <Field label="類型">
              <Select name="類型" defaultValue={m.類型}>
                {Object.values(MemberType).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="特殊需求">
                <Textarea name="特殊需求" rows={1} defaultValue={m.特殊需求} />
              </Field>
            </div>
            <div>
              <SubmitButton size="sm">儲存成員</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ))}
    </>
  );
}
