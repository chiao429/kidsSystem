'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

type Decode = (video: HTMLVideoElement) => Promise<string | undefined>;

/** 瀏覽器內建 BarcodeDetector（Android Chrome 等）；不支援時（iPhone Safari）改用 jsQR 解析畫面 */
function createDecoder(): Decode {
  const Ctor = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  if (Ctor) {
    const detector = new Ctor({ formats: ['qr_code'] });
    return async (video) => (await detector.detect(video).catch(() => []))[0]?.rawValue;
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    if (!ctx || !video.videoWidth) return undefined;
    // 縮到最長邊 640px，手機上解析較快
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data;
  };
}

/** 對準框四個角 */
const CORNERS = [
  'left-0 top-0 border-l-4 border-t-4 rounded-tl-lg',
  'right-0 top-0 border-r-4 border-t-4 rounded-tr-lg',
  'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-lg',
  'right-0 bottom-0 border-r-4 border-b-4 rounded-br-lg',
];

/**
 * 相機掃 QR（iPhone、Android 皆可）；也可以直接在搜尋框輸入或使用掃描槍。
 * paused：提示視窗開著時暫停辨識，避免連續誤掃。
 */
export function Scanner({ onScan, onClose, paused = false }: { onScan: (text: string) => void; onClose: () => void; paused?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [error, setError] = useState('');
  const [hit, setHit] = useState(false);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('此瀏覽器無法使用相機（iPhone 請用 Safari 開啟，且網址需為 https），請直接在搜尋框輸入或使用掃描槍。');
      return;
    }
    const decode = createDecoder();
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let busy = false;
    let last = '';
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        void video.play().catch(() => {});
        timer = setInterval(async () => {
          if (busy || pausedRef.current || video.readyState < 2) return;
          busy = true;
          try {
            const text = await decode(video);
            if (text && text !== last) {
              last = text;
              setHit(true);
              setTimeout(() => setHit(false), 600);
              navigator.vibrate?.(80);
              onScan(text);
              setTimeout(() => (last = ''), 3000);
            }
          } finally {
            busy = false;
          }
        }, 250);
      })
      .catch((e: unknown) => {
        const name = e instanceof Error ? e.name : '';
        setError(
          name === 'NotAllowedError'
            ? '相機權限被拒絕。iPhone 請到「設定 → Safari → 相機」改為「允許」，或點網址列左邊的「大小」圖示重新允許，然後重新整理。'
            : '無法開啟相機，請確認沒有其他 App 正在使用相機，並已允許相機權限。',
        );
      });
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
        <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted autoPlay playsInline />
          {/* 對準框：框外變暗，四角框線；掃到時變綠 */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[62%] w-[62%] rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              {CORNERS.map((c) => (
                <span key={c} className={`absolute h-8 w-8 ${c} ${hit ? 'border-emerald-400' : 'border-white'} transition-colors`} />
              ))}
            </div>
          </div>
          <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-sm text-white drop-shadow">
            {paused ? '處理中…' : '將 QR Code 對準框內'}
          </p>
        </div>
      )}
      <button onClick={onClose} className="text-sm text-gray-600 underline">
        關閉相機
      </button>
    </div>
  );
}
