'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Alert, Badge, Button, Field, Input } from '@kids/ui';
import { RichTextEditor, type RichTextEditorHandle } from '@kids/ui/rich-text-editor';
import { saveSignature } from '@/lib/signature-actions';

/** 簽名檔編輯：名稱＋富文字內容，與活動說明分頁相同的存檔方式（存檔當下直接讀編輯器內容） */
export function SignatureEditor({ id, initialName, initialHtml, isDefault }: { id: string; initialName: string; initialHtml: string; isDefault: boolean }) {
  const [name, setName] = useState(initialName);
  const [html, setHtml] = useState(initialHtml);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const editor = useRef<RichTextEditorHandle | null>(null);
  const lastSaved = useRef<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = () =>
    startTransition(async () => {
      setError('');
      const value = editor.current?.getValue() ?? html;
      const result = await saveSignature(id, name, value);
      if (result.error) return setError(result.error);
      lastSaved.current = value;
      setDirty((editor.current?.getValue() ?? value) !== value);
      setMessage('已儲存');
    });

  return (
    <div className="space-y-3">
      <div className="sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <span className="text-sm font-semibold text-gray-800">編輯簽名檔</span>
        {isDefault && <Badge tone="green">預設</Badge>}
        {dirty ? <Badge tone="amber">尚未儲存</Badge> : <span className="text-xs text-gray-500">{message || '內容已儲存'}</span>}
        <Button size="sm" className="ml-auto" onClick={save} disabled={pending || !dirty || !name.trim()}>
          {pending ? '儲存中…' : '儲存'}
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      <Field label="名稱" hint="只在後台顯示，方便辨識" required>
        <Input
          value={name}
          maxLength={50}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
            setMessage('');
          }}
        />
      </Field>
      <RichTextEditor
        name="content"
        label="內容"
        hint="顯示在家長報名頁活動說明的下方"
        defaultValue={initialHtml}
        handle={editor}
        minHeight={320}
        onChange={(value) => {
          setHtml(value);
          const changed = value !== lastSaved.current;
          setDirty(changed);
          if (changed) setMessage('');
        }}
      />
    </div>
  );
}
