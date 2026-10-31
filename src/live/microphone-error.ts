import type { MessageKey } from "@/i18n";

type Translate = (key: MessageKey) => string;

/** Keep the browser's own microphone message when present, otherwise use the UI locale. */
export function microphoneErrorMessage(error: unknown, translate: Translate) {
  return error instanceof Error
    ? error.message
    : translate("live.message.microphoneAccessFailed");
}
