import Link from 'next/link';
import { requireSession } from '@kids/auth/next';
import { MemberPicker } from '@/components/MemberPicker';
import { getGroup, kidDirectory, listGroups, rosterOn, today } from '@/lib/data';
import { smallGroupMembers } from '@/lib/tables';

/** 管理組員：從家庭資料挑選同基地的孩子加入，或移出小組（點名紀錄保留） */
export default async function MembersPage({ params }: { params: { groupId: string } }) {
  const session = requireSession({ permission: 'smallgroups' });
  const group = await getGroup(session, params.groupId);
  const [roster, kids, all, groups] = await Promise.all([rosterOn(group.小組ID, today()), kidDirectory(), smallGroupMembers().all({ fresh: true }), listGroups()]);
  const groupName = new Map(groups.map((g) => [g.小組ID, g.名稱]));
  const currentGroup = new Map(all.filter((m) => !m.離開日期).map((m) => [m.成員ID, groupName.get(m.小組ID) ?? '']));
  const inGroup = new Set(roster.map((m) => m.成員ID));
  const list = [...kids.values()]
    .filter((k) => k.基地 === group.基地)
    .map((k) => ({ ...k, inGroup: inGroup.has(k.成員ID), 目前小組: inGroup.has(k.成員ID) ? '' : currentGroup.get(k.成員ID) ?? '' }))
    .sort((a, b) => Number(b.inGroup) - Number(a.inGroup) || a.姓名.localeCompare(b.姓名, 'zh-Hant'));
  return (
    <>
      <div>
        <Link href={`/g/${group.小組ID}`} className="text-sm text-gray-500">
          ← {group.名稱} 點名
        </Link>
        <h1 className="text-2xl font-bold">
          {group.名稱}・管理組員
          <span className="ml-2 text-base font-normal text-gray-500">{group.基地}</span>
        </h1>
      </div>
      <MemberPicker groupId={group.小組ID} kids={list} />
    </>
  );
}
