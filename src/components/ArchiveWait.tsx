/** What a page shows while a league's archive era loads (or if it failed):
    the same skeleton the boot screen uses, so the swap reads as one load. */
export default function ArchiveWait({ status }: { status: "loading" | "error" }) {
  if (status === "error") {
    return (
      <div className="mx-auto max-w-xl px-6 py-32 text-center font-display">
        <p className="text-2xl font-semibold">The archive failed to load.</p>
        <p className="mt-3 text-ink-soft">Refresh the page to try again.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-5xl px-6 py-24" aria-busy="true">
      <div className="h-10 w-72 animate-pulse rounded bg-wash" />
      <div className="mt-6 h-64 animate-pulse rounded bg-wash" />
      <div className="mt-6 h-40 animate-pulse rounded bg-wash" />
    </div>
  );
}
