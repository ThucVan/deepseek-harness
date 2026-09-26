// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NineRouterSection, NINE_ROUTER_DASHBOARD_URL, NINE_ROUTER_MITM_URL, NINE_ROUTER_WORKSPACE_URL } from '../src/client/NineRouterSection.tsx'
import { en, type NineRouterKey } from '../src/client/locales.ts'

const t = (key: NineRouterKey): string => en[key]

afterEach(cleanup)

describe('NineRouterSection', () => {
  it('refreshes the brain and lazy-mounts the workspace', async () => {
    const refreshBrain = vi.fn(async () => ({ ok: true as const, selection: { provider: 'nine-router', model: 'ag/claude-opus-4-6-thinking', label: 'Claude Opus 4.6 Thinking' } }))
    render(<NineRouterSection t={t} refreshBrain={refreshBrain} />)
    const importer = screen.getByRole('link', { name: en.openImporter })
    expect(importer.getAttribute('href')).toBe(NINE_ROUTER_WORKSPACE_URL)
    expect(importer.getAttribute('target')).toBe('_blank')
    expect(importer.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByRole('link', { name: en.openRouter }).getAttribute('href')).toBe(NINE_ROUTER_DASHBOARD_URL)
    expect(screen.getByRole('link', { name: en.openMitm }).getAttribute('href')).toBe(NINE_ROUTER_MITM_URL)

    fireEvent.click(screen.getByRole('button', { name: en.brainRefresh }))
    await waitFor(() => { expect(refreshBrain).toHaveBeenCalledOnce() })
    expect(screen.getByRole('status').textContent).toContain('Claude Opus 4.6 Thinking')

    expect(screen.queryByTitle(en.frameTitle)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.showHere }))
    expect(screen.getByTitle(en.frameTitle).getAttribute('src')).toBe(NINE_ROUTER_WORKSPACE_URL)
    fireEvent.click(screen.getByRole('button', { name: en.hideHere }))
    expect(screen.queryByTitle(en.frameTitle)).toBeNull()
  })

  it('reports a rejected refresh and re-enables the button', async () => {
    const refreshBrain = vi.fn(async () => { throw new Error('transport unavailable') })
    render(<NineRouterSection t={t} refreshBrain={refreshBrain} />)
    const button = screen.getByRole('button', { name: en.brainRefresh })
    fireEvent.click(button)
    await waitFor(() => { expect(screen.getByRole('status').textContent).toContain('transport unavailable') })
    expect((button as HTMLButtonElement).disabled).toBe(false)
  })
})
