import { base64UrlDecode, base64UrlEncode } from "@/http/tokens";

const MINIMUM_KEY_LENGTH = 32;

export class ChannelEncryptionError extends Error {}

function requireSecret(secret?: string) {
  const value = secret?.trim();
  if (!value || value.length < MINIMUM_KEY_LENGTH) {
    throw new ChannelEncryptionError(
      "The reusable OBS channel encryption key is not configured.",
    );
  }
  return value;
}

async function encryptionKey(secret?: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(requireSecret(secret)),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptOverlayToken(token: string, secret?: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    new TextEncoder().encode(token),
  );
  return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(ciphertext))}`;
}

export async function decryptOverlayToken(payload: string, secret?: string) {
  const [encodedIv, encodedCiphertext, extra] = payload.split(".");
  if (!encodedIv || !encodedCiphertext || extra) {
    throw new ChannelEncryptionError("The reusable OBS channel credential is invalid.");
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlDecode(encodedIv) },
      await encryptionKey(secret),
      base64UrlDecode(encodedCiphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    if (error instanceof ChannelEncryptionError) throw error;
    throw new ChannelEncryptionError(
      "The reusable OBS channel credential could not be decrypted.",
    );
  }
}
