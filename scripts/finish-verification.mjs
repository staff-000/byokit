import { readFile } from 'node:fs/promises';
import { contributorBadges, badgeMarkdown } from '../website/contributor-badges.js';
import { REPORT_MARKER, parseIssueReport } from '../website/verification-report.js';
const repository = 'staff-000/byokit',
  site = 'https://staff-000.github.io/byokit/';
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')),
  issue = event.issue;
if (
  event.repository?.full_name !== repository ||
  !Number.isSafeInteger(issue?.number) ||
  !issue.body?.includes(REPORT_MARKER)
)
  process.exit(0);
const run = `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
async function api(path, method, body) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/issues/${issue.number}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw new Error('GitHub issue status update failed.');
}
let expectedReports = [];
try {
  const payload = parseIssueReport(issue.body);
  expectedReports = payload.reports || [payload];
} catch {
  /* Invalid reports use the existing failure notice. */
}
let published = false,
  earnedBadge = null;
if (process.env.RECORD_RESULT === 'success') {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const staging = process.env.STAGING === 'true',
        response = await fetch(
          site +
            (staging ? 'verification-staging.json' : 'verification.json') +
            `?run=${process.env.GITHUB_RUN_ID}&attempt=${attempt}`,
          { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) },
        );
      if (response.ok) {
        const feed = await response.json();
        published = staging
          ? feed.receipts?.some(
              (r) => r.operationId === process.env.OPERATION_ID && r.issue === issue.html_url,
            )
          : expectedReports.length > 0 &&
            expectedReports.every((report) =>
              feed.reports?.some(
                (r) =>
                  r.id === `website:${issue.user.id}:${report.operationId}` &&
                  r.offeringId === report.offeringId,
              ),
            );
        if (published) {
          if (
            !staging &&
            expectedReports.some(
              (r) => !r.assessment || r.assessment.checks.textGeneration === 'passed',
            )
          )
            earnedBadge = contributorBadges(feed.reports).find(
              (b) => b.login.toLowerCase() === issue.user.login.toLowerCase(),
            );
          break;
        }
      }
    } catch {}
    if (attempt < 19) await new Promise((r) => setTimeout(r, 15000));
  }
}
const commit = process.env.RECORD_REF
  ? `[Commit](https://github.com/${repository}/commit/${process.env.RECORD_REF}) · `
  : '';
const body = published
  ? `${process.env.STAGING === 'true' ? 'Staging pipeline passed. The receipt is published separately; no model verification was added.' : 'Community verification published on the website.'}\n\n${commit}[Website](${site}verification.html) · [Workflow/deployment](${run})`
  : process.env.RECORD_RESULT === 'success'
    ? `The report is committed, but public website publication has not been confirmed. Leave this issue open and rerun the workflow after resolving deployment.\n\n${commit}[Workflow/deployment](${run})`
    : `The verification report could not be published. Check the exact catalog model/protocol, report format, 24-hour submission window, daily limit, and repository permissions. Rerun this workflow after resolving the problem; this never repeats the provider call.\n\n[Workflow](${run})`;
const recognition = earnedBadge
  ? `\n\n**Model Verifier badge earned!** Thank you, @${earnedBadge.login}.\n\n[![Your byokit Model Verifier badge](${earnedBadge.badgeUrl})](${earnedBadge.recognitionUrl})\n\nAdd it to your GitHub profile README:\n\n\`\`\`markdown\n${badgeMarkdown(earnedBadge)}\n\`\`\``
  : '';
await api('/comments', 'POST', { body: body + recognition });
if (published) await api('', 'PATCH', { state: 'closed', state_reason: 'completed' });
