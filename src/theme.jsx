/* ---------------- design tokens (friendly / modern, single accent + categorical tags) ---------------- */

export const C = {
  bg: "#F6F8F7",
  surface: "#FFFFFF",
  surfaceMuted: "#EEF3F0",
  border: "#E1E8E4",
  ink: "#141B17",
  inkSoft: "#5C6B63",
  inkFaint: "#8B978F",

  accent: "#0FA06E", accentDeep: "#0B7A55", accentBg: "#E1F5EB",

  episode: "#E0664A", episodeBg: "#FBEAE4",
  eq: "#CB9A22", eqBg: "#FAF1D6",
  trigger: "#6E8CAE", triggerBg: "#E8EEF4",
  joy: "#CE5F8D", joyBg: "#FAEAF1",
};

/* ---------------- brand mark (minimalist lotus monk) ---------------- */

export function MonkMark({ size = 24, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="12" r="5.5" stroke={color} strokeWidth="2" />
      <path d="M24 18v6" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M14 34c0-6 4.5-10 10-10s10 4 10 10" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 36c4-3 8-3.5 16-3.5S36 33 40 36" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 34c-3 1-5 2.5-6 4M34 34c3 1 5 2.5 6 4" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
