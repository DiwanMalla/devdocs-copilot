const ALT =
  "Architecture: GitHub ingestion, pgvector retrieval, and grounded LLM answers with file and line citations";

export function ArchitectureDiagram() {
  return (
    <figure className="bg-card overflow-hidden rounded-2xl ring-1 ring-foreground/10">
      {/* Native img: next/image inline styles are blocked by nonce style-src. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/architecture.svg"
        alt={ALT}
        width={960}
        height={440}
        className="h-auto w-full"
      />
      <figcaption className="text-muted-foreground border-t px-4 py-3 text-xs">
        Self-hosted SVG diagram — safe under the nonce Content-Security-Policy.
      </figcaption>
    </figure>
  );
}
