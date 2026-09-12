// Shared icon set — used by both the sidebar nav and the dashboard's stat
// tiles, so a category (e.g. "pending edits") reads the same icon everywhere.
const BASE = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

function icon(paths, size = 17) {
  return function Icon() {
    return (
      <svg width={size} height={size} {...BASE}>
        {paths}
      </svg>
    );
  };
}

export const Icons = {
  dashboard: icon(
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  pin: icon(
    <>
      <path d="M12 21s7-7.5 7-12a7 7 0 10-14 0c0 4.5 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.3" />
    </>
  ),
  plusCircle: icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </>
  ),
  pencil: icon(
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
    </>
  ),
  calendar: icon(
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <line x1="16" y1="2.5" x2="16" y2="6.5" />
      <line x1="8" y1="2.5" x2="8" y2="6.5" />
      <line x1="3" y1="9.5" x2="21" y2="9.5" />
    </>
  ),
  moon: icon(<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />),
  star: icon(<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />),
  heart: icon(<path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 000-7.6z" />),
  mail: icon(
    <>
      <rect x="2" y="4.5" width="20" height="15" rx="2" />
      <path d="M2 6.5l10 7 10-7" />
    </>
  ),
  list: icon(
    <>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </>
  ),
  building: icon(
    <>
      <path d="M4 21V7l8-4 8 4v14" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 10h.01M15 10h.01M12 6v.01" />
    </>
  ),
  utensils: icon(
    <>
      <path d="M6 2v7a2 2 0 002 2 2 2 0 002-2V2M8 11v11" />
      <path d="M17 2c-1.7 0-3 2-3 5s1.3 5 3 5v9" />
    </>
  ),
  bag: icon(
    <>
      <path d="M6 8h12l1 13H5z" />
      <path d="M9 8V6a3 3 0 016 0v2" />
    </>
  ),
  play: icon(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9.5l5 2.5-5 2.5z" />
    </>
  ),
  palette: icon(
    <>
      <path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 1.3-3.5 1.5 1.5 0 0 1 1-2.7H17a4 4 0 0 0 4-4A7.8 7.8 0 0 0 12 3z" />
      <circle cx="7.5" cy="10" r=".8" />
      <circle cx="10" cy="7" r=".8" />
      <circle cx="14" cy="7.5" r=".8" />
      <circle cx="16.5" cy="11" r=".8" />
    </>
  ),
};

export const CloseIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="5" y1="5" x2="19" y2="19" />
    <line x1="19" y1="5" x2="5" y2="19" />
  </svg>
);

export const HamburgerIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
  </svg>
);
