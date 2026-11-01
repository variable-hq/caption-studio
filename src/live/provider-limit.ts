import { CloudProviderClientError } from "@/ai/cloud-provider-client";

/**
 * A provider rate-limit or usage-limit response. The client already reads the provider's
 * reported limits, so no provider numbers are hard-coded here.
 */
export function isProviderLimitError(error: unknown): boolean {
  if (!(error instanceof CloudProviderClientError)) return false;
  if (error.status === 429) return true;
  const rateLimit = error.rateLimit;
  return (
    rateLimit?.requestsPerDay?.remaining === 0 ||
    rateLimit?.tokensPerMinute?.remaining === 0
  );
}
