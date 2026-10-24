/** 報名表單 ↔ Server Action 之間傳遞的資料（用物件傳遞，不經 FormData） */
export interface MemberInput {
  成員ID?: string;
  姓名: string;
  性別: string;
  生日: string;
  年級: string;
  學校: string;
  類型: string;
  特殊需求: string;
  /** 選擇的課程分組ID */
  courses: string[];
  selected: boolean;
}

export interface HouseholdInput {
  主要聯絡人: string;
  電話: string;
  Email: string;
  地址: string;
}

export interface RegisterPayload {
  eventId: string;
  source: string;
  household: HouseholdInput;
  members: MemberInput[];
  /** 既有家庭：以手機號碼查詢 */
  lookup?: { phone: string };
  consent: boolean;
  photoConsent: boolean;
  followUpConsent: boolean;
}

export interface RegisterResult {
  error?: string;
  errors?: string[];
  ids?: string[];
}

export interface LookupResult {
  error?: string;
  /** 此家庭在本活動已完成的報名（用來顯示報到 QR code） */
  registrationIds?: string[];
  household?: HouseholdInput & { 家庭ID: string };
  members?: (Omit<MemberInput, 'courses' | 'selected'> & { 成員ID: string; registered: boolean })[];
}

export interface CourseOption {
  /** 課程分組ID */
  id: string;
  name: string;
  full: boolean;
  /** 剩餘名額；不限名額為 null */
  remaining: number | null;
  /** 名額；不限名額為 null */
  capacity: number | null;
  groupName: string;
  audience: string;
  minGrade: string;
  maxGrade: string;
  minAge: number | null;
  maxAge: number | null;
  fee: number;
  description: string;
  notice: string;
  registrationStart: string;
  registrationEnd: string;
  registrationState: 'open' | 'upcoming' | 'closed';
  allowOnSite: boolean;
}
