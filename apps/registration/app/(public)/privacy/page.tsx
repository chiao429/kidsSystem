import Link from 'next/link';
import { Card } from '@kids/ui';

export const metadata = { title: '思麥特基地X夢夢基地｜隱私權保護暨服務及聲明條款' };

const UPDATED = '2026 年 10 月 26 日';

/** 隱私權保護暨服務及聲明條款（家長端，不需登入） */
export default function PrivacyPage() {
  return (
    <>
      <Link href="/" className="rb-back">
        <span aria-hidden>←</span> 回首頁
      </Link>
      <h1 className="text-xl font-bold">隱私權保護暨服務及聲明條款</h1>
      <Card>
        <div className="space-y-5 text-sm leading-7 text-gray-700">
          <p>
            歡迎使用夢夢基地 DreamKids 與思麥特基地 SmartKids（以下簡稱「本服務」）的活動報名系統。本服務由主辦單位（以下簡稱「我們」）提供。為保障您與孩子的權益，請詳閱以下條款；當您開始報名或使用本服務，即表示您已閱讀、了解並同意本條款。
          </p>

          <Section title="一、蒐集的個人資料">
            <ul className="list-disc space-y-1 pl-5">
              <li>家長資料：主要聯絡人姓名、手機號碼、Email、地址。</li>
              <li>孩子資料：姓名、性別、生日、年級、學校、特殊需求（如過敏、用藥、需要特別照顧的地方）。</li>
              <li>活動資料：報名、選課、報到、點名、繳費與問卷回覆紀錄。</li>
              <li>登入資料：您設定的 4 位數 PIN（僅以加密雜湊保存，我們無法得知原始 PIN）。</li>
            </ul>
          </Section>

          <Section title="二、蒐集目的與使用範圍">
            <p>個人資料僅用於辦理活動相關事務，包括：報名與名額管理、分組與課程安排、活動當天報到與點名、緊急聯絡與照護、活動保險、繳費紀錄、活動通知與滿意度調查。未經您同意，不會用於上述目的以外的用途。</p>
          </Section>

          <Section title="三、照片與影片">
            <p>活動中可能拍攝照片或影片作為活動紀錄。只有在報名時勾選同意的情況下，才會將含有孩子的照片或影片公開於成果分享或社群媒體；您可以隨時聯繫我們撤回同意。</p>
          </Section>

          <Section title="四、資料的分享與揭露">
            <p>我們不會出售、出租或任意提供您的個人資料給第三人。僅在下列情況提供必要範圍的資料：</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>辦理活動保險所需。</li>
              <li>協助辦理活動的工作人員，依其負責的工作（例如報到、點名）查看必要資料。</li>
              <li>依法令規定或司法、行政機關依法要求。</li>
              <li>為保護孩子或他人的生命、身體安全的緊急情況。</li>
            </ul>
          </Section>

          <Section title="五、資料保存與安全">
            <p>個人資料存放於受存取控管的雲端服務，工作人員須以個人帳號登入並依權限使用。我們採取合理的技術與管理措施保護資料安全，並在蒐集目的消失或依法應刪除時刪除或停止使用相關資料。</p>
          </Section>

          <Section title="六、您的權利">
            <p>依個人資料保護法，您可以向我們請求查詢、閱覽、製給複本、補充或更正、停止蒐集處理利用，或刪除您與孩子的個人資料。部分報名資料可以在「家長登入」後自行查看；其他請求請聯繫主辦單位辦理。若您不提供必要資料，可能無法完成報名或參加活動。</p>
          </Section>

          <Section title="七、Cookie 的使用">
            <p>本服務僅使用維持登入狀態所必要的 Cookie（例如勾選「記住這台裝置」後免再輸入 PIN），不用於廣告或追蹤。共用電腦請勿勾選「記住這台裝置」。</p>
          </Section>

          <Section title="八、服務使用與免責聲明">
            <ul className="list-disc space-y-1 pl-5">
              <li>請提供真實、正確的資料，並妥善保管手機號碼與 PIN；因資料不實或 PIN 外洩所生的損失，由使用者自行負責。</li>
              <li>活動名額、課程內容、時間與地點以主辦單位公告為準，主辦單位保留調整或取消活動的權利，並會盡速通知已報名的家庭。</li>
              <li>本服務可能因系統維護、網路或不可抗力因素暫時無法使用，我們將盡力儘速恢復。</li>
              <li>網站內容（文字、圖片、標誌等）的著作權屬 JO-YANG 所有，未經同意請勿任意重製或使用。</li>
            </ul>
          </Section>

          <Section title="九、條款修訂">
            <p>我們可能因法令或服務調整而修訂本條款，修訂後將公告於本頁。修訂後您繼續使用本服務，即視為同意修訂內容。</p>
          </Section>

          <Section title="十、聯絡我們">
            <p>對本條款或個人資料有任何疑問，請洽活動主辦單位。</p>
          </Section>

          <p className="text-xs text-gray-500">最後更新：{UPDATED}</p>
        </div>
      </Card>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}
