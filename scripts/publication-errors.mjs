// Only fixed, reviewed messages cross the Actions output/comment boundary.
// Never publish exception messages, issue content, git stderr, or provider errors.
const notices = {
  report_format:
    'The report format is invalid or unsupported. Generate a new sanitized report with the current website and submit a corrected issue. Rerunning the captured opened event will not apply edits to this issue.',
  report_identity: 'GitHub issue author or issue identity could not be validated.',
  report_freshness:
    'The observation must be checked within 24 hours before issue creation (with at most one minute of clock skew). Make and share a fresh observation; rerunning this issue cannot change its submission time.',
  catalog_mismatch:
    'The model ID, offering ID, or protocol does not match a supported hosted catalog entry. Check the current catalog and submit a corrected report.',
  staging_forbidden: 'Pipeline staging reports are restricted to the repository owner.',
  report_conflict:
    'This issue or report ID already identifies different observations. Submit a new report with its own report IDs.',
  catalog_validation:
    'The resulting catalog failed validation. A maintainer must resolve the catalog or report validation problem before rerunning this workflow.',
  repository_operation:
    'A repository operation failed. A maintainer should check branch rules, Actions write permissions, and repository access, then rerun this workflow.',
  concurrent_update:
    'The report could not be pushed after concurrent-update retries. Rerun this workflow; provider calls will not be repeated.',
  unknown:
    'An unexpected publication error occurred. A maintainer should inspect the workflow and repository configuration before rerunning it.',
};
export class PublicationError extends Error {
  constructor(code) {
    super(notices[code] || notices.unknown);
    this.code = Object.hasOwn(notices, code) ? code : 'unknown';
  }
}
export function publicationFailureCode(error) {
  return error instanceof PublicationError && Object.hasOwn(notices, error.code)
    ? error.code
    : 'unknown';
}
export function publicationFailureNotice(code) {
  return `The verification report could not be published. ${Object.hasOwn(notices, code) ? notices[code] : notices.unknown}\n\nThis is a report-publication problem, not a failed provider call. No provider call is repeated by this workflow.`;
}
