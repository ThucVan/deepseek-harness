import { createServer } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import { NineRouterSection, type NineRouterSectionInjected } from '../src/client/NineRouterSection.tsx'
import {
  apply as hostApply,
  checkPortListening,
  resolveNineRouterCommand,
  resolveImporterCommand,
  NINE_ROUTER_HOST,
  NINE_ROUTER_IMPORTER_PORT,
} from '../src/index.ts'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  const mutate = vi.fn(async () => ({ ok: true, value: {} }))
  new TestRemote(ctx, {
    llm: {
      listProviders: vi.fn(async () => ({ ok: true, value: [
        { id: 'openai-codex', name: 'Codex' },
        { id: 'nine-router', name: '9Router' },
        { id: 'anthropic-direct', name: 'Anthropic Direct' },
      ] })),
      listModels: vi.fn(async (provider: string) => ({ ok: true, value: provider === 'openai-codex'
        ? [{ provider, id: 'gpt-5.6-sol', name: 'GPT-5.6 SOL' }]
        : [] })),
      listConfigurableProviders: vi.fn(async () => ({ ok: true, value: [
        { provider: 'nine-router', displayName: '9Router', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'nine-router'] },
        { provider: 'anthropic-direct', displayName: 'Anthropic Direct', settingsNs: 'llm-anthropic', settingsPath: [] },
      ] })),
      discoverModels: vi.fn(async (_ns: string, request: { provider?: string }) => ({ ok: true, value: request.provider === 'anthropic-direct'
        ? [{ id: 'claude-opus-4-7-thinking', name: 'Claude Opus 4.7 Thinking' }]
        : [{ id: 'ag/gemini-pro-agent' }, { id: 'ag/claude-opus-4-6-thinking' }] })),
    },
    settings: {
      describe: vi.fn(async () => ({ ok: true, value: { writable: true, namespaces: [
        { ns: 'agent-default-model', revision: 7, value: { provider: 'openai-codex', model: 'gpt-5.6-sol' } },
        { ns: 'subagent-model-selection', revision: 4, value: { enabled: false, allowedModels: [] } },
        { ns: 'llm-pi-ai', revision: 3, value: { providers: { 'nine-router': { models: [{ id: 'ag/gemini-pro-agent' }] } } } },
        { ns: 'llm-anthropic', revision: 2, value: { models: [{ id: 'claude-opus-4-7-thinking' }] } },
      ] } })),
      mutate,
    },
  })
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } } as never, () => null)
  return { ctx, locale, slots, mutate }
}

describe('ui-settings-9router apply', () => {
  it('registers host auto-start effect without throwing and resolves valid command', async () => {
    const ctx = new Context()
    expect(() => { hostApply(ctx, { autoStartRouter: false, autoStartImporter: false }) }).not.toThrow()
    const spec = resolveNineRouterCommand()
    expect(spec.file).toBeTypeOf('string')
    expect(spec.args).toContain(NINE_ROUTER_HOST)
    expect(spec.args).toContain('--tray')
    const importer = resolveImporterCommand(import.meta.filename)
    expect(importer?.file).toBe(process.execPath)
    expect(importer?.args).toContain(String(NINE_ROUTER_IMPORTER_PORT))
    expect(importer?.args).toContain('--no-browser')
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.llm', 'remote.settings'])
    await ctx.fiber.dispose()
  })

  it('checks port listening with timeout', async () => {
    const server = createServer()
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected a TCP address')
    await expect(checkPortListening('127.0.0.1', address.port, 200)).resolves.toBe(true)
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    await expect(checkPortListening('127.0.0.1', address.port, 200)).resolves.toBe(false)
  })

  it('registers a locale-following Settings section', async () => {
    const { ctx, locale, slots, mutate } = await bench()
    const plugin = ctx.plugin({ inject: [...inject], apply })
    await plugin.await()
    const entry = slots.entries('settings.section')[0]!
    expect(entry.component).toBe(NineRouterSection)
    expect(entry.options).toMatchObject({ id: '9router', order: 30 })
    expect(resolveSlotLabel(entry.options.label)).toBe('9router')
    const injected = (entry.inject as unknown as () => NineRouterSectionInjected)()
    expect(injected.t('title')).toBe('9router 工作区')
    locale.setLocale('en')
    expect(injected.t('title')).toBe('9router workspace')
    await expect(injected.refreshBrain()).resolves.toMatchObject({
      ok: true, selection: { provider: 'anthropic-direct', model: 'claude-opus-4-7-thinking' },
    })
    expect(mutate).toHaveBeenCalledWith('subagent-model-selection', [
      { op: 'set', path: ['enabled'], value: true },
      { op: 'set', path: ['allowedModels'], value: expect.arrayContaining([
        { provider: 'nine-router', model: 'ag/gemini-pro-agent' },
        { provider: 'openai-codex', model: 'gpt-5.6-sol' },
      ]) },
    ], 4)
    expect(mutate).toHaveBeenCalledWith('agent-default-model', expect.arrayContaining([
      { op: 'set', path: ['provider'], value: 'anthropic-direct' },
      { op: 'set', path: ['model'], value: 'claude-opus-4-7-thinking' },
    ]), 7)
    await plugin.dispose()
    expect(slots.entries('settings.section')).toHaveLength(0)
  })
})
