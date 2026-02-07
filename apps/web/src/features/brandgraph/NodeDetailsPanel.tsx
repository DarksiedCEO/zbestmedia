import { useMemo, useState } from "react";
import type { Node, Edge } from "reactflow";

export function NodeDetailsPanel({
  selected,
  edges
}: {
  selected: Node | null;
  edges: Edge[];
}) {
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const metaText = useMemo(() => JSON.stringify(selected?.data ?? {}, null, 2), [selected]);
  const filteredMeta = useMemo(() => {
    if (!filter.trim()) return metaText;
    return metaText
      .split("\n")
      .filter((line) => line.toLowerCase().includes(filter.toLowerCase()))
      .join("\n");
  }, [filter, metaText]);

  if (!selected) {
    return <p className="muted">Select a node to see details.</p>;
  }

  const connected = edges.filter((edge) => edge.source === selected.id || edge.target === selected.id).length;
  const meta = selected.data ?? {};

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1200);
  }

  return (
    <div className="detail-block">
      {toast ? <div className="detail-toast">{toast}</div> : null}
      <div className="detail-header">
        <span className="detail-pill">{selected.type ?? "node"}</span>
        <span className="detail-title">{(meta as { label?: string }).label ?? selected.id}</span>
      </div>

      <div className="detail-meta">
        <span>ID:</span>
        <code>{selected.id}</code>
        <button
          type="button"
          className="detail-copy"
          onClick={async () => {
            await navigator.clipboard.writeText(selected.id);
            flash("Copied node ID");
          }}
        >
          copy
        </button>
      </div>

      <div className="detail-stat">
        Connected edges: <strong>{connected}</strong>
      </div>

      <details className="detail-details">
        <summary>Metadata</summary>
        <input
          className="detail-search"
          type="text"
          placeholder="Search metadata"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <pre className="code-block">{filteredMeta || "No metadata provided."}</pre>
      </details>
    </div>
  );
}
