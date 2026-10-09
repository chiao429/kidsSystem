'use client';

import { useEffect, useRef, useState } from 'react';

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

/** 相機掃 QR（使用瀏覽器內建 BarcodeDetector；不支援時提示改用輸入框或掃描槍） */
export function Scanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const Ctor = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    if (!Ctor) {
      setError('此瀏覽器不支援相機掃描，請用 Android Chrome，或直接在搜尋框輸入／使用掃描槍。');
      return;
    }
    const detector = new Ctor({ formats: ['qr_code'] });
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let last = '';
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s;
        if (!videoRef.current) return;
        videoRef.current.srcObject = s;
        void videoRef.current.play();
        timer = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          const codes = await detector.detect(videoRef.current).catch(() => []);
          const text = codes[0]?.rawValue;
          if (text && text !== last) {
            last = text;
            onScan(text);
            setTimeout(() => (last = ''), 3000);
          }
        }, 300);
      })
      .catch(() => setError('無法開啟相機，請確認已允許相機權限'));
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onScan]);

  return (
    <div className="space-y-2">
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <video ref={videoRef} className="mx-auto aspect-square w-full max-w-xs rounded-lg bg-black object-cover" muted playsInline />
      )}
      <button onClick={onClose} className="text-sm text-gray-600 underline">
        關閉相機
      </button>
    </div>
  );
}
