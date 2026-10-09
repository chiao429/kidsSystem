export const Role = { Admin: 'admin', Manager: 'manager', Staff: 'staff' } as const;
export type Role = (typeof Role)[keyof typeof Role];

export const EventVersion = { Adult: '同工', Kids: '兒童' } as const;

export const RegistrationType = {
  FirstTime: '第一次報名',
  General: '一般報名',
  Household: '同戶報名',
} as const;

export const RegistrationStatus = {
  Pending: '待審核',
  Accepted: '正取',
  Waitlist: '備取',
  Cancelled: '取消',
} as const;

export const RegistrationSource = { Online: '線上', Import: '匯入', OnSite: '現場' } as const;

export const CheckInMethod = { QR: 'QR', Search: '搜尋', OnSite: '現場' } as const;

export const CheckInStatus = { Arrived: '已到', Cancelled: '取消報到', Absent: '不會出席' } as const;

export const AttendanceStatus = { Present: '出席', Absent: '缺席', Leave: '請假', Late: '遲到' } as const;

export const MemberType = { Adult: '大人', Child: '兒童' } as const;
