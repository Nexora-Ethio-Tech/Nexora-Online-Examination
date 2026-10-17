# AI provider configuration

The integration work uses an OpenAI-compatible Chat Completions endpoint, as selected by the owner on 17 October 2026. Configure these values privately in `nexora-backend/.env` or the backend host's secret settings:

```dotenv
OPENAI_API_KEY=your-private-provider-key
OPENAI_BASE_URL=https://your-provider.example/v1
OPENAI_MODEL=your-provider-model-id
# Optional; default 2500, supported range 256–16000
OPENAI_MAX_COMPLETION_TOKENS=2500
```

The base URL is the API root; do not append `/chat/completions`. If omitted, the root defaults to `https://api.openai.com/v1`. The model has no default. These are backend-only settings: never prefix them with `VITE_`, commit the key, or include it in frontend configuration. A custom provider receives exam question content, the teacher's answer key, subject, grade, language and topic names. Choose a trusted provider. Student identities and credentials are excluded from the accepted input shape.

The provider must implement Chat Completions and strict `response_format: json_schema`, return token usage, and support `max_completion_tokens`. See the [official request specification](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create). Compatibility with an arbitrary proxy is not assumed. Unsupported structured output fails explicitly; the adapter does not downgrade to unvalidated free text.

HTTPS is required, except loopback HTTP during local development. Redirects are refused. Each call has a 30-second timeout and a 128 KiB response limit. Provider errors are sanitized, and returned suggestions contain no answer-key field. Missing configuration, refusal, truncation, invalid JSON or invalid suggestions never produce fabricated fallback explanations.

## Current verification boundary

The adapter has six isolated tests covering the configured endpoint/model, secret-free return values, output validation, immutable input, rate limiting and response limits. These tests use synthetic provider responses. The configured `openrouter/free` alias returned a correct English sample for `2x + 3 = 11`: `x = 4`, with 182 input and 601 output tokens reported. The Amharic sample was truncated at the default allowance; a diagnostic retry with a 6000-token allowance timed out at 30 seconds. Amharic acceptance has not passed. The owner explicitly deferred Amharic testing after these results. English integration may proceed; Amharic AI quality remains unverified. A specific model with predictable structured-output and multilingual support will be needed before accepting that language. The saved environment was not changed by these diagnostic overrides. Durable worker retry/budget enforcement and completed authoring integration also remain acceptance work.

Run the adapter tests from `nexora-backend`:

```powershell
npx vitest run test/unit/ai-provider.spec.ts
```

The durable worker must own two-call concurrency, at most two retries, leases, token budgets, school-scoped caching and version checks before applying suggestions. A successful adapter call alone must never mark a question reviewed or overwrite a newer teacher edit.

For the explicitly authorized synthetic live check (calls the configured provider and may consume credits):

```powershell
npx tsx scripts/check-ai-provider.ts
# Or one language only:
npx tsx scripts/check-ai-provider.ts am
```
