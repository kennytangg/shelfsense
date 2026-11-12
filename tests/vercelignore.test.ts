import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Minimal gitignore matcher for the syntax .vercelignore actually uses:
// comments, "!" negation, trailing "/" (directory only), leading "/" or a
// middle "/" (anchored to the root), and "*" globs. Anything else throws so an
// unknown pattern fails the test instead of silently matching nothing.
type Rule = {
  negated: boolean;
  dirOnly: boolean;
  anchored: boolean;
  regex: RegExp;
};

const UNSUPPORTED = /[\\?[\]]|\*\*/;

function parseRule(line: string): Rule {
  if (UNSUPPORTED.test(line) || /\s$/.test(line)) {
    throw new Error(
      `Unsupported .vercelignore syntax: ${JSON.stringify(line)}`,
    );
  }
  let body = line;
  const negated = body.startsWith("!");
  if (negated) body = body.slice(1);
  const dirOnly = body.endsWith("/");
  if (dirOnly) body = body.slice(0, -1);
  const anchored = body.includes("/");
  if (body.startsWith("/")) body = body.slice(1);
  if (!body)
    throw new Error(`Empty .vercelignore pattern: ${JSON.stringify(line)}`);
  const source = body
    .split("*")
    .map((part) => part.replace(/[.+^${}()|]/g, "\\$&"))
    .join("[^/]*");
  return { negated, dirOnly, anchored, regex: new RegExp(`^${source}$`) };
}

export function parseRules(text: string): Rule[] {
  return text
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map(parseRule);
}

function ruleMatches(rule: Rule, segments: string[], isDir: boolean): boolean {
  if (rule.dirOnly && !isDir) return false;
  const target = rule.anchored
    ? segments.join("/")
    : segments[segments.length - 1];
  return rule.regex.test(target);
}

// A path is excluded if it, or any parent directory, is excluded. Negation
// cannot re-include a file whose parent directory is excluded (git semantics).
export function isExcluded(rules: Rule[], path: string): boolean {
  const parts = path.split("/");
  for (let i = 1; i <= parts.length; i += 1) {
    const isDir = i < parts.length;
    let ignored = false;
    for (const rule of rules) {
      if (ruleMatches(rule, parts.slice(0, i), isDir)) ignored = !rule.negated;
    }
    if (ignored) return true;
  }
  return false;
}

const rules = parseRules(readFileSync(".vercelignore", "utf8"));

test("matcher follows gitignore semantics for the syntax in use", () => {
  const sample = parseRules(
    "/backend/\nmedia/\n.env\n.env.*\n!.env.example\n*.dump",
  );
  assert.equal(isExcluded(sample, "backend/.env"), true);
  assert.equal(isExcluded(sample, "src/backend/x.ts"), false);
  assert.equal(isExcluded(sample, "src/app/media/route.ts"), true);
  assert.equal(isExcluded(sample, ".env.local"), true);
  assert.equal(isExcluded(sample, ".env.example"), false);
  assert.equal(isExcluded(sample, "a/b/db.dump"), true);
  assert.throws(() => parseRules("**/foo"), /Unsupported/);
});

test(".vercelignore excludes local data, env files and dumps", () => {
  for (const path of [
    "backend/media/a.png",
    "backend/.env",
    "media/a.png",
    ".shelfsense-dev.json",
    ".env",
    ".env.local",
    "backup.dump",
    "backup.sql.gz",
  ]) {
    assert.equal(isExcluded(rules, path), true, `${path} should be excluded`);
  }
  assert.equal(isExcluded(rules, ".env.example"), false);
});

test(".vercelignore does not exclude tracked source files", () => {
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter((p) => /^(src|migrations|scripts|public)\//.test(p));
  assert.ok(tracked.length > 0);
  const excluded = tracked.filter((path) => isExcluded(rules, path));
  assert.deepEqual(excluded, [], "tracked files excluded from Vercel uploads");
});
