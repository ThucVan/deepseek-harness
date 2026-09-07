/**
 * The OAuth (or other flow-driven) sign-in dialog for one provider row. Opens
 * one `authorization.begin()` attempt, renders every notice and prompt the
 * running flow sends addressed to this row's credential key, and answers or
 * declines a prompt through `answerAuthorizationPrompt`/`declineAuthorizationPrompt`
 * — plain calls the Host resolves against the pending prompt it is holding for
 * that key, not a round trip riding the notice/prompt events themselves.
 * Closing (Escape, mask click, or Cancel) withdraws the whole attempt through
 * its own signal; the flow itself decides whether that reads as `cancelled`
 * or leaves a record half-committed.
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthorizationNotice, AuthorizationPrompt } from '@deepseek-ai/dsh-api-remotes/client'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelsOperations } from './operations.ts'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'

/** Props of {@link AuthorizationDialog}. */
export interface AuthorizationDialogProps {
  /** Whether this attempt's dialog is showing. */
  open: boolean
  /** The credential record being authorized, as `<scope>/<id>`. */
  credentialKey: string
  /** Which of the flow's methods to run. */
  method: string
  /** User-facing name of the method, used as the dialog title. */
  methodLabel: string
  /** The Host operations this dialog begins, watches, and answers through. */
  operations: ModelsOperations
  /** Section copy. */
  t: (key: keyof typeof en) => string
  /** Closed; `authorized` reports whether the credential was committed. */
  onClose: (authorized: boolean) => void
}

/** Render the input a prompt's `kind` calls for. */
function PromptInput({
  prompt, disabled, onAnswer, t,
}: {
  prompt: AuthorizationPrompt
  disabled: boolean
  onAnswer: (value: string) => void
  t: (key: keyof typeof en) => string
}): ReactNode {
  const [value, setValue] = useState('')
  if (prompt.kind === 'select') {
    return (
      <div className={styles['field']}>
        <span className={styles['fieldLabel']}>{prompt.message}</span>
        {prompt.options.map(option => (
          <button
            key={option.id}
            type="button"
            className={styles['linkButton']}
            disabled={disabled}
            onClick={() => { onAnswer(option.id) }}
          >
            {option.label}
          </button>
        ))}
      </div>
    )
  }
  return (
    <div className={styles['field']}>
      <span className={styles['fieldLabel']}>{prompt.message}</span>
      <input
        className={styles['input']}
        type={prompt.kind === 'secret' ? 'password' : 'text'}
        autoComplete="off"
        value={value}
        placeholder={prompt.placeholder}
        aria-label={prompt.message}
        disabled={disabled}
        autoFocus
        onChange={(event) => { setValue(event.target.value) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && value.length > 0) onAnswer(value)
        }}
      />
      <Button variant="outline" disabled={disabled || value.length === 0} onClick={() => { onAnswer(value) }}>
        {t('authContinue')}
      </Button>
    </div>
  )
}

/**
 * Render one authorization attempt's dialog.
 * @param props - the attempt's key, method, wire face, and copy.
 * @returns the dialog; renders nothing while `open` is false.
 */
export function AuthorizationDialog(props: AuthorizationDialogProps): ReactNode {
  const {
    open, credentialKey, method, methodLabel, operations, t, onClose,
  } = props
  const [notices, setNotices] = useState<readonly AuthorizationNotice[]>([])
  const [prompt, setPrompt] = useState<AuthorizationPrompt | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const controllerRef = useRef<AbortController | undefined>(undefined)
  // A parent re-render recreates its inline `onClose`/`operations` props on
  // every pass; reading them through a ref keeps the attempt-owning effect
  // below keyed on the attempt's own identity (open, key, method) instead of
  // restarting `begin()` — and hitting `ALREADY_IN_FLIGHT` — on a render the
  // dialog had nothing to do with.
  const latest = useRef({ operations, onClose })
  latest.current = { operations, onClose }

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    controllerRef.current = controller
    setNotices([])
    setPrompt(undefined)
    setFailure(undefined)
    const disposeNotice = latest.current.operations.onAuthorizationNotice((event) => {
      if (event.key !== credentialKey) return
      setNotices(current => [...current, event.notice])
    })
    const disposePrompt = latest.current.operations.onAuthorizationPrompt((event) => {
      if (event.key !== credentialKey) return
      setPrompt(event.prompt)
    })
    latest.current.operations.beginAuthorization(credentialKey, method, controller.signal).then((outcome) => {
      if (controller.signal.aborted) return
      if (outcome.kind === 'refused') { setFailure(outcome.message); return }
      latest.current.onClose(outcome.kind === 'authorized')
    }, (error: unknown) => {
      if (controller.signal.aborted) return
      setFailure(error instanceof Error ? error.message : String(error))
    })
    return () => {
      disposeNotice()
      disposePrompt()
      controller.abort()
      controllerRef.current = undefined
    }
  }, [open, credentialKey, method])

  const answer = async (value: string): Promise<void> => {
    setBusy(true)
    try {
      const refused = await operations.answerAuthorizationPrompt(credentialKey, value)
      if (refused !== undefined) { setFailure(refused); return }
      setPrompt(undefined)
    } finally {
      setBusy(false)
    }
  }

  const cancel = (): void => {
    if (prompt !== undefined) void operations.declineAuthorizationPrompt(credentialKey)
    controllerRef.current?.abort()
    onClose(false)
  }

  return (
    <Modal
      open={open}
      onClose={cancel}
      title={methodLabel}
      closeLabel={t('close')}
      footer={<Button variant="outline" onClick={cancel}>{t('cancel')}</Button>}
    >
      {notices.map((notice, index) => (
        <p key={index} className={styles['field']}>
          {notice.message}
          {notice.url === undefined
            ? null
            : <> <a href={notice.url} target="_blank" rel="noreferrer">{notice.url}</a></>}
          {notice.code === undefined ? null : <> <strong>{notice.code}</strong></>}
        </p>
      ))}
      {prompt === undefined
        ? null
        : <PromptInput prompt={prompt} disabled={busy} onAnswer={(value) => { void answer(value) }} t={t} />}
      {failure === undefined ? null : <p className={styles['error']}>{failure}</p>}
    </Modal>
  )
}
