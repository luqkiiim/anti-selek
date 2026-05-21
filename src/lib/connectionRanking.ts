export const PREFERRED_CONNECTION_MIN_MATCHES = 2;

export function getWeightedRecordScore(successes: number, failures: number) {
  const totalMatches = successes + failures;
  const bayesianRate = (successes + 1) / (totalMatches + 2);
  const sampleWeight = Math.log(totalMatches + 1);

  return bayesianRate * sampleWeight;
}
