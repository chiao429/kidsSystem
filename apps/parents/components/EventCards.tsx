import type { ReactNode } from 'react';
import type { CoursePanelText, Group } from '@kids/schema';
import { RichText } from '@kids/ui/rich-text';

/** 活動報名頁的內容卡片（由上到下：活動資訊、課程分組、補充資訊、簽名檔） */

function PageCard({ className = '', style, tour, children }: { className?: string; style?: React.CSSProperties; tour?: string; children: ReactNode }) {
  return (
    <section className={`ui-card rb-page-card ${className}`} style={style} data-tour={tour}>
      {children}
    </section>
  );
}

/** 活動資訊：圖示＋標籤＋內容，一行一項 */
export function EventInfoCard({ rows }: { rows: { icon: string; label: string; text: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <PageCard className="rb-info-card">
      <h2 className="rb-card-heading">活動資訊</h2>
      <dl className="rb-info-rows">
        {rows.map((r) => (
          <div key={r.label} className="rb-info-row">
            <span className="rb-info-icon" aria-hidden>
              {r.icon}
            </span>
            <dt>{r.label}</dt>
            <dd>{r.text}</dd>
          </div>
        ))}
      </dl>
    </PageCard>
  );
}

const CIRCLED = '❶❷❸❹❺❻❼❽❾❿';

/** 注意事項拆成多行：換行，或「1. … 2. …」的編號都會分開，每行依序編成 ❶❷ */
function noticeLines(text: string): { marker: string; text: string }[] {
  const lines = text
    .split(/\n+/)
    .flatMap((line) => line.split(/\s+(?=\d+[.、．]\s*)/))
    .map((l) => l.trim())
    .filter(Boolean);
  // 每一行都編號（只有一項也一樣）；原本寫的「1.」等編號拿掉後依順序重編，編號另外排版與文字留空格
  return lines.map((l, i) => ({ marker: CIRCLED[i] ?? `${i + 1}.`, text: l.replace(/^\d+[.、．]\s*/, '') }));
}

/** 課程分組卡片：★【10/18(日)角落活動】＋對象／內容＋課程清單（只展示，課程在報名表內選） */
export function CoursePanelCard({
  title,
  color,
  text,
  courses,
  tourTarget,
}: {
  title: string;
  color: string;
  text?: CoursePanelText;
  courses: Group[];
  /** 報名教學要標示的卡片 */
  tourTarget?: string;
}) {
  return (
    <PageCard className="rb-panel" style={{ ['--panel' as string]: color }} tour={tourTarget}>
      <h2 className="rb-panel-title">
        <span className="rb-panel-star" aria-hidden>
          ★
        </span>
        【{title}】
      </h2>
      {(text?.對象 || text?.內容) && (
        <dl className="rb-panel-meta">
          {text.對象 && (
            <div>
              <dt>對象</dt>
              <dd>{text.對象}</dd>
            </div>
          )}
          {text.內容 && (
            <div>
              <dt>內容</dt>
              <dd>{text.內容}</dd>
            </div>
          )}
        </dl>
      )}
      <ul className="rb-course-list" aria-label={`${title}課程`}>
        {courses.map((c, i) => (
          <li key={c.分組ID} className="rb-course-row">
            {/* 編號放在卡片外側左邊 */}
            <span className="rb-course-num" aria-hidden>
              {i + 1}
            </span>
            <CourseItem course={c} />
          </li>
        ))}
      </ul>
    </PageCard>
  );
}

/** 一門課：名稱與人數、材料費在第一列；下方是課程說明與注意事項 */
function CourseItem({ course: c }: { course: Group }) {
  const hasNotice = !!c.注意事項 && c.注意事項 !== '無';
  return (
    <div className="rb-course-item">
      <div className="rb-course-head">
        <span className="rb-course-name">{c.名稱}</span>
        <span className="rb-course-tags">
          {Number(c.材料費) > 0 && <span className="rb-course-fee">材料費 {c.材料費} 元</span>}
          <span className="rb-course-count">{c.名額 ? `${c.名額}人` : '名額不限'}</span>
        </span>
      </div>
      {/* 課程說明，空一行後是注意事項 */}
      {(c.說明 || hasNotice) && (
        <div className="rb-course-body">
          {c.說明 && <div className="rb-course-desc">{c.說明}</div>}
          {hasNotice && (
            <div className="rb-course-notice">
              <div className="rb-course-notice-title">＊注意事項：</div>
              <ul>
                {noticeLines(c.注意事項).map((line) => (
                  <li key={line.marker + line.text} className="rb-notice-line">
                    <span className="rb-notice-marker">{line.marker}</span>
                    <span>{line.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 補充資訊（後台的富文字）；沒有內容就不顯示 */
export function SupplementCard({ html, show }: { html: string; show: boolean }) {
  if (!show) return null;
  return (
    <PageCard>
      <h2 className="rb-card-heading">補充資訊</h2>
      <RichText html={html} />
    </PageCard>
  );
}

/** 簽名檔：淡色、字小一號，與活動內容區分 */
export function SignatureCard({ html, show }: { html: string; show: boolean }) {
  if (!show) return null;
  return (
    <PageCard className="rb-signature-card">
      <RichText html={html} />
    </PageCard>
  );
}
