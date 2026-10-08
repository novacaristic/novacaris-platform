import { spawnSync } from "node:child_process";

const commands = [
  ["node", ["--experimental-strip-types", "tests/security.test.ts"]],
  ["node", ["--experimental-strip-types", "tests/readiness.test.ts"]],
  ["node", ["--experimental-strip-types", "tests/oidc.test.ts"]],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("NovaCaris test suite passed.");
