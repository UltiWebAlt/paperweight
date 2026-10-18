import { computeTrend, niceMax } from "./math";

it("provides readable chart axes for zero, small values, and large counts", () => {
  expect(niceMax(0)).toEqual({ max: 8, ticks: [0, 2, 4, 6, 8] });
  expect(niceMax(1)).toEqual({ max: 1, ticks: [0, 1] });
  expect(niceMax(16)).toEqual({ max: 20, ticks: [0, 5, 10, 15, 20] });
  expect(niceMax(350, 3)).toEqual({ max: 500, ticks: [0, 250, 500] });
  expect(niceMax(800, 1)).toEqual({ max: 1000, ticks: [0] });
});

it("compares complete periods and handles empty or zero baselines", () => {
  expect(computeTrend([])).toEqual({ direction: "flat", pct: 0 });
  expect(computeTrend([0, 0], 1)).toEqual({ direction: "flat", pct: 0 });
  expect(computeTrend([0, 5], 0)).toEqual({ direction: "up", pct: 100 });
  expect(computeTrend([10, 5], 1)).toEqual({ direction: "down", pct: 50 });
  expect(computeTrend([4, 6, 8, 12], 2)).toEqual({ direction: "up", pct: 100 });
  expect(computeTrend([1000, 1001], 1)).toEqual({ direction: "flat", pct: 0 });
});
