import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, Field, Input, Select, Textarea } from '@kids/ui';
import { ActionForm, SubmitButton } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import { MemberType, gradeChoices, isTestHousehold } from '@kids/schema';
import { deleteHousehold, deleteMember, resetHouseholdPin, saveHousehold, saveMember } from '@/lib/family-actions';
import { households, members } from '@/lib/tables';
import { DeleteButton } from '@/components/DeleteButton';

export default async function FamilyPage({ params }: { params: { householdId: string } }) {
  requireSession({ permission: 'families' });
  const h = await households().findById(params.householdId, { fresh: true });
  if (!h) notFound();
  const mm = (await members().all({ fresh: true })).filter((m) => m.家庭ID === h.家庭ID);
  return (
    <>
      <Link href="/families" className="text-sm text-gray-500">
        ← 家庭與成員
      </Link>
      <Card
        title={
          <span className="flex items-center gap-2">
            家庭：{h.主要聯絡人}
            {isTestHousehold(h) && <Badge tone="amber">測試帳號</Badge>}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-400">{h.家庭ID}</span>
            <DeleteButton
              title={`刪除 ${h.主要聯絡人} 的家庭？`}
              description={`會直接刪除家庭資料與 ${mm.length} 位成員（${mm.map((m) => m.姓名).join('、') || '無'}），無法復原。`}
              action={deleteHousehold.bind(null, h.家庭ID)}
              redirectTo="/families"
            />
          </div>
        }
      >
        <ActionForm action={saveHousehold.bind(null, h.家庭ID)} className="grid gap-3 sm:grid-cols-2">
          <Field label="主要聯絡人">
            <Input name="contact" defaultValue={h.主要聯絡人} />
          </Field>
          <Field label="電話">
            <Input name="phone" defaultValue={h.電話} />
          </Field>
          <Field label="Email">
            <Input name="email" defaultValue={h.Email} />
          </Field>
          <Field label="地址">
            <Input name="address" defaultValue={h.地址} />
          </Field>
          <Field label="測試帳號" hint="工作人員測試用：可以正常報名、報到，但不納入報表、統計與匯出">
            <Select name="test" defaultValue={h.測試 === 'Y' ? 'Y' : ''}>
              <option value="">否（一般家庭）</option>
              <option value="Y">是（測試帳號）</option>
            </Select>
          </Field>
          <div>
            <SubmitButton>儲存家庭</SubmitButton>
          </div>
        </ActionForm>
      </Card>
      <Card title="家長 PIN">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {h.PIN雜湊 ? <Badge tone="green">已設定</Badge> : <Badge tone="gray">尚未設定</Badge>}
          {h.PIN鎖定至 && new Date(h.PIN鎖定至).getTime() > Date.now() && <Badge tone="red">錯誤太多次，鎖定中</Badge>}
          <span className="text-gray-600">家長忘記 PIN 時可以自己用孩子的全名＋生日驗證後重設；「重設 PIN」會清空 PIN 並解除錯誤鎖定，家長下次一樣用孩子的全名＋生日驗證後重新設定。</span>
          {(h.PIN雜湊 || h.PIN鎖定至) && (
            <form action={resetHouseholdPin.bind(null, h.家庭ID)}>
              <SubmitButton variant="secondary" size="sm">
                重設 PIN（並解除鎖定）
              </SubmitButton>
            </form>
          )}
        </div>
      </Card>
      {mm.map((m) => (
        <Card
          key={m.成員ID}
          title={m.姓名}
          actions={
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-400">{m.成員ID}</span>
              <DeleteButton title={`刪除 ${m.姓名}？`} description="會直接刪除這位成員的資料，無法復原。" action={deleteMember.bind(null, m.成員ID)} />
            </div>
          }
        >
          <ActionForm action={saveMember.bind(null, m.成員ID)} className="grid gap-3 sm:grid-cols-4">
            <Field label="姓名">
              <Input name="name" defaultValue={m.姓名} />
            </Field>
            <Field label="性別">
              <Select name="gender" defaultValue={m.性別}>
                <option value=""></option>
                <option>男</option>
                <option>女</option>
              </Select>
            </Field>
            <Field label="生日">
              <Input name="birthday" defaultValue={m.生日} />
            </Field>
            <Field label="年級">
              <Select name="grade" defaultValue={m.年級}>
                <option value=""></option>
                {gradeChoices(m.年級).map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </Select>
            </Field>
            <Field label="學校">
              <Input name="school" defaultValue={m.學校} />
            </Field>
            <Field label="類型">
              <Select name="type" defaultValue={m.類型}>
                {Object.values(MemberType).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="特殊需求">
                <Textarea name="needs" rows={1} defaultValue={m.特殊需求} />
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
