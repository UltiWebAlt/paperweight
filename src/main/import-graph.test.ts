import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guards the db.ts INVARIANT (see the comment atop db.ts): db.ts is loaded very
// early and by nearly everything, including during the account-connect DB swap,
// so its top-level import graph must stay light — no electron or heavy main-only
// modules. Heavy deps must be pulled in lazily (require()/await import()) inside
// functions. migrations.ts is included because db.ts imports migrateActionLog
// from it, so its top-level graph is part of db.ts's.
//
// This is a source scan, not a module load: it only reads file text, so it can't
// regress into the very load failure it protects against.

// Captures the specifier of each *value* `import ... from "x"` (multiline aware).
// Skips `import type` (erased at compile, never loaded) and lazy require()/import().
function topLevelValueImports(relPath: string): string[] {
  const src = readFileSync(join(process.cwd(), "src/main", relPath), "utf8");
  const specs: string[] = [];
  const re = /\bimport\s+(type\s+)?[\s\S]*?\bfrom\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m[1]) continue; // type-only import
    specs.push(m[2]);
  }
  return specs;
}

const isForbidden = (spec: string): boolean =>
  spec === "electron" ||
  spec.includes("/providers/") ||
  spec === "./sync" ||
  spec.endsWith("/sync");

describe("db.ts import-graph hygiene", () => {
  for (const file of ["db.ts", "migrations.ts"]) {
    it(`${file} pulls no electron / provider / sync modules at the top level`, () => {
      const forbidden = topLevelValueImports(file).filter(isForbidden);
      expect(forbidden).toEqual([]);
    });
  }

  it("sanity: the scanner sees the light imports that are present", () => {
    // If this returns nothing the regex is broken and the guard is worthless.
    expect(topLevelValueImports("db.ts")).toContain("better-sqlite3");
  });
});
