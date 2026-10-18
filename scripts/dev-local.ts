import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { isAbsolute, join } from "path";
import { execFileSync, spawn } from "child_process";

const root = process.cwd();
const userDataDir = join(tmpdir(), "paperweight-local");
mkdirSync(userDataDir, { recursive: true });

// Yarn supplies its resolved entry point when running a package script. Invoke it
// through the current Node executable rather than searching PATH again.
const yarnPath = process.env.npm_execpath;
if (!yarnPath || !isAbsolute(yarnPath)) {
  throw new Error("Start local development with yarn dev:local");
}

execFileSync(process.execPath, [yarnPath, "seed:test-account", userDataDir], {
  cwd: root,
  stdio: "inherit",
});

const child = spawn(process.execPath, [yarnPath, "exec", "electron-vite", "dev"], {
  cwd: root,
  env: {
    ...process.env,
    PAPERWEIGHT_SEED: userDataDir,
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
