"use client";

import { useRef, useState } from "react";

/**
 * CSVのドロップゾーン(F-4-1 / F-4-2、DESIGN §6.5)。
 *
 * **「データは端末内でのみ処理され、送信されません」を枠内に常時表示する。**
 * 読み込み後も消さない(利用者が一番不安になるのは、まさに読み込んだ後だから)。
 *
 * 受け取った File は親に渡すだけで、このコンポーネントもネットワークに触らない。
 */
export function DropZone({
  onFile,
  fileName,
  disabled,
}: {
  onFile: (file: File) => void;
  /** 読み込み済みのファイル名。あれば枠内に出す */
  fileName?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) take(e.dataTransfer.files);
        }}
        className={`rounded-card border-2 border-dashed p-6 text-center transition-colors duration-fast ${
          over ? "border-accent bg-accent-weak" : "border-line bg-surface"
        }`}
      >
        <p className="text-body font-semibold text-ink-1">
          {fileName ? `読み込み済み: ${fileName}` : "運行実績のCSVをここにドロップ"}
        </p>
        <p className="mt-1 text-aux text-ink-2">
          日付・走行距離・消費量(電力量kWh または 軽油L)の列が要ります。運行時間の列があれば精度が上がります。
        </p>

        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="mt-3 inline-flex h-11 items-center justify-center rounded-btn bg-accent px-4 text-body font-semibold text-ink-on-dark transition-colors duration-fast hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-surface disabled:text-ink-3 sm:h-10"
        >
          {fileName ? "別のCSVを選ぶ" : "ファイルを選ぶ"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          onChange={(e) => {
            take(e.target.files);
            // 同じファイルをもう一度選べるようにする
            e.target.value = "";
          }}
        />

        {/* DESIGN §6.5: 枠内に常時表示する */}
        <p className="mt-4 rounded-tile bg-page px-3 py-2 text-note text-ink-2">
          <strong className="text-ink-1">データは端末内でのみ処理され、送信されません。</strong>
          <br />
          この画面はCSVをサーバーに送る経路を持ちません。読み取り・突き合わせ・係数の計算はすべて
          お使いのブラウザの中で行われ、結果の係数だけがこの端末に保存されます。
        </p>
      </div>
    </div>
  );
}
