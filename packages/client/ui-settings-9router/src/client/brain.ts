/** Work-brain candidate ranking shared by the Settings operation and tests. */
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-api-remotes/client'

/** A provider/model route considered for the Work orchestration brain. */
export interface BrainCandidate {
  provider: string
  model: string
  label: string
}

/** Result shown after a brain refresh attempt. */
export type BrainRefreshResult =
  | { ok: true; selection: BrainCandidate }
  | { ok: false; message: string }

function versionScore(value: string): number {
  const match = value.match(/([0-9]+)(?:[.-]([0-9]+))?/u)
  if (!match) return 0
  return Number(match[1] ?? 0) * 10 + Number(match[2] ?? 0)
}

/**
 * Rank a route by model family and capability signals in its id.
 * @param candidate - route to score.
 * @returns larger values for stronger planning/reasoning candidates.
 */
export function brainScore(candidate: BrainCandidate): number {
  const id = candidate.model.toLowerCase()
  let score = versionScore(id)
  if (id.includes('claude') && id.includes('opus')) score += 1_300
  else if (id.includes('codex') || candidate.provider === 'openai-codex') score += 1_250
  else if (id.includes('claude') && id.includes('sonnet')) score += 1_150
  else if (id.includes('gpt')) score += 1_100
  else if (id.includes('gemini') && id.includes('pro')) score += 1_000
  else if (id.includes('gemini')) score += 850
  else score += 500
  if (id.includes('thinking') || id.includes('reasoning')) score += 80
  if (id.includes('high')) score += 25
  if (id.includes('medium')) score -= 25
  if (id.includes('low')) score -= 100
  if (id.includes('flash')) score -= 120
  return score
}

/**
 * Convert one provider's discovered models into ranked candidates.
 * @param provider - active provider route id.
 * @param discovered - models returned by that provider's discovery handler.
 * @returns normalized routes ready for global ranking.
 */
export function discoveredCandidates(
  provider: string,
  discovered: readonly LlmDiscoveredModel[],
): BrainCandidate[] {
  return discovered.map(model => ({
    provider,
    model: model.id,
    label: model.name?.trim() || model.id,
  }))
}

/**
 * Decide whether a route may act as the Work orchestration brain.
 * @param candidate - provider/model route to inspect.
 * @returns false for every DeepSeek provider or DeepSeek model alias.
 */
export function isBrainEligible(candidate: BrainCandidate): boolean {
  const route = candidate.provider.toLowerCase() + '/' + candidate.model.toLowerCase()
  return !route.includes('deepseek')
}

/**
 * Select the strongest eligible Work brain across every active provider.
 * DeepSeek routes remain usable elsewhere but are deliberately excluded here.
 * @param candidates - configured and live-discovered routes from all providers.
 * @returns the highest-ranked eligible route, or undefined when none is available.
 */
export function selectStrongestBrain(candidates: readonly BrainCandidate[]): BrainCandidate | undefined {
  return candidates.filter(isBrainEligible).sort((left, right) => brainScore(right) - brainScore(left))[0]
}
