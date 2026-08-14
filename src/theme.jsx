/* ---------------- design tokens ----------------
   Playful pastel palette requested by the user (mood-tracker reference):
   yellow #fed282, mint #77d6bd, purple #b587fb, coral #ff8a8e.
   The app has six color-coded slots (accent + 5 entry types), so two
   extra tints — pink for joy, sky-blue for falsealarm — were derived
   to keep every category visually distinct. Button/badge text is white,
   so the four source hues are deepened a notch from the reference where
   needed to stay readable; the lighter reference tone lives on in each
   *Bg wash. */

export const C = {
  bg: "#F7F5F1",
  surface: "#FFFFFF",
  surfaceMuted: "#FBEEDA",
  border: "#F0E4CE",
  ink: "#2B2440",
  inkSoft: "#6E6580",
  inkFaint: "#A79FBA",

  accent: "#3FBBA0", accentDeep: "#278F79", accentBg: "#DFF6EF",

  episode: "#F16E73", episodeBg: "#FFE7E8",
  eq: "#E0A94A", eqBg: "#FDECC9",
  trigger: "#9B72F2", triggerBg: "#F1E9FE",
  joy: "#FF7FB0", joyBg: "#FFE7F2",
  falsealarm: "#5BB8E8", falsealarmBg: "#E4F4FC",
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
