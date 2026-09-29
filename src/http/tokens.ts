/**
 * Shared primitives for the capability tokens and content hashes used throughout the
 * live-caption and experience APIs: base64url encoding, a cryptographically random
 * 32-byte token (encodes to exactly 43 characters), SHA-256 hex digests used to store or
 * compare a secret without keeping the secret itself, and the validation patterns that
 * match what these functions produce.
 */

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function base64UrlDecode(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** A fresh, cryptographically random capability token: 32 random bytes, base64url-encoded
 * to exactly 43 characters. Matches `CAPABILITY_TOKEN_PATTERN`. */
export function randomToken(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

/** Matches exactly what `randomToken` produces. */
export const CAPABILITY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

/** Matches a lowercase SHA-256 hex digest, e.g. from `sha256Hex`. */
export const HASH_HEX_PATTERN = /^[a-f0-9]{64}$/u;

/** Matches a UUID's canonical lowercase-hex-with-hyphens form (36 characters). */
export const UUID_PATTERN = /^[a-f0-9-]{36}$/u;

/** Lowercase hex SHA-256 digest of `text`, used to store or compare a secret without
 * keeping the secret itself (a capability token, an operator identity, ...). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
