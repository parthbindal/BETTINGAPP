/**
 * Leagues EDGEWISE covers with real data. Only the NBA is connected today
 * (balldontlie); add a league here when a real feed for it exists.
 */
export type Sport = "basketball";

export const SPORTS: Array<{ key: Sport; label: string; league: string; stats: Array<{ key: string; label: string }> }> = [
  {
    key: "basketball",
    label: "Basketball",
    league: "NBA",
    stats: [
      { key: "pts", label: "Points" },
      { key: "reb", label: "Rebounds" },
      { key: "ast", label: "Assists" },
      { key: "threes", label: "Three-pointers" },
      { key: "pra", label: "Pts + Reb + Ast" },
      { key: "stl", label: "Steals" },
      { key: "blk", label: "Blocks" },
    ],
  },
];
