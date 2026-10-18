import { textWasVerified } from '../packages/byokit/verification.js';
// Badges are derived from published catalog evidence; browser-local tests cannot award one.
const site = 'https://staff-000.github.io/byokit/';
export function contributorBadges(reports) {
  const groups = new Map();
  for (const report of reports) {
    const login = report.contributor?.match(/^github:([-a-z0-9]{1,39})$/i)?.[1];
    if (
      report.staging ||
      report.scope === 'this-browser' ||
      !login ||
      !textWasVerified(report) ||
      !report.checks?.includes('textGeneration') ||
      !Number.isFinite(Date.parse(report.checkedAt))
    )
      continue;
    const githubId = report.id?.match(/^website:([1-9]\d*):/)?.[1],
      identity = githubId ? `github-${githubId}` : login.toLowerCase();
    if (!groups.has(identity))
      groups.set(identity, { identity, login, githubId, records: new Map() });
    const group = groups.get(identity);
    group.records.set(report.id, report);
  }
  return [...groups.values()]
    .map((group) => {
      const records = [...group.records.values()].sort(
          (a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt),
        ),
        latest = [...records]
          .sort((a, b) => {
            const submitted = (r) =>
              Date.parse(r.notes?.match(/submitted ([^;]+);/)?.[1] || r.checkedAt);
            return submitted(a) - submitted(b);
          })
          .at(-1),
        login = latest.contributor.slice(7),
        path = `badges/${group.identity}.svg`;
      return {
        id: 'model-verifier',
        name: 'Model Verifier',
        identity: group.identity,
        login,
        profileUrl: `https://github.com/${login}`,
        firstVerifiedAt: records[0].checkedAt,
        latestVerifiedAt: records.at(-1).checkedAt,
        verifiedModels: new Set(records.map((r) => r.offeringId)).size,
        verificationCount: records.length,
        evidence: latest.evidence,
        badgePath: path,
        badgeUrl: site + path,
        recognitionUrl: site + `verification.html#contributor-${group.identity}`,
      };
    })
    .sort((a, b) => a.login.toLowerCase().localeCompare(b.login.toLowerCase()));
}
export function badgeMarkdown(badge) {
  return `[![byokit Model Verifier — @${badge.login}](${badge.badgeUrl})](${badge.recognitionUrl})`;
}
export function contributorBadgeSvg(badge) {
  if (!/^[-a-z0-9]{1,39}$/i.test(badge.login)) throw new Error('Invalid badge contributor.');
  const width = 112 + Math.max(170, badge.login.length * 7 + 26);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="48" viewBox="0 0 ${width} 48" role="img" aria-label="byokit Model Verifier: @${badge.login}"><title>byokit Model Verifier — @${badge.login}</title><desc>Earned by publishing a community-reported successful model call. This recognizes a contribution, not universal model access.</desc><rect width="${width}" height="48" rx="8" fill="#eef0ff"/><path d="M8 0h104v48H8a8 8 0 0 1-8-8V8a8 8 0 0 1 8-8" fill="#191d35"/><text x="17" y="29" fill="#fff" font-family="system-ui,sans-serif" font-size="19" font-weight="700">byokit</text><circle cx="92" cy="24" r="8" fill="#c2ed78"/><path d="m88 24 3 3 5-6" fill="none" stroke="#191d35" stroke-width="2"/><text x="125" y="20" fill="#4547c5" font-family="system-ui,sans-serif" font-size="13" font-weight="700">Model Verifier</text><text x="125" y="36" fill="#646a7d" font-family="system-ui,sans-serif" font-size="11">@${badge.login}</text></svg>
`;
}
