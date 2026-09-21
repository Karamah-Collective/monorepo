export function LoadingState({ compact = false }) {
  return (
    <div
      className={`loading-state${compact ? " compact" : ""}`}
      role="status"
      aria-label="Loading content"
    >
      <span className="sr-only">Loading content…</span>
      {Array.from({ length: compact ? 3 : 5 }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <span />
          <div>
            <span />
            <span />
          </div>
          <span />
        </div>
      ))}
    </div>
  );
}
