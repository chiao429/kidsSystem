import { redirect } from 'next/navigation';
import { Alert } from '@kids/ui';
import { GRADE_OPTIONS, GroupType, LEARNER_ROLES, RegistrationStatus, hasGroupType, type Group } from '@kids/schema';
import { getEvent } from '@/lib/events';
import { loadGroupState } from '@/lib/groups';
import { accounts, registrations } from '@/lib/tables';
import { CourseEditor } from '@/components/CourseEditor';
import { GroupLeaders } from '@/components/GroupLeaders';
import { courseFromGroup } from '@/lib/course-fields';

/** 課程分頁：只管理課程（小隊在獨立的「小隊」分頁） */
export default async function GroupsPage({ params, searchParams }: { params: { eventId: string }; searchParams: { type?: string } }) {
  // 舊連結 ?type=小隊 轉到小隊分頁
  if (searchParams.type === GroupType.Team) redirect(`/events/${params.eventId}/teams`);
  const event = await getEvent(params.eventId);
  const [state, regs, accs] = await Promise.all([loadGroupState(event.活動ID), registrations(event.活動ID).all(), accounts().all()]);
  const active = new Set(regs.filter((r) => r.狀態 !== RegistrationStatus.Cancelled).map((r) => r.報名ID));
  const list = state.courses;
  const countOf = (g: Group) =>
    state.members.filter((m) => m.分組ID === g.分組ID && LEARNER_ROLES.includes(m.角色) && (!m.報名ID || active.has(m.報名ID))).length;
  const leadersOf = (g: Group) => state.members.filter((m) => m.分組ID === g.分組ID && !LEARNER_ROLES.includes(m.角色));

  return (
    <>
      {!hasGroupType(event.rules, GroupType.Course) && <Alert tone="amber">此活動尚未啟用「課程」，到「設定」→「進階設定」的「使用的分組」勾選後，報名、報到與點名才會使用。</Alert>}

      <CourseEditor
          eventId={params.eventId}
          grades={[...GRADE_OPTIONS]}
          initial={[...state.courses]
            .sort((x, y) => (Number(x.排序) || 0) - (Number(y.排序) || 0))
            .map((g) => ({
              id: g.分組ID,
              draft: courseFromGroup(g),
              learners: countOf(g),
              locked: state.members.some((m) => m.分組ID === g.分組ID && LEARNER_ROLES.includes(m.角色)),
            }))}
        />

      <GroupLeaders eventId={params.eventId} type={GroupType.Course} list={list} leadersOf={leadersOf} accs={accs} />
    </>
  );
}
