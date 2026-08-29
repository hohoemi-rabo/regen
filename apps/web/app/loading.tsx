export default function Loading() {
  return (
    <div className="flex h-[calc(100dvh-48px)] min-h-[480px] flex-col">
      <div className="h-[53px] border-b border-line bg-surface" />
      <div className="min-h-0 flex-1 animate-pulse bg-grid" />
    </div>
  );
}
