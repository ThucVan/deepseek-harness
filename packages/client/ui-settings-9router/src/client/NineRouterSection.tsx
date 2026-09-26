/** Click-through 9router workspace and Work-brain controls. */
import { useState, type ReactNode } from 'react'
import css from './NineRouterSection.module.css'
import type { BrainRefreshResult } from './brain.ts'
import type { NineRouterKey } from './locales.ts'

/** 9router routing dashboard. */
export const NINE_ROUTER_DASHBOARD_URL = 'http://127.0.0.1:20128/'
/** Codex account importer embedded by this section. */
export const NINE_ROUTER_WORKSPACE_URL = 'http://127.0.0.1:20129/'
export const NINE_ROUTER_MITM_URL = 'http://127.0.0.1:20128/dashboard/mitm'

export interface NineRouterSectionInjected {
  t: (key: NineRouterKey) => string
  refreshBrain: () => Promise<BrainRefreshResult>
}

export type NineRouterSectionProps = Partial<NineRouterSectionInjected>

export function NineRouterSection({ t, refreshBrain }: NineRouterSectionProps): ReactNode {
  const [embedded, setEmbedded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [brainStatus, setBrainStatus] = useState<string | null>(null)
  if (t === undefined || refreshBrain === undefined) return null

  const handleRefreshBrain = async (): Promise<void> => {
    setRefreshing(true)
    setBrainStatus(null)
    try {
      const result = await refreshBrain()
      setBrainStatus(result.ok
        ? t('brainSelected').replace('{model}', result.selection.label)
        : t('brainFailed').replace('{message}', result.message))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setBrainStatus(t('brainFailed').replace('{message}', message))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <section className={css.section}>
      <header className={css.header}>
        <div>
          <h2 className={css.title}>{t('title')}</h2>
          <p className={css.intro}>{t('intro')}</p>
        </div>
        <div className={css.actions}>
          <a className={css.secondaryButton} href={NINE_ROUTER_MITM_URL} target="_blank" rel="noopener noreferrer">{t('openMitm')}</a>
          <a className={css.secondaryButton} href={NINE_ROUTER_DASHBOARD_URL} target="_blank" rel="noopener noreferrer">{t('openRouter')}</a>
          <a className={css.primaryButton} href={NINE_ROUTER_WORKSPACE_URL} target="_blank" rel="noopener noreferrer">{t('openImporter')}</a>
        </div>
      </header>
      <div className={css.brainCard}>
        <div>
          <h3 className={css.brainTitle}>{t('brainTitle')}</h3>
          <p className={css.help}>{t('brainHelp')}</p>
          {brainStatus !== null && <p className={css.brainStatus} role="status">{brainStatus}</p>}
        </div>
        <button className={css.primaryButton} type="button" disabled={refreshing} onClick={() => { void handleRefreshBrain() }}>
          {refreshing ? t('brainRefreshing') : t('brainRefresh')}
        </button>
      </div>
      <p className={css.notice}>{t('localNotice')}</p>
      <button className={css.embedButton} type="button" onClick={() => { setEmbedded(value => !value) }}>
        {embedded ? t('hideHere') : t('showHere')}
      </button>
      {embedded && <iframe className={css.frame} src={NINE_ROUTER_WORKSPACE_URL} title={t('frameTitle')} sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts" />}
      <p className={css.help}>{t('unavailable')}</p>
    </section>
  )
}
