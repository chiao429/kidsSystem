'use client';

import { Alert, Button } from '@kids/ui';

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-3">
      <Alert>{error.message || '發生錯誤'}</Alert>
      <Button variant="secondary" onClick={reset}>
        重試
      </Button>
    </div>
  );
}
