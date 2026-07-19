import { createRemoteJWKSet, jwtVerify } from "jose";

export class CloudAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface CloudAccessConfiguration {
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

export async function requireCloudAccess(
  request: Request,
  configuration?: CloudAccessConfiguration,
) {
  const { audience, teamDomain } = accessConfiguration(configuration);

  if (!audience || !teamDomain) {
    if (configuration?.allowUnconfigured ?? process.env.NODE_ENV !== "production") {
      return;
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
    await jwtVerify(token, accessKeys(teamDomain), {
      issuer: teamDomain,
      audience,
    });
  } catch {
    throw new CloudAccessError("The Cloudflare Access session is invalid.", 401);
  }
}
