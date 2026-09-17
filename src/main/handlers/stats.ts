import { ipcMain } from "electron";
import { IPC } from "@shared/ipc";
import { getDashboardStats, getDashboardTrend, getImpactStats, getRiskCounts, getActivityLog } from "../services/stats";

export function registerStatsHandlers(): void {
  ipcMain.handle(IPC.getDashboardStats, () => getDashboardStats());

  ipcMain.handle(IPC.getDashboardTrend, () => getDashboardTrend());

  ipcMain.handle(IPC.getImpactStats, () => getImpactStats());

  ipcMain.handle(IPC.getRiskCounts, () => getRiskCounts());

  ipcMain.handle(IPC.getActivityLog, (_e, limit: number, offset: number) =>
    getActivityLog(limit, offset)
  );
}
