import type { GraphSnapshotMeta } from "../../contracts/brandgraph.contract";

export type CompareTarget = "latest" | GraphSnapshotMeta;

export function SnapshotDiffPanel({
  selectedSnapshot,
  compareTo,
  onCompareChange,
  options
}: {
  selectedSnapshot: GraphSnapshotMeta | null;
  compareTo: CompareTarget;
  onCompareChange: (value: CompareTarget) => void;
  options: GraphSnapshotMeta[];
}) {
  if (!selectedSnapshot) {
    return (
      <div className="diff-panel-empty">
        <h3>Diff summary</h3>
        <p className="muted">Select a snapshot to view its metadata and compare options.</p>
      </div>
    );
  }

  return (
    <div className="diff-panel">
      <div className="diff-header">
        <h2>Snapshot diff</h2>
        <p className="muted">UI-only shell until diff endpoint is available.</p>
      </div>

      <section className="diff-section">
        <h3>Selected snapshot</h3>
        <div className="diff-meta">
          <div>
            <span className="muted">ID</span>
            <div className="diff-value">{selectedSnapshot.eventId}</div>
          </div>
          <div>
            <span className="muted">Created</span>
            <div className="diff-value">{new Date(selectedSnapshot.createdAt).toLocaleString()}</div>
          </div>
        </div>
      </section>

      <section className="diff-section">
        <h3>Compare to</h3>
        <div className="diff-select">
          <select
            value={compareTo === "latest" ? "latest" : compareTo.eventId}
            onChange={(event) => {
              if (event.target.value === "latest") {
                onCompareChange("latest");
                return;
              }
              const next = options.find((snapshot) => snapshot.eventId === event.target.value);
              if (next) {
                onCompareChange(next);
              }
            }}
          >
            <option value="latest">Latest</option>
            {options.map((snapshot) => (
              <option key={snapshot.eventId} value={snapshot.eventId}>
                {new Date(snapshot.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="diff-section">
        <h3>Diff summary</h3>
        <div className="diff-stats">
          <div className="diff-stat">
            <span className="muted">Nodes added</span>
            <span>—</span>
          </div>
          <div className="diff-stat">
            <span className="muted">Nodes removed</span>
            <span>—</span>
          </div>
          <div className="diff-stat">
            <span className="muted">Edges added</span>
            <span>—</span>
          </div>
          <div className="diff-stat">
            <span className="muted">Edges removed</span>
            <span>—</span>
          </div>
        </div>
      </section>

      <button type="button" className="button" disabled title="Diff endpoint not yet available">
        Request diff endpoint
      </button>
    </div>
  );
}
