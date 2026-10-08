export interface OIDCConfiguration { issuer:string; audience:string; requiredClaims:string[]; clockSkewSeconds:number; }
export interface OIDCVerifierAdapter { verify(token:string,configuration:OIDCConfiguration):Promise<Record<string,unknown>>; }

export function validateOIDCClaims(claims:Record<string,unknown>,configuration:OIDCConfiguration,nowSeconds=Math.floor(Date.now()/1000)):void{
  if(claims.iss!==configuration.issuer)throw new Error("OIDC issuer mismatch.");
  const aud=Array.isArray(claims.aud)?claims.aud.map(String):[String(claims.aud??"")];
  if(!aud.includes(configuration.audience))throw new Error("OIDC audience mismatch.");
  const exp=Number(claims.exp??0);
  if(!exp || exp+configuration.clockSkewSeconds<nowSeconds)throw new Error("OIDC token is expired.");
  for(const claim of configuration.requiredClaims)if(claims[claim]===undefined)throw new Error(\`Required OIDC claim is missing: \${claim}\`);
  if(typeof claims.sub!=="string"||!claims.sub)throw new Error("OIDC subject is required.");
}
