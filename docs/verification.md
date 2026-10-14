# Model inference verification

Use [the verification page](https://staff-000.github.io/byokit/verification.html)
to answer one question: **can these settings make an actual model call?**

## How to verify

1. Browse the complete LIVE offering list, including provider, model ID, context
   and tags. Search or filter by provider, then click **Verify** on a model.
2. Enter that provider's API key. The selected provider and exact request
   destination are displayed. For Local, enter the server URL and served model ID.
3. Choose the API protocol. OpenAI offers Responses or Chat Completions; other
   providers use their documented native or compatible endpoint.
4. Optionally change the prompt and output token limit. The default prompt is
   `Reply with exactly: OK`, with a 256-token output limit.
5. Click **Verify model**. This sends one real, non-streaming inference request
   directly from your browser. It may consume provider quota. Nothing is sent
   while you browse, enter a key, or change settings.
6. A successful nonempty text response is displayed, and a success record is
   saved in this browser. Failure, cancellation, timeout, or an empty response
   never creates a successful record. No automatic retries or model substitutions
   occur. The response does not need to match the word OK; success means visible
   text generation worked with the chosen settings.

## Copy the API call

Expand **Copy this API call** for JavaScript/TypeScript, Python, or cURL that
matches the selected endpoint, model ID, protocol, prompt and output limit.
Examples use an `API_KEY` environment variable and never include the entered key.
Displaying or copying code makes no request. The code prints the provider’s native
JSON response. Node.js/Python examples reject redirects to protect credential
destinations. The README also has complete byokit-query and DeepSeek inference
examples.

## API keys and privacy

Keys stay only in this page's memory. They are sent in authentication headers
only to the selected provider, never to a byokit backend, URL, record, log, or
browser storage. Refreshing/leaving the page clears the key. Switching providers
or changing a local endpoint clears the key. **Clear API key** removes it now.
Responses are rendered as text. Prompts and generated text are not persisted.
The page has no analytics and no server proxy that receives your credentials.
The provider receives your key and prompt according to its own API policies.

## What a success record contains

- Exact offering/provider/model ID and provider-returned model ID.
- API protocol and endpoint, output limit, checked time, and latency.
- Numeric token usage when the provider returns it.
- `textGeneration` as the verified check and `this-browser` as its scope.

Changing the key, protocol, model, or other settings requires a new check. A saved
record is evidence of a past call; it does not prove current account access, all
model capabilities, accurate tags, or continued availability. Tags remain catalog
metadata until those capabilities are separately tested.

Records are stored locally under `byokit.inference-verifications.v1`, with a
200-record limit. If storage is unavailable, they stay in memory for the visit.
Use **Export records** to save a JSON file, or **Clear records** to remove them.
Exports contain endpoint addresses; review them before sharing private local
server details. The export includes no credentials, prompt, or generated text.

## Shared contributor reports

GitHub Pages has no shared write backend. Browser records are **not automatically
published** or treated as authenticated contributor claims. To contribute, export
and review a real result, add your contributor identity and reviewable evidence,
then submit the canonical report shape described in
[CONTRIBUTING.md](../CONTRIBUTING.md). Reports in
[catalog/verifications.json](../catalog/verifications.json) are reviewed separately.

## Connection failures

Some providers or local servers block direct browser requests through CORS or
local-network permissions. Such failures do not establish that a model itself is
unavailable; the page records no successful verification. Allow your site origin
in the local server configuration or run the example from an allowed origin.
Provider authentication, permission, unavailable model, rate limit, and quota
failures are displayed without exposing a key in the error message.

Reasoning models may spend a small output limit on hidden reasoning and produce
no visible text. Increase the limit explicitly if you want to try again. Calls
have a 90-second timeout and a Cancel button. Cancellation cannot refund consumed
quota.

The website verification flow invokes the stateless library calls. Shared adapters
live in `packages/core/call.js`; `website/inference.js` adds verification-specific
record formatting. Authentication headers are transient; no credential store is
created by the call layer.
Sources: [OpenAI](https://developers.openai.com/api/reference),
[Anthropic](https://platform.claude.com/docs/en/api/messages/create),
[Gemini](https://ai.google.dev/api/generate-content),
[OpenRouter](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request),
[DeepSeek](https://api-docs.deepseek.com/api/create-chat-completion),
[Mistral](https://docs.mistral.ai/api), [Groq](https://console.groq.com/docs/api-reference),
[Zhipu](https://docs.bigmodel.cn),
[SiliconFlow](https://docs.siliconflow.cn/docs/api/chat-completions-post),
[Ollama](https://docs.ollama.com/api/chat).

Internal checks and run records remain in
[the development tracker](development-verification.md); they are not presented
as model verification on the website.

JavaScript and Python copied examples use SDK-shaped clients; cURL shows the equivalent
native HTTP request. The homepage also demonstrates Claude-style `client.messages.create()` responses.
