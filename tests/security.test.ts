import { runSecuritySelfTest } from "../src/application/security-self-test.js";

const result = runSecuritySelfTest();
if (!result.passed) throw new Error("Security self-test failed");
console.log("Security checks passed:", result.checks.join(", "));
