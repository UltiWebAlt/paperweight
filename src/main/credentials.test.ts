import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let userDataDir = "";

const mockSafeStorage = {
  isEncryptionAvailable: jest.fn(() => false),
  encryptString: (value: string) => Buffer.from(value, "utf-8"),
  decryptString: (data: Buffer) => data.toString("utf-8"),
};

jest.mock("electron", () => ({
  app: {
    getPath: (name: string) => (name === "userData" ? userDataDir : "/tmp"),
  },
  safeStorage: mockSafeStorage,
}));

import {
  listAccounts,
  setAccountLabel,
  registerAccount,
  deleteCredentials,
  emailToFileKey,
  hasCredentials,
  loadCredentials,
  resetCredentialsModuleState,
  saveCredentials,
  setStagingMode,
} from "./credentials";
import { resetGlobalSettingsCache } from "./services/globalSettings";

describe("credentials without active account", () => {
  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), "paperweight-creds-"));
    resetCredentialsModuleState();
    resetGlobalSettingsCache();
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
  });

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it("persists trimmed labels without changing other accounts and preserves them on registration", () => {
    writeFileSync(join(userDataDir, "accounts.json"), JSON.stringify({ accounts: [
      { email: "one@example.com", providerType: "gmail" },
      { email: "two@example.com", providerType: "imap", label: "Work" },
    ] }));
    setAccountLabel("one@example.com", "  Personal  ");
    expect(listAccounts().map((account) => account.label)).toEqual(["Personal", "Work"]);
    registerAccount("one@example.com", "gmail");
    expect(listAccounts()[0].label).toBe("Personal");
    setAccountLabel("one@example.com", "  ");
    expect(listAccounts()[0].label).toBeUndefined();
    expect(() => setAccountLabel("missing@example.com", "Work")).toThrow("Account not found");
    expect(() => setAccountLabel("one@example.com", "x".repeat(41))).toThrow();
  });

  it("loadCredentials returns undefined without throwing", () => {
    expect(loadCredentials()).toBeUndefined();
  });

  it("deleteCredentials no-ops without throwing and does not touch files", () => {
    const orphan = join(userDataDir, "orphan.enc");
    writeFileSync(orphan, "keep");

    expect(() => deleteCredentials()).not.toThrow();
    expect(existsSync(orphan)).toBe(true);
  });

  it("hasCredentials returns false", () => {
    expect(hasCredentials()).toBe(false);
  });

  it("loadCredentials with staging override works without active account", () => {
    const creds = { providerType: "gmail" as const, gmail: { accessToken: "a", refreshToken: "r", expiresAt: 1 } };
    saveCredentials(creds, "__staging__");

    expect(loadCredentials("__staging__")).toEqual(creds);
  });

  it("loadCredentials in staging mode uses staging file without active account", () => {
    const creds = { providerType: "microsoft" as const, microsoft: { accessToken: "a", refreshToken: "r", expiresAt: 1 } };
    setStagingMode(true);
    saveCredentials(creds);

    expect(loadCredentials()).toEqual(creds);
  });
});

describe("credentials with active account", () => {
  const email = "user@example.com";

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), "paperweight-creds-"));
    resetCredentialsModuleState();
    resetGlobalSettingsCache();
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
    writeFileSync(join(userDataDir, "settings.json"), JSON.stringify({ activeAccount: email }));
  });

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it("loadCredentials returns undefined when credential file is missing", () => {
    expect(loadCredentials()).toBeUndefined();
  });

  it("saveCredentials and loadCredentials round-trip", () => {
    const creds = { providerType: "gmail" as const, gmail: { accessToken: "a", refreshToken: "r", expiresAt: 1 } };
    saveCredentials(creds);

    expect(loadCredentials()).toEqual(creds);
  });

  it("deleteCredentials removes the credential file", () => {
    const creds = { providerType: "gmail" as const, gmail: { accessToken: "a", refreshToken: "r", expiresAt: 1 } };
    saveCredentials(creds);
    const credPath = join(userDataDir, `${emailToFileKey(email)}.enc`);
    expect(existsSync(credPath)).toBe(true);

    deleteCredentials();

    expect(existsSync(credPath)).toBe(false);
  });
});

describe("loadCredentials plain-text fallback", () => {
  const email = "user@example.com";
  const creds = { providerType: "imap" as const, imap: { host: "imap.test", port: 993, tls: true, username: email, password: "x" } };

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), "paperweight-creds-"));
    resetCredentialsModuleState();
    resetGlobalSettingsCache();
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
    mockSafeStorage.decryptString = jest.fn(() => {
      throw new Error("not encrypted");
    });
    writeFileSync(join(userDataDir, "settings.json"), JSON.stringify({ activeAccount: email }));
    writeFileSync(join(userDataDir, `${emailToFileKey(email)}.enc`), JSON.stringify(creds), "utf-8");
  });

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
    mockSafeStorage.decryptString = (data: Buffer) => data.toString("utf-8");
  });

  it("reads plain JSON when decrypt fails (dev fixtures, CI stored profile)", () => {
    expect(loadCredentials()).toEqual(creds);
  });
});
