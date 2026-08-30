/* eslint-disable @next/next/no-img-element --
   Workersでは next/image の既定ローダーが動かないので、図版は public/ の静的アセットを
   素の <img> + 明示的な width/height で出す(CLAUDE.md「Workers固有の制約」)。 */
/**
 * 図のわく。画面写真とSVG図で扱いを揃える。
 *
 * `next/image` は使わない(Workersでは既定の画像ローダーが動かない — CLAUDE.md)。
 * 素の `<img>` に width/height を明示してCLSを防ぐ。
 * 画面写真は紙では潰れるだけなので印刷から外す。
 */
export function Figure({
  src,
  alt,
  caption,
  width,
  height,
}: {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}) {
  return (
    <figure className="my-5 print:hidden">
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className="h-auto w-full rounded-tile border border-line bg-surface"
      />
      <figcaption className="mt-1.5 text-note text-ink-3">{caption}</figcaption>
    </figure>
  );
}

/** 自前SVGの図。こちらは紙にも出す(拡大しても崩れないため) */
export function SvgFigure({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="my-5">
      <div className="rounded-tile border border-line bg-surface p-3">{children}</div>
      <figcaption className="mt-1.5 text-note text-ink-3">{caption}</figcaption>
    </figure>
  );
}
