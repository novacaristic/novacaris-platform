import { validateOIDCClaims } from "../src/application/oidc.js";

const config = {
  issuer: "https://issuer.example",
  audience: "novacaris",
  requiredClaims: ["sub"],
  clockSkewSeconds: 30,
};
const now = Math.floor(Date.now() / 1000);
validateOIDCClaims({ iss: config.issuer, aud: config.audience, sub: "user-1", exp: now + 300 }, config, now);

let rejected = false;
try {
  validateOIDCClaims({ iss: "https://wrong", aud: config.audience, sub: "user-1", exp: now + 300 }, config, now);
} catch { rejected = true; }
if (!rejected) throw new Error("OIDC issuer mismatch was not rejected");
console.log("OIDC checks passed.");
