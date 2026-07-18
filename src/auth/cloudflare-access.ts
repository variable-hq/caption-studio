import { createRemoteJWKSet, jwtVerify } from "jose";

export class CloudAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function accessConfiguration() {
  const audience = process.env.CLOUDFLARE_ACCESS_AUD?.trim();
  const teamDomain = process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN?.trim().replace(/\/+$/, "");
  return { audience, teamDomain };
}

export function isCloudAccessConfigured() {
  const { audience, teamDomain } = accessConfiguration();
  return Boolean(audience && teamDomain);
}

export async function requireCloudAccess(request: Request) {
  const { audience, teamDomain } = accessConfiguration();

  if (!audience || !teamDomain) {
    if (process.env.NODE_ENV !== "production") return;
    throw new CloudAccessError(
      "Cloudflare Access is not configured for this deployment.",
      503,
    );
  }

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) {
    throw new CloudAccessError("Authentication is required.", 401);
  }

  try {
    const keys = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    await jwtVerify(token, keys, {
      issuer: teamDomain,
      audience,
    });
  } catch {
    throw new CloudAccessError("The Cloudflare Access session is invalid.", 401);
  }
}
