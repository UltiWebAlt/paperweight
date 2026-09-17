import { ipcMain, shell } from "electron";
import { IPC } from "@shared/ipc";
import { isLicenseKey, isString } from "@shared/validation";
import { activateLicense, getLicenseStatus, deleteLicense, applyAutoLaunch } from "../services/settings";
import { getSetting, saveSetting } from "../services/settings";
import { getActiveEmail, loadCredentials } from "../credentials";
import { stopSync, startAllSyncs } from "../sync-manager";
import { saveGmailFolderSettings } from "../services/gmailSyncSettings";
import { getGlobalSetting, saveGlobalSetting } from "../services/globalSettings";
import { buildAppSettings } from "../services/appSettings";
import { dataLog } from "../utils/log";

export function registerSettingsHandlers(): void {
  // --- License ---

  ipcMain.handle(IPC.activateLicense, async (_event, key: unknown) => {
    if (!isLicenseKey(key)) throw new Error("Invalid license key");
    return activateLicense(key);
  });

  ipcMain.handle(IPC.getLicenseStatus, () => getLicenseStatus());

  ipcMain.handle(IPC.deactivateLicense, () => {
    deleteLicense();
  });

  // --- App settings ---

  ipcMain.on(IPC.getSettings, (event) => {
    event.returnValue = buildAppSettings();
  });

  ipcMain.handle(IPC.saveSettings, async (_event, settings: unknown) => {
    if (!settings || typeof settings !== "object") {
      throw new Error("Invalid settings");
    }
    const s = settings as Record<string, unknown>;
    const folderKeys = ["gmailIncludeSpam", "gmailIncludeTrash"] as const;
    const updateFolders = folderKeys.some((key) => s[key] !== undefined);
    if (updateFolders) {
      for (const key of folderKeys) {
        if (s[key] !== undefined && typeof s[key] !== "boolean") throw new Error(`Invalid ${key}`);
      }
      const email = getActiveEmail();
      if (!email || loadCredentials()?.providerType !== "gmail") throw new Error("Select a Gmail account first");
      const next = {
        gmailIncludeSpam: (s.gmailIncludeSpam as boolean | undefined) ?? (getSetting("gmailIncludeSpam") === "true"),
        gmailIncludeTrash: (s.gmailIncludeTrash as boolean | undefined) ?? (getSetting("gmailIncludeTrash") === "true"),
      };
      if (folderKeys.some((key) => next[key] !== (getSetting(key) === "true"))) {
        await stopSync(email);
        if (getActiveEmail() !== email) throw new Error("Account changed; save the folder selection again");
        saveGmailFolderSettings(next);
        startAllSyncs();
      }
    }
    const changedKeys = Object.keys(s).join(", ");
    dataLog.info(`Settings saved: ${changedKeys}`);

    if (s.autoLaunch !== undefined) {
      if (typeof s.autoLaunch !== "boolean") throw new Error("Invalid autoLaunch");
      saveGlobalSetting("autoLaunch", s.autoLaunch);
    }

    if (s.launchMinimized !== undefined) {
      if (typeof s.launchMinimized !== "boolean") throw new Error("Invalid launchMinimized");
      saveGlobalSetting("launchMinimized", s.launchMinimized);
    }

    if (s.autoLaunch !== undefined || s.launchMinimized !== undefined) {
      const autoLaunch = getGlobalSetting("autoLaunch") ?? false;
      const minimized = getGlobalSetting("launchMinimized") ?? false;
      applyAutoLaunch(autoLaunch, minimized);
    }

    if (s.userName !== undefined) {
      if (typeof s.userName !== "string") throw new Error("Invalid userName");
      saveSetting("userName", s.userName);
    }

    if (s.colorTheme !== undefined) {
      if (s.colorTheme !== "dim" && s.colorTheme !== "silk") {
        throw new Error("Invalid colorTheme");
      }
      saveGlobalSetting("colorTheme", s.colorTheme);
    }
  });

  // --- Shell ---

  ipcMain.handle(IPC.openExternal, (_event, url: unknown) => {
    if (!isString(url) || url.trim() === "") return;

    try {
      const parsed = new URL(url);
      if (["https:", "http:", "mailto:"].includes(parsed.protocol)) {
        shell.openExternal(url);
      }
    } catch {
      // Invalid URL, ignore
    }
  });
}
