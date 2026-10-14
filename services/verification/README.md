# GitHub verification service setup

The GitHub Pages frontend cannot hold OAuth secrets or a repository-write credential.
This small Cloudflare Worker handles GitHub identity and signed contribution dispatches.
AI calls run in the browser through byokit. AI keys, prompts and generated text never
enter this service, GitHub events, commits or logs.

## One-time activation

1. Deploy this Worker on your hosting account. `wrangler.jsonc` includes public settings
   only; use your hosting secret manager for all secrets. The service returns 503 until
   configuration is complete. An equivalent Workers-compatible host can be used.
2. Register a dedicated GitHub App with callback `https://YOUR_SERVICE/auth/callback`.
   Enable user authorization (web application OAuth) and install it on **only**
   `staff-000/byokit`. Repository permissions: **Contents: read/write** and the default
   Metadata read permission. No private-user-data permissions are required.
3. Put the public App ID, OAuth Client ID and installation ID into the Worker settings.
   Set `PUBLIC_SITE_URL` to `https://staff-000.github.io/byokit/verification.html`.
4. Set protected Worker secrets: `GITHUB_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`,
   `SESSION_SECRET` and `PUBLICATION_SECRET`. Generate independent random secrets
   of at least 32 bytes for the latter two. Never put them in source files, a public
   environment file, the Pages build, shell arguments, or this chat.
5. Add the same publication signing secret as the GitHub Actions repository secret
   **BYOKIT_PUBLICATION_SECRET**. Set repository variable **BYOKIT_VERIFICATION_API_URL**
   to the HTTPS service URL. Trigger the existing Pages deployment to activate login.
6. Sign in on the live page and explicitly verify one hosted model with your own key.
   Check the resulting contributor record, commit, and Pages update. These checks
   consume provider quota; unit/browser fixtures do not substitute for this live check.

Deployment entry point: `worker.mjs`. Example local commands (no secrets in arguments):

```sh
cd services/verification
npx wrangler deploy
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GITHUB_APP_PRIVATE_KEY
npx wrangler secret put SESSION_SECRET
npx wrangler secret put PUBLICATION_SECRET
```

The app's installation private key is used only for short-lived installation tokens.
GitHub user access tokens are used once to fetch identity and are not persisted. The
browser holds a one-hour byokit session token in memory; refresh/sign-out clears it.
OAuth uses a signed, expiring state bound to an HttpOnly cookie and a PKCE verifier.

## Publication

A successful browser call submits only an operation UUID, offering/model IDs, protocol,
checked-at time, latency, and output budget. The service verifies identity and exact
catalog settings, signs the submission, and dispatches `byokit-verification` to GitHub.
The Actions workflow validates the signature, appends an attributed community report,
synchronizes JS/Python catalogs, commits/pushes, and calls the Pages deploy workflow.
It explicitly redeploys because GITHUB_TOKEN pushes do not start another push workflow.

Concurrent pushes retry against current main; Pages checks the current main revision
before deploying so an older queued build cannot overwrite newer catalog changes; repeated operations are idempotent.
Failures retain the browser record and do not call the provider again. Publication
requires the selected catalog-hosted model and matching provider protocol. Local
servers and arbitrary custom model IDs cannot establish global model availability.
The service caps a contributor at 10 successful publications per 24 hours.

GitHub identity is verified. Inference success is a **community report**, not an
independent server-side inference proof: a browser client can fabricate a success.
No community report overrides upstream retirement or account-access information.

## Current activation state

Source, workflow and mocked tests are ready. No GitHub App, hosting deployment,
private key or OAuth secret is provisioned by checking these files into the repo.
Until the service URL and protected credentials are configured, the website shows
verification as temporarily unavailable; discovery and copied call examples work.
