type IconName =
  | "play"
  | "pause"
  | "list"
  | "timeline"
  | "sort-up"
  | "sort-down"
  | "labels"
  | "reset"
  | "left"
  | "right";

export function StatsIcon({ name }: { name: IconName }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden="true"
    >
      {name === "play" && <path d="M4 2.5 13 8l-9 5.5Z" fill="currentColor" stroke="none" />}
      {name === "pause" && <path d="M5 3v10M11 3v10" strokeWidth="2" />}
      {name === "list" && (
        <>
          <path d="M6 3h8M6 8h8M6 13h8" />
          <path d="M2 3h1M2 8h1M2 13h1" strokeWidth="2" />
        </>
      )}
      {name === "timeline" && (
        <>
          <path d="M1 8h14" />
          <rect x="1" y="6" width="4" height="4" fill="currentColor" stroke="none" />
          <rect x="11" y="6" width="4" height="4" fill="currentColor" stroke="none" />
        </>
      )}
      {(name === "sort-up" || name === "sort-down") && (
        <g transform={name === "sort-up" ? "rotate(180 8 8)" : undefined}>
          <path d="M4 2v11m-3-3 3 3 3-3M9 3h6M9 7h4M9 11h2" />
        </g>
      )}
      {name === "labels" && (
        <>
          <path d="M2 3h12M8 3v10M5 13h6" />
        </>
      )}
      {name === "reset" && (
        <>
          <path d="M3 5a5.5 5.5 0 1 1-1 5M3 1v4h4" />
        </>
      )}
      {name === "left" && <path d="m10 3-5 5 5 5" />}
      {name === "right" && <path d="m6 3 5 5-5 5" />}
    </svg>
  );
}
