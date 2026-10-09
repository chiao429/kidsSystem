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
  /** 既有家庭：以電話＋聯絡人姓名驗證 */
  lookup?: { phone: string; name: string };
  consent: boolean;
}

export interface RegisterResult {
  error?: string;
  errors?: string[];
  ids?: string[];
}

export interface LookupResult {
  error?: string;
  household?: HouseholdInput & { 家庭ID: string };
  members?: (Omit<MemberInput, 'courses' | 'selected'> & { 成員ID: string; registered: boolean })[];
}

export interface CourseOption {
  name: string;
  full: boolean;
}
