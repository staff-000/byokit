# Model call verification

Use [the verification page](https://staff-000.github.io/byokit/verification.html)
to select a model and test a real text-generation call with your own API key.
No byokit login is needed. A small call may consume your provider quota.

## Test and share

1. Select the exact provider/model and review its endpoint and settings.
2. Enter the provider API key and click **Verify model**.
3. After **Call succeeded**, click **Share verification on GitHub**.
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
