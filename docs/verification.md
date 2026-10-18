# Model call verification

Use [the verification page](https://staff-000.github.io/byokit/verification.html)
to select a model and test a real text-generation call with your own API key.
No byokit login is needed. A small call may consume your provider quota.

## Test and share

1. Select the exact provider/model and review its endpoint and settings.
2. Enter the provider API key and click **Verify model · earn a badge**.
3. After **Call succeeded**, click **Share on GitHub · claim badge**.
4. GitHub opens a prefilled issue. Sign in there if necessary, review the report,
   and click **Submit new issue**. Opening or closing the form does not publish it.
5. GitHub Actions validates the report, commits the catalog update, and deploys Pages.
   Return to the website to see **Published**, or use **Check publication**.

The page polls the public feed every 15 seconds for up to five minutes after sharing
or returning to the tab. A pending or failed publication never repeats inference.
Local-server checks stay private to your browser. Custom model IDs cannot verify a
different catalog offering. Browser CORS/network restrictions may prevent calls;
copy the SDK example to run locally. There is no key-bearing proxy.

## Privacy and meaning

Keys stay in page memory and go directly to the AI provider. They are never saved
in storage, included in issues, or sent to byokit. Refresh, navigation, provider
changes, and **Clear API key** clear the entry. Prompts and generated text stay out
of records and issue URLs. Public reports contain only version, report UUID,
offering/model IDs, protocol, check time, latency, and output budget.

GitHub supplies the issue author's identity. **Community verified by @user · date**
means that contributor reported a successful text call. Browser reports cannot
independently prove inference. Availability remains provider/account-specific:
a DeepSeek report does not verify its OpenRouter offering. Failures remain local.
Community verification never overrides upstream LIVE/OUTDATED/UNCERTAIN metadata.
The existing 90-day freshness window applies; historical reports remain evidence.

## Maintainer operation

No GitHub App, OAuth server, or extra deployment secrets are required. The issue
workflow needs repository Contents write permission, notification Issues write,
and the existing Pages deployment permissions. Branch rules must allow the
verification bot's commits. Enable Issues, Actions, and the existing Actions Pages
publishing source. Normal issues are ignored.

The workflow accepts strict reports checked within 24 hours before issue creation,
deduplicates by numeric contributor ID/report UUID and source issue, and limits
contributors to ten reports per day. It checks trusted main code only; issue
content is data. Concurrent pushes reread/retry without repeating provider calls.
A successful deployment closes the issue with commit/workflow links. Failures leave
it open; rerun the workflow after resolving permissions or deployment problems.
For invalid report content, submit a corrected issue instead of rerunning its
captured invalid opened event.

`catalog/verifications.json` is the canonical report store. Catalog generation
updates JavaScript/Python data and the verification hash in the same commit.
The website's `verification.json` feed is built from those records. Registry
packages receive updates on the next release, not immediately after a report.

## Pipeline staging

The repository owner may submit a generated report with `staging: true` through
the same issue workflow. It is explicitly a pipeline fixture, not a real inference.
Only a separate staging receipt is committed under `docs/verification-staging/`
and published in `verification-staging.json`. No model evidence or badge changes.
Never remove the staging flag to present a fixture as a real model call.

## Contributor badges

Your first published successful hosted-model report earns the **Model Verifier**
byokit badge. Contributor cards link your GitHub profile and report evidence, and
provide **Copy badge Markdown** for your GitHub profile README or project. The
publication bot includes your badge and embed snippet in its success comment.
Existing published contributors receive the badge automatically at the next build.

Badges are derived from canonical passed text-generation records, not local calls,
failed calls, pending issues, or staging fixtures. They recognize a contribution
without claiming universal model access. The milestone remains after the report's
90-day freshness expires; deleting invalid evidence removes the derived award.
No extra account permission or credential is needed. The website publishes the
badge registry in `contributors.json` and individual SVGs under `badges/`.

## Filters and batch checks

The verification table includes LIVE and UNCERTAIN offerings by default. **Include outdated models** explicitly
adds retired offerings; unsupported adapters cannot be verified here and it never substitutes a model if an outdated one is rejected.
Use the table-header selectors to filter by provider, origin tags, excluded tag,
supported capability, input modality, weights, context, and input price. Separate
columns show context, input/output price, speed/release, tags, and verification
status. Sort names, price, or known speed in either direction, or show newest
releases. Unknown numeric values remain last. On mobile, the table header becomes
a filter grid and results become labeled cards. Unknown
metadata is shown as unknown; local setup entries keep their own URL/protocol.

Select up to ten hosted models across providers, then click **Verify selected**.
Selections survive filtering and pagination. The sticky selection bar keeps the
selected count and progress visible. Clicking a row or **Verify** opens the same
verification drawer without jumping to the top; on mobile it fills the screen.

The drawer groups selected models by provider and asks for each provider's API key.
Review the shared prompt and output budget, then click **Send N requests**. All
credentials and settings are validated before any call. Calls run sequentially,
without retries, using only the matching provider's key. Authentication, quota,
timeout, and network errors skip the remaining models for that provider while
other providers continue. Cancel stops the entire queue.

Closing the drawer leaves a running verification active; reopen it from the
selection bar to see progress and individual results. Browsing or changing table
filters does not interrupt a run. Already completed successes remain saved. Share
each success separately through its GitHub link; the existing ten-publications-per-day
limit still applies. Keys stay only in page memory and never enter saved records.
Local-server entries support single-model verification only. Single-model checks
retain their baseline call and speed benchmark (up to two requests).

## Keep contributing after a model is verified

Availability verification and speed measurements answer different questions.
A verified model still benefits from another account and another measurement.
Use **Test speed** or **Add your speed result** to open the drawer. The standard
benchmark uses a fixed counting prompt, a 128-token output budget, and two
non-streaming requests: a short baseline followed by generation. It estimates
speed from the token-count and elapsed-time differences. This is an estimate,
not a measurement of streaming time to first token. Browser location, network,
provider load, output length, and model configuration can still affect results;
region is not collected or grouped.

The table shows the median, middle 50% range (from three samples), sample count,
known contributor count, and a 30-day window. Speed sorting uses that same
recent median, with unknown values last. One or two samples are explicitly
provisional. Only published successful results with provider-reported token counts,
positive timing differences, the same offering/protocol, and the same versioned
standard benchmark are combined. Legacy, custom, batch, failed, stale, and
browser-local timings are excluded from this public summary. Historical speed
values remain labeled separately. Counts and medians describe self-reported
observations, not guaranteed performance or independent experiments.

The public report carries the benchmark version without including the prompt,
API key, or generated text. A successful result remains private until you share
it on GitHub. Repeated tests are retained and count toward the contributor's
published-contribution total; the daily publication limit still applies.
