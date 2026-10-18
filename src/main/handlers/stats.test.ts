const mockHandlers = new Map<string, (...args: unknown[]) => unknown>();
jest.mock("electron", () => ({ ipcMain: { handle: jest.fn((channel: string, fn: (...args: unknown[]) => unknown) => mockHandlers.set(channel, fn)) } }));
jest.mock("../services/stats", () => Object.fromEntries(["getDashboardStats", "getDashboardTrend", "getImpactStats", "getRiskCounts", "getActivityLog"].map((key) => [key, jest.fn((...args: unknown[]) => ({ key, args }))])));
import { IPC } from "@shared/ipc";
import * as stats from "../services/stats";
import { registerStatsHandlers } from "./stats";

beforeAll(() => registerStatsHandlers());
it("delegates dashboard, impact, risk, trend and paginated activity queries", () => {
  const call = (channel: string, ...args: unknown[]) => mockHandlers.get(channel)!({}, ...args);
  for (const channel of [IPC.getDashboardStats, IPC.getDashboardTrend, IPC.getImpactStats, IPC.getRiskCounts]) call(channel);
  call(IPC.getActivityLog, 20, 40);
  expect(stats.getDashboardStats).toHaveBeenCalledTimes(1);
  expect(stats.getDashboardTrend).toHaveBeenCalledTimes(1);
  expect(stats.getImpactStats).toHaveBeenCalledTimes(1);
  expect(stats.getRiskCounts).toHaveBeenCalledTimes(1);
  expect(stats.getActivityLog).toHaveBeenCalledWith(20, 40);
});
