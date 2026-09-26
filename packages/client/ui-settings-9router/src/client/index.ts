/** Browser registration for the 9router Settings section. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { brainScore, discoveredCandidates, selectStrongestBrain, type BrainCandidate, type BrainRefreshResult } from './brain.ts'
import { NineRouterSection, type NineRouterSectionInjected } from './NineRouterSection.tsx'
import { en, zh, type NineRouterKey } from './locales.ts'

export { brainScore, discoveredCandidates, isBrainEligible, selectStrongestBrain } from './brain.ts'
export type { BrainCandidate, BrainRefreshResult } from './brain.ts'
export { NINE_ROUTER_DASHBOARD_URL, NINE_ROUTER_MITM_URL, NINE_ROUTER_WORKSPACE_URL, NineRouterSection } from './NineRouterSection.tsx'
export type { NineRouterSectionInjected, NineRouterSectionProps } from './NineRouterSection.tsx'
export type { NineRouterKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'settings.9router': NineRouterKey } }

const NS = 'settings.9router'
export const inject = ['slots', 'locale', 'remote', 'remote.llm', 'remote.settings']

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function configuredCandidates(
  provider: string,
  settingsPath: readonly string[],
  namespaceValue: unknown,
): BrainCandidate[] {
  let profile: unknown = namespaceValue
  for (const segment of settingsPath) profile = objectValue(profile)?.[segment]
  const models = objectValue(profile)?.models
  if (!Array.isArray(models)) return []
  return models.flatMap((value): BrainCandidate[] => {
    const model = objectValue(value)
    return typeof model?.id === 'string'
      ? [{ provider, model: model.id, label: typeof model.name === 'string' ? model.name : model.id }]
      : []
  })
}

async function refreshBrainCore(ctx: ClientContext): Promise<BrainRefreshResult> {
  const [providers, directory, described] = await Promise.all([
    ctx.remote.llm.listProviders(),
    ctx.remote.llm.listConfigurableProviders(),
    ctx.remote.settings.describe(),
  ])
  if (!providers.ok) return { ok: false, message: providers.error.message }
  if (!directory.ok) return { ok: false, message: directory.error.message }
  if (!described.ok) return { ok: false, message: described.error.message }
  const defaultModelView = described.value.namespaces.find(view => view.ns === 'agent-default-model')
  if (defaultModelView === undefined) return { ok: false, message: 'Default model settings are unavailable.' }

  const active = new Set(providers.value.map(provider => provider.id))
  const candidates: BrainCandidate[] = []
  for (const entry of directory.value) {
    if (!active.has(entry.provider)) continue
    const namespace = described.value.namespaces.find(view => view.ns === entry.settingsNs)
    if (namespace !== undefined) {
      candidates.push(...configuredCandidates(entry.provider, entry.settingsPath, namespace.value))
    }
  }

  const registeredCatalogs = await Promise.all(providers.value.map(async (provider) => {
    try {
      const result = await ctx.remote.llm.listModels(provider.id)
      return result.ok ? result.value.map(model => ({
        provider: provider.id, model: model.id, label: model.name || model.id,
      })) : []
    } catch {
      return []
    }
  }))
  for (const rows of registeredCatalogs) candidates.push(...rows)

  const scans = await Promise.all(directory.value
    .filter(entry => active.has(entry.provider))
    .map(async (entry) => {
      try {
        const result = await ctx.remote.llm.discoverModels(entry.settingsNs, { provider: entry.provider })
        return result.ok ? discoveredCandidates(entry.provider, result.value) : []
      } catch {
        return []
      }
    }))
  for (const rows of scans) candidates.push(...rows)

  const current = objectValue(defaultModelView.value)
  if (typeof current?.provider === 'string' && typeof current.model === 'string' && active.has(current.provider)) {
    candidates.push({ provider: current.provider, model: current.model, label: current.model })
  }
  const unique = [...new Map(candidates.map(candidate => [candidate.provider + '\0' + candidate.model, candidate])).values()]
  const selection = selectStrongestBrain(unique)
  if (selection === undefined) return { ok: false, message: 'No available model route was discovered from any provider.' }

  const workerView = described.value.namespaces.find(view => view.ns === 'subagent-model-selection')
  if (workerView !== undefined) {
    const workers = [...unique].sort((left, right) => {
      const leftGemini = left.model.toLowerCase().includes('gemini') ? 1 : 0
      const rightGemini = right.model.toLowerCase().includes('gemini') ? 1 : 0
      return rightGemini - leftGemini || brainScore(right) - brainScore(left)
    }).map(candidate => ({ provider: candidate.provider, model: candidate.model }))
    const workersWritten = await ctx.remote.settings.mutate('subagent-model-selection', [
      { op: 'set', path: ['enabled'], value: true },
      { op: 'set', path: ['allowedModels'], value: workers },
    ], workerView.revision)
    if (!workersWritten.ok) return { ok: false, message: workersWritten.error.message }
  }

  const written = await ctx.remote.settings.mutate('agent-default-model', [
    { op: 'set', path: ['provider'], value: selection.provider },
    { op: 'set', path: ['model'], value: selection.model },
    { op: 'unset', path: ['reasoningEffort'] },
  ], defaultModelView.revision)
  return written.ok ? { ok: true, selection } : { ok: false, message: written.error.message }
}

async function refreshBrain(ctx: ClientContext): Promise<BrainRefreshResult> {
  try {
    return await refreshBrainCore(ctx)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-9router: copy dictionaries')
  const t = ctx.locale.bind(NS) as NineRouterSectionInjected['t']
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: '9router', order: 30, label: () => t('nav'), locale: NS,
    inject: (): NineRouterSectionInjected => ({ t, refreshBrain: () => refreshBrain(ctx) }),
  }, NineRouterSection))
}
