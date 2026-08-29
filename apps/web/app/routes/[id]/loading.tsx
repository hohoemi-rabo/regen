export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-8">
      <div className="h-40 animate-pulse rounded-card bg-grid" />
      <div className="mt-card-gap h-80 animate-pulse rounded-card bg-grid" />
      <div className="mt-card-gap h-48 animate-pulse rounded-card bg-grid" />
    </main>
  );
}
