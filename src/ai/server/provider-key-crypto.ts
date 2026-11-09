import type { KeyedProviderId } from "@/ai/providers";
import { base64UrlDecode, base64UrlEncode } from "@/http/tokens";

const MINIMUM_SECRET_LENGTH = 32;

export class ProviderKeyEncryptionError extends Error {}

function requireSecret(secret?: string) {
  const value = secret?.trim();
  if (!value || value.length < MINIMUM_SECRET_LENGTH) {
    throw new ProviderKeyEncryptionError("The provider key encryption secret is not configured.");
  }
  return value;
}

async function encryptionKey(secret?: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requireSecret(secret)));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

// Binding the provider as associated data stops a ciphertext saved for one provider
// from being replayed as another provider's key.
function associatedData(provider: KeyedProviderId) {
  return new TextEncoder().encode(`caption-studio:provider-key:v1:${provider}`);
}

export async function encryptProviderKey(provider: KeyedProviderId, apiKey: string, secret?: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: associatedData(provider) },
    await encryptionKey(secret),
    new TextEncoder().encode(apiKey),
  );
  return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(ciphertext))}`;
}

export async function decryptProviderKey(provider: KeyedProviderId, payload: string, secret?: string) {
  const [encodedIv, encodedCiphertext, extra] = payload.split(".");
  if (!encodedIv || !encodedCiphertext || extra !== undefined) {
    throw new ProviderKeyEncryptionError("The saved provider key is invalid.");
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlDecode(encodedIv), additionalData: associatedData(provider) },
      await encryptionKey(secret),
      base64UrlDecode(encodedCiphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    if (error instanceof ProviderKeyEncryptionError) throw error;
    throw new ProviderKeyEncryptionError("The saved provider key could not be decrypted.");
  }
}
