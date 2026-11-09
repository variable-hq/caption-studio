# ADR 0041: Workspace-chosen AI providers with saved API keys

Date: 8 November 2026. Status: accepted; it amends [ADR 0002](0002-free-cloud-first-ai.md) and [ADR 0011](0011-service-history-and-optional-inference.md) by letting a workspace send live transcription or translation to a paid provider on its own key, while Groq on the deployment key stays the default.

## Decision

- Settings › AI providers chooses one provider and model per stage for the whole workspace. Transcription: Groq or OpenAI. Translation: Groq, OpenAI, Claude (Anthropic) or DeepSeek. Claude and DeepSeek have no speech-to-text API, so they are offered for translation only.
- OpenAI transcription defaults to `whisper-1`, which returns the same `verbose_json` segment metadata as Groq Whisper, so the transcript guard, prompt budget and 400 fallback work unchanged. Default translation models are `gpt-5.4-nano`, `claude-opus-5-5` and `deepseek-flash`; an operator may enter another model id, and readiness checks the key can use it.
- OpenAI, Claude and DeepSeek keys are saved per workspace in the `workspace:providers` `OperatorPreferences` object. The Worker encrypts each key with AES-GCM under the separate `PROVIDER_KEY_ENCRYPTION_KEY` secret, binding the provider as associated data, and stores only ciphertext, the last four characters and the save time. Keys are write-only: no route returns a key or its ciphertext. Groq keeps using the `GROQ_API_KEY` deployment secret.
- A stage cannot select a provider whose key is not saved, and a key cannot be removed while a stage uses it. Each inference request resolves the provider before usage admission; a missing or unreadable key, or an unreadable store, fails closed instead of falling back to another provider.
- Translation sends the same server envelope and untrusted-data message to every provider. Claude uses the official Anthropic SDK with adaptive thinking at low effort and, on models that support it, server-side refusal fallbacks (`fallbacks: "default"`); only `end_turn` output is publishable. OpenAI reasoning models (`gpt-5*`, `o*`) and Claude get a 2,048-token completion cap to leave room for reasoning; the others keep 256.
- The usage ledger records the provider that ran each attempt.

## Tradeoffs and verification

- This is the owner decision that SECURITY.md requires before paid inference: usage on a saved key is billed to that key's account and is not covered by the free-plan headroom the dashboard shows. Only Groq and OpenAI return rate-limit headers the dashboard can read.
- Each provider's own retention terms apply to captions sent to it; Groq Zero Data Retention says nothing about OpenAI, Anthropic or DeepSeek. Verify each account's data controls before real-service use.
- Any Access-approved operator can replace or remove a workspace key, as with the rest of the shared setup. Rotating `PROVIDER_KEY_ENCRYPTION_KEY` makes every saved key unreadable until it is saved again.
- Model ids and provider parameters drift; readiness proves the key and model, not translation quality. Claude's larger cap and reasoning add latency compared with Groq.
- Unit tests cover selection rules, encryption binding, the browser-safe view, the route, provider request shapes and Claude stop-reason handling. No real provider call was made.
