const VAULT = {
  bg0: "#080C0E",
  bg1: "#0E1518",
  bg2: "#141F24",
  bg3: "#1C2B34",
  brd: "#1E3342",
  brdDim: "#162535",

  em:    "#10B981",
  emL:   "#34D399",
  emDim: "#064E3B",

  gold:    "#F59E0B",
  goldL:   "#FCD34D",
  goldDim: "#451A03",

  red:    "#EF4444",
  redDim: "#450A0A",

  blue:    "#3B82F6",
  blueDim: "#1E3A5F",

  cyan:    "#06B6D4",
  cyanDim: "#0C3E4F",

  text: "#E2E8F0",
  sub:  "#64748B",
  dim:  "#1E3342",
  muted: "#94A3B8",

  cs: "dark",
};

export const T = { ...VAULT };
export function getTheme() { return VAULT; }
