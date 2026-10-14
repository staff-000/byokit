# Model call verification

The [verification page](https://staff-000.github.io/byokit/verification.html) uses
byokit to display the complete model list and run explicit inference checks.
GitHub sign-in is required. Browsing and copied code do not require sign-in.

## Use the page

1. Sign in with GitHub. The website verifies your identity through the auth service.
2. Select a model and review its tags, provider, endpoint and current settings.
3. Enter that provider's API key. Your key stays in page memory and goes directly
   to the provider; refreshing, signing out or leaving clears it.
4. Click **Verify model**. This small text-generation request may use your quota.
5. A successful hosted-model call saves a minimal browser record and submits an
   attributed community report. GitHub Actions validates it, commits/pushes the
   catalog update, and redeploys the website. The page distinguishes a successful
   call from a submitted/published contribution.

Local-server checks stay in the browser. Custom IDs or settings that do not match
an existing catalog offering cannot be published as verification of that offering.
Failures do not create success records. No provider retry, model substitution or
quota-consuming test occurs automatically.

## Privacy and identity

AI keys, authentication headers, prompts and generated text never enter GitHub,
public reports or the verification service. Copies use environment-key callbacks.
Your public GitHub handle is recorded as the contributor. OAuth access tokens stay
server-side transiently; the frontend uses a short-lived memory-only session token.

Signed reports contain only model/offering IDs, protocol, timestamp, latency and
output budget. Identity comes from GitHub, never a manually typed username.
Reports describe one contributor's successful call under those settings. They do
not prove every account has access or override provider retirement metadata.
Browser-reported inference success cannot be independently proven without moving
credentials/inference to a server, which this design deliberately avoids.

## Website implementation

Discovery/filtering and the hero provider list call `byokit.getModels()`. Inference
calls `byokit.openAI(...).chat.completions.create(...)`. Provider URLs come from the
library's shared connection map, not another website-maintained list. JavaScript
and Python copy examples use SDK-shaped clients; cURL shows native HTTP.

The homepage also demonstrates `byokit.claude(...).messages.create(...)`.
Cancellation and the 90-second inference deadline remain active. Browser CORS or
local-network restrictions can prevent a call; no proxy receives the user's key.

## Maintainer activation

[GitHub App and auth-service setup](../services/verification/README.md) is required
before signed-in verification can operate on the public site. Missing configuration
shows a clear unavailable state and blocks anonymous inference/publication.
Catalog queries remain offline and use the pinned release snapshot. Refresh the
catalog and release the application to update model choices without rewriting code.
