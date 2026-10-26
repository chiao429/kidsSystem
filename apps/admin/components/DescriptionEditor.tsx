'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Alert, Badge, Button } from '@kids/ui';
import { RichTextEditor, type RichTextEditorHandle } from '@kids/ui/rich-text-editor';
import { saveEventDescription } from '@/lib/event-actions';

/** 報名頁內容分頁的「補充資訊」（活動說明欄位）：全寬編輯器＋儲存＋預覽家長報名頁 */
export function DescriptionEditor({ eventId, initial, previewUrl, visibility }: { eventId: string; initial: string; previewUrl: string; visibility?: React.ReactNode }) {
  const [html, setHtml] = useState(initial);
  // 編輯器在掛上 change 監聽之前就放好初始內容，所以收到 change 一定是使用者改的
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const editor = useRef<RichTextEditorHandle | null>(null);
  // 最後一次存檔的內容；比對它才不會被存檔後才到的 change 事件誤判成「尚未儲存」
  const lastSaved = useRef<string | null>(null);

  const onChange = (value: string) => {
    setHtml(value);
    const changed = value !== lastSaved.current;
    setDirty(changed);
    if (changed) setMessage('');
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = (preview: boolean) => {
    // 先同步開分頁，存好再導向；等存完才開會被瀏覽器當成彈出視窗擋掉
    const tab = preview ? window.open('about:blank', '_blank') : null;
    startTransition(async () => {
      setError('');
      // 直接讀編輯器目前的內容（狀態可能還沒收到最後幾個字）
      const value = editor.current?.getValue() ?? html;
      const result = await saveEventDescription(eventId, value);
      if (result.error) {
        setError(result.error);
        tab?.close();
        return;
      }
      lastSaved.current = value;
      // 存檔期間又有修改時維持「尚未儲存」
      const still = (editor.current?.getValue() ?? value) !== value;
      setHtml(editor.current?.getValue() ?? value);
      setDirty(still);
      setMessage(still ? '' : '已儲存');
      if (tab) tab.location.href = previewUrl;
    });
  };

  return (
    <div className="space-y-3">
      <div className="sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <span className="text-sm font-semibold text-gray-800">補充資訊</span>
        {visibility}
        {dirty ? <Badge tone="amber">尚未儲存</Badge> : <span className="text-xs text-gray-500">{message || '內容已儲存'}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold text-[#4b5565] hover:bg-[#eef1f6]">
            預覽家長頁 ↗
          </a>
          <Button variant="secondary" size="sm" onClick={() => save(true)} disabled={pending}>
            儲存並預覽
          </Button>
          <Button size="sm" onClick={() => save(false)} disabled={pending || !dirty}>
            {pending ? '儲存中…' : '儲存'}
          </Button>
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      <RichTextEditor
        name="description"
        label="補充資訊"
        hint="顯示在課程分組卡片下方，放其他需要說明的內容（沒有可以留空）；「預覽家長頁」顯示的是已儲存的版本"
        defaultValue={initial}
        onChange={onChange}
        minHeight={320}
        handle={editor}
      />
    </div>
  );
}
