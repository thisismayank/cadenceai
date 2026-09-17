import type { Finding } from "./artifact";
import type { TestReport } from "./artifact";

const HIGH_PENALTY = -40;
const MEDIUM_PENALTY = -15;
const LOW_PENALTY = -5;
const FAILED_TEST_PENALTY = -30;
const UNVERIFIED_CRITERION_PENALTY = -15;

export type ConfidenceBreakdownEntry = {
  label: string;
  points: number;
  outOf: number;
  linkTo?: string;
};

export type ConfidenceReport = {
  score: number;
  blocked: boolean;
  breakdown: ConfidenceBreakdownEntry[];
  penalties: { reason: string; points: number }[];
};

export function computeConfidence(input: {
  testReport?: TestReport;
  findings?: Finding[];
}): ConfidenceReport {
  const breakdown: ConfidenceBreakdownEntry[] = [];
  const penalties: { reason: string; points: number }[] = [];
  let score = 0;
  let blocked = false;

  const tests = input.testReport;
  const findings = input.findings ?? [];

  const testsAllPassed =
    tests !== undefined && tests.status === "pass" && tests.testsFailed === 0;
  breakdown.push({
    label: "All tests passed",
    points: testsAllPassed ? 35 : 0,
    outOf: 35,
  });
  if (testsAllPassed) score += 35;

  if (tests) {
    for (const failure of tests.failures) {
      penalties.push({ reason: `Failed test: ${failure}`, points: FAILED_TEST_PENALTY });
      score += FAILED_TEST_PENALTY;
    }
  }

  const criteria = tests?.acceptanceCriteria ?? [];
  const verifiedCount = criteria.filter((c) => c.status === "verified" && c.evidence.trim().length > 0).length;
  const criteriaScore = criteria.length === 0
    ? 0
    : Math.round((verifiedCount / criteria.length) * 30);
  breakdown.push({
    label: `Acceptance criteria verified (${verifiedCount}/${criteria.length})`,
    points: criteriaScore,
    outOf: 30,
  });
  score += criteriaScore;

  for (const c of criteria) {
    if (c.status !== "verified" || c.evidence.trim().length === 0) {
      penalties.push({
        reason: `Unverified criterion: ${c.criterion}`,
        points: UNVERIFIED_CRITERION_PENALTY,
      });
      score += UNVERIFIED_CRITERION_PENALTY;
    }
  }

  const noCriticalOrHigh = !findings.some(
    (f) => f.severity === "critical" || f.severity === "high",
  );
  breakdown.push({
    label: "Zero critical/high adversarial findings",
    points: noCriticalOrHigh ? 25 : 0,
    outOf: 25,
  });
  if (noCriticalOrHigh) score += 25;

  for (const f of findings) {
    if (f.severity === "critical") {
      blocked = true;
      penalties.push({ reason: `Critical: ${f.description}`, points: 0 });
    } else if (f.severity === "high") {
      penalties.push({ reason: `High: ${f.description}`, points: HIGH_PENALTY });
      score += HIGH_PENALTY;
    } else if (f.severity === "medium") {
      penalties.push({ reason: `Medium: ${f.description}`, points: MEDIUM_PENALTY });
      score += MEDIUM_PENALTY;
    } else if (f.severity === "low") {
      penalties.push({ reason: `Low: ${f.description}`, points: LOW_PENALTY });
      score += LOW_PENALTY;
    }
  }

  const staticChecksPass =
    tests !== undefined && tests.lintPassed && tests.typecheckPassed;
  breakdown.push({
    label: "Lint + typecheck pass",
    points: staticChecksPass ? 10 : 0,
    outOf: 10,
  });
  if (staticChecksPass) score += 10;

  if (blocked) score = 0;
  score = Math.max(0, Math.min(100, score));

  return { score, blocked, breakdown, penalties };
}
