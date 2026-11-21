import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMinutes, mapGameStatus, toLine, statLineFromBox, type BdlStat } from "@/lib/data/providers/balldontlie";

function near(a: number, b: number, eps = 1e-9) {
  assert.ok(Math.abs(a - b) <= eps, `${a} !~= ${b}`);
}

test("balldontlie: parseMinutes handles string, mm:ss, empty and null", () => {
  near(parseMinutes("30"), 30);
  near(parseMinutes("21:35"), 21.6); // 21 + 35/60 = 21.583 -> round to 21.6
  near(parseMinutes("0:45"), 0.8); // 0.75 -> 0.8
  near(parseMinutes(""), 0);
  near(parseMinutes(null), 0);
});

test("balldontlie: mapGameStatus maps status_state to our enum", () => {
  assert.equal(mapGameStatus("final"), "final");
  assert.equal(mapGameStatus("in_progress"), "live");
  assert.equal(mapGameStatus("scheduled"), "scheduled");
  assert.equal(mapGameStatus("postponed"), "scheduled");
  assert.equal(mapGameStatus(undefined), "scheduled");
});

test("balldontlie: toLine produces prop-style .5 lines near the average", () => {
  near(toLine(24.3), 24.5);
  near(toLine(6.2), 6.5);
  near(toLine(8), 8.5);
  near(toLine(0.9), 0.5); // floored to 0, clamped up to 0.5
  near(toLine(0.1), 0.5);
});

test("balldontlie: statLineFromBox folds a box score into our stat keys incl. pra", () => {
  const s: BdlStat = {
    id: 1, min: "34:12",
    fgm: 10, fga: 20, fg3m: 4, fg3a: 9, ftm: 4, fta: 5,
    oreb: 1, dreb: 8, reb: 9, ast: 11, stl: 2, blk: 1, turnover: 3, pf: 2, pts: 28,
    player: { id: 7, first_name: "A", last_name: "B", position: "G", team_id: 14 },
    team: { id: 14 },
    game: { id: 100, date: "2026-11-15", season: 2026, status_state: "final", home_team_id: 14, visitor_team_id: 2 },
  };
  const line = statLineFromBox(s);
  assert.deepEqual(line, { pts: 28, reb: 9, ast: 11, threes: 4, stl: 2, blk: 1, pra: 48 });
});
