import { createRemoteJWKSet, jwtVerify } from "jose";

export class CloudAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface CloudAccessConfiguration {
  audience?: string;
  teamDomain?: string;
  allowUnconfigured?: boolean;
}

const remoteKeySets = new Map<
  string,
  ReturnType<typeof createRemoteJWKSet>
>();

function accessConfiguration(configuration?: CloudAccessConfiguration) {
  const audience = (
    configuration?.audience ?? process.env.CLOUDFLARE_ACCESS_AUD
  )?.trim();
  const teamDomain = (
    configuration?.teamDomain ?? process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN
  )
    ?.trim()
    .replace(/\/+$/, "");
  return { audience, teamDomain };
}

function accessKeys(teamDomain: string) {
  let keys = remoteKeySets.get(teamDomain);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    remoteKeySets.set(teamDomain, keys);
  }
  return keys;
}

export function isCloudAccessConfigured(configuration?: CloudAccessConfiguration) {
  const { audience, teamDomain } = accessConfiguration(configuration);
  return Boolean(audience && teamDomain);
}

export interface CloudAccessIdentity {
  /** Lower-cased Access email claim, or null when Access is not configured locally. */
  email: string | null;
}

export async function requireCloudAccess(
  request: Request,
  configuration?: CloudAccessConfiguration,
): Promise<CloudAccessIdentity> {
  const { audience, teamDomain } = accessConfiguration(configuration);

  if (!audience || !teamDomain) {
    if (configuration?.allowUnconfigured ?? process.env.NODE_ENV !== "production") {
      return { email: null };
    }
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
    const { payload } = await jwtVerify(token, accessKeys(teamDomain), {
      issuer: teamDomain,
      audience,
    });
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    return { email: email || null };
  } catch {
    throw new CloudAccessError("The Cloudflare Access session is invalid.", 401);
  }
}
