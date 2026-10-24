'use client';

import 'jodit/es2021/jodit.min.css';
import './rich-text-editor.css';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Jodit } from 'jodit';
import { toRichHtml } from './rich-text-format';

/** 工具列（對照 BeClass 編輯器）；圖片只能用網址，不提供上傳 */
const BUTTONS = [
  'paragraph', '|', 'bold', 'underline', 'strikethrough', 'eraser', '|', 'fontsize', 'brush', '|',
  'ul', 'ol', 'align', '|', 'table', 'link', 'image', 'hr', '|', 'source', 'undo', 'redo',
];

/** 讓外層在存檔當下直接讀到編輯器內容（Jodit 的 change 事件約延遲 100ms，靠事件更新的狀態可能少最後幾個字） */
export interface RichTextEditorHandle {
  getValue(): string;
}

/**
 * 富文字編輯器（Jodit）：內容以 HTML 放在隱藏欄位 name 送出。
 * 送出的 HTML 未經消毒，Server Action 必須用 sanitizeRichText（@kids/ui/rich-text）處理後再存。
 * 不能包在 <Field>（label）裡：點編輯區會觸發 label 內第一個按鈕。
 */
export function RichTextEditor({
  name,
  label,
  hint,
  defaultValue,
  onChange,
  minHeight = 260,
  handle,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string;
  /** 內容變更時通知（例如追蹤是否有未儲存的修改） */
  onChange?: (html: string) => void;
  minHeight?: number;
  handle?: MutableRefObject<RichTextEditorHandle | null>;
}) {
  const host = useRef<HTMLTextAreaElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const [html, setHtml] = useState(() => toRichHtml(defaultValue));
  // 編輯器只建立一次，用 ref 拿到最新的 onChange
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let editor: Jodit | undefined;
    let cancelled = false;
    // Jodit 會用到 window，只能在瀏覽器載入
    void import('jodit').then(({ Jodit }) => {
      if (cancelled || !host.current) return;
      editor = Jodit.make(host.current, {
        language: 'zh_tw',
        buttons: BUTTONS,
        buttonsMD: BUTTONS,
        buttonsSM: BUTTONS,
        buttonsXS: BUTTONS,
        toolbarAdaptive: false,
        toolbarSticky: false,
        statusbar: false,
        minHeight,
        editorClassName: 'kids-rich-text',
        // 從 BeClass / Word 貼上時保留格式，不跳詢問視窗；存檔時再由 sanitizeRichText 過濾
        askBeforePasteHTML: false,
        askBeforePasteFromWord: false,
        defaultActionOnPaste: 'insert_as_html',
        controls: {
          paragraph: { list: Jodit.atom({ p: '內文', h2: '標題', h3: '小標', blockquote: '引言' }) },
          fontsize: { list: Jodit.atom(['12', '14', '16', '18', '20', '24', '28']) },
        },
        disablePlugins: ['ai-assistant', 'speech-recognize', 'powered-by-jodit'],
      });
      editor.value = toRichHtml(defaultValue);
      const current = editor;
      if (handle) handle.current = { getValue: () => current.value };
      editor.e.on('change', (value: string) => {
        setHtml(value);
        onChangeRef.current?.(value);
      });
    });
    // 放在一般表單裡時，送出前把最新內容寫進隱藏欄位，避免 change 事件還沒到就送出
    const form = hidden.current?.form;
    const syncBeforeSubmit = () => {
      if (editor && hidden.current) hidden.current.value = editor.value;
    };
    form?.addEventListener('submit', syncBeforeSubmit, true);
    form?.addEventListener('formdata', syncFormData, true);
    function syncFormData(e: FormDataEvent) {
      if (editor) e.formData.set(name, editor.value);
    }
    return () => {
      cancelled = true;
      form?.removeEventListener('submit', syncBeforeSubmit, true);
      form?.removeEventListener('formdata', syncFormData, true);
      if (handle) handle.current = null;
      editor?.destruct();
    };
    // 只在掛載時建立編輯器；之後內容由 Jodit 管理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-1">
      <span className="text-sm font-semibold text-[#4b5565]">{label}</span>
      <div className="kids-rich-text-wrap overflow-hidden rounded-2xl border border-[#e2e5ea] bg-white">
        <textarea ref={host} defaultValue={toRichHtml(defaultValue)} aria-label={label} />
      </div>
      <input ref={hidden} type="hidden" name={name} value={html} />
      {hint && <span className="block text-xs text-gray-500">{hint}</span>}
    </div>
  );
}
