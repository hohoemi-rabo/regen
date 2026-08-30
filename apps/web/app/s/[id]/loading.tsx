/** ルートの loading.tsx はマップ用の大きさなので、この画面用に置き換える */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-8">
      <div className="h-8 w-2/3 animate-pulse rounded-tile bg-grid" />
      <div className="mt-card-gap h-32 animate-pulse rounded-card bg-grid" />
      <div className="mt-card-gap h-64 animate-pulse rounded-card bg-grid" />
      <div className="mt-card-gap h-48 animate-pulse rounded-card bg-grid" />
    </main>
  );
}
