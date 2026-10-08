export interface SecurityConfiguration {
  issuerUrl: string;
  audience: string;
  requiredClaims: string[];
  sessionMaxAgeSeconds: number;
}

export function validateSecurityConfiguration(
  config: SecurityConfiguration,
): string[] {
  const errors: string[] = [];
  if (!config.issuerUrl.startsWith("https://")) errors.push("OIDC issuer must use HTTPS.");
  if (!config.audience) errors.push("OIDC audience is required.");
  if (config.sessionMaxAgeSeconds <= 0) errors.push("Session max age must be positive.");
  return errors;
}
