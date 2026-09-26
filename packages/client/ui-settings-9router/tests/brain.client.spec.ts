import { describe, expect, it } from 'vitest'
import { brainScore, discoveredCandidates, selectStrongestBrain } from '../src/client/brain.ts'

describe('Work brain ranking', () => {
  it('selects the strongest route across provider boundaries', () => {
    const candidates = [
      ...discoveredCandidates('nine-router', [{ id: 'ag/gemini-pro-agent' }, { id: 'ag/claude-opus-4-6-thinking' }]),
      ...discoveredCandidates('anthropic-direct', [{ id: 'claude-opus-4-7-thinking' }]),
      { provider: 'openai-codex', model: 'gpt-5.6-sol', label: 'GPT-5.6 SOL' },
      { provider: 'deepseek-official', model: 'deepseek-opus-99-thinking', label: 'DeepSeek should be ignored' },
    ]
    expect(selectStrongestBrain(candidates)).toMatchObject({ provider: 'anthropic-direct', model: 'claude-opus-4-7-thinking' })
  })

  it('returns no route for an empty scan and penalizes weak tiers', () => {
    expect(selectStrongestBrain([])).toBeUndefined()
    expect(selectStrongestBrain([{ provider: 'deepseek-official', model: 'deepseek-chat', label: 'DeepSeek' }])).toBeUndefined()
    expect(brainScore({ provider: 'nine-router', model: 'ag/gemini-pro-agent', label: 'Gemini' }))
      .toBeGreaterThan(brainScore({ provider: 'nine-router', model: 'ag/gemini-3.8-flash-low', label: 'Flash' }))
  })
})
