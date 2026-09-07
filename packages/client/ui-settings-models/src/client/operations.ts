/**
 * The Host reads and writes the Models cards perform, as callbacks built in the
 * plugin body. Cards receive these instead of a context: the outcomes name what
 * a card renders — a stored view, a stale revision, a refusal message — so the
 * failure codes and Remote namespaces stay in the apply world.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {
  AuthorizationEntry, AuthorizationNotice, AuthorizationPrompt,
  CredentialInfo, LlmDiscoveredModel, LlmModelDiscoveryRequest,
  SettingsNamespaceView, SettingsPathOpView,
} from '@deepseek-ai/dsh-api-remotes/client'

/** What one namespace write answered. */
export type SettingsWriteOutcome =
  /** Committed; the view carries the stored user subtree and the new revision. */
  | { readonly kind: 'written'; readonly view: SettingsNamespaceView }
  /**
   * The stored revision moved after the card read it, so the draft is stale.
   * The message stays for callers that report the Host diagnostic as it is.
   */
  | { readonly kind: 'conflict'; readonly message: string }
  /** Any other refusal, with the Host's own diagnostic. */
  | { readonly kind: 'refused'; readonly message: string }

/** What one endpoint interrogation answered. */
export type ModelDiscoveryOutcome =
  /** The candidates the provider disclosed, in its own order. */
  | { readonly kind: 'found'; readonly models: readonly LlmDiscoveredModel[] }
  /** The interrogation was refused, with the Host's own diagnostic. */
  | { readonly kind: 'refused'; readonly message: string }

/** What one authorization attempt answered. */
export type AuthorizationBeginOutcome =
  /** The credential record was committed. */
  | { readonly kind: 'authorized' }
  /** The human declined, or the caller withdrew. */
  | { readonly kind: 'cancelled' }
  /** The attempt failed, with the Host's own diagnostic. */
  | { readonly kind: 'refused'; readonly message: string }

/** A notice from a running authorization attempt, addressed to its key. */
export interface AuthorizationNoticeEvent {
  readonly key: string
  readonly notice: AuthorizationNotice
}

/** A prompt from a running authorization attempt, addressed to its key. */
export interface AuthorizationPromptEvent {
  readonly key: string
  readonly prompt: AuthorizationPrompt
}

/** The Host operations the Models page and its cards invoke. */
export interface ModelsOperations {
  /**
   * Read one credential reference's state.
   * @param ref - credential reference name.
   * @returns the state, or undefined when the reference is unknown or the read was refused.
   */
  describeCredential(ref: string): Promise<CredentialInfo | undefined>
  /**
   * Store one credential literal under its reference.
   * @param ref - credential reference name.
   * @param value - the literal to store.
   * @returns the refusal message, or undefined once stored.
   */
  storeCredential(ref: string, value: string): Promise<string | undefined>
  /**
   * Remove one credential reference (idempotent).
   * @param ref - credential reference name.
   * @returns the refusal message, or undefined once removed.
   */
  removeCredential(ref: string): Promise<string | undefined>
  /**
   * Apply path operations to one settings namespace.
   * @param ns - settings namespace identity.
   * @param ops - ordered path operations against the stored section, as the
   * wire takes them (the Remote signature owns the array).
   * @param expectedRevision - revision the draft was opened at, or undefined to write unfenced.
   * @returns the write outcome the card renders from.
   */
  writeSettings(
    ns: string,
    ops: SettingsPathOpView[],
    expectedRevision: number | undefined,
  ): Promise<SettingsWriteOutcome>
  /**
   * Ask a provider endpoint what models it serves.
   * @param settingsNs - namespace whose adapter family answers.
   * @param request - endpoint facts as the form currently shows them.
   * @returns the candidates, or the refusal.
   */
  discoverModels(settingsNs: string, request: LlmModelDiscoveryRequest): Promise<ModelDiscoveryOutcome>
  /**
   * Every registered authorization flow, for matching against a provider row's
   * credential key.
   * @returns one entry per flow the Host has registered.
   */
  listAuthorizations(): Promise<readonly AuthorizationEntry[]>
  /**
   * Run one attempt to authorize a credential key.
   * @param key - the credential record to authorize, as `<scope>/<id>`.
   * @param method - which of the flow's methods to run.
   * @param signal - caller lifetime; abort withdraws the attempt.
   * @returns how the attempt ended.
   */
  beginAuthorization(key: string, method: string, signal: AbortSignal): Promise<AuthorizationBeginOutcome>
  /**
   * Withdraw the attempt running for a key, if any (best-effort).
   * @param key - the credential record whose attempt should stop.
   */
  cancelAuthorization(key: string): Promise<void>
  /**
   * Listen for every running attempt's notices; a card filters by its own key.
   * @param handler - called with each forwarded notice.
   * @returns disposer that stops listening.
   */
  onAuthorizationNotice(handler: (payload: AuthorizationNoticeEvent) => void): () => void
  /**
   * Listen for every running attempt's prompts; a card filters by its own key.
   * @param handler - called with each forwarded prompt.
   * @returns disposer that stops listening.
   */
  onAuthorizationPrompt(handler: (payload: AuthorizationPromptEvent) => void): () => void
  /**
   * Answer the prompt currently pending for a key.
   * @param key - the credential record whose prompt to answer.
   * @param value - the typed text, or the chosen option's id.
   * @returns the refusal message, or undefined once answered.
   */
  answerAuthorizationPrompt(key: string, value: string): Promise<string | undefined>
  /**
   * Decline the prompt currently pending for a key.
   * @param key - the credential record whose prompt to decline.
   */
  declineAuthorizationPrompt(key: string): Promise<void>
}

/**
 * Bind the page's Host operations to the plugin's own Remote namespaces.
 * @param ctx - the page plugin's context, which declares `remote.credentials`,
 * `remote.llm`, and `remote.settings` in its own `inject`.
 * @returns the callbacks the section and its cards are injected with.
 */
export function createModelsOperations(ctx: ClientContext): ModelsOperations {
  return {
    describeCredential: async (ref) => {
      const response = await ctx.remote.credentials.describe([ref])
      return response.ok ? response.value[ref] : undefined
    },
    storeCredential: async (ref, value) => {
      const response = await ctx.remote.credentials.set(ref, value)
      return response.ok ? undefined : response.error.message
    },
    removeCredential: async (ref) => {
      const response = await ctx.remote.credentials.unset(ref)
      return response.ok ? undefined : response.error.message
    },
    writeSettings: async (ns, ops, expectedRevision) => {
      const response = await ctx.remote.settings.mutate(ns, ops, expectedRevision)
      if (response.ok) return { kind: 'written', view: response.value }
      const { code, message } = response.error
      return code === 'settings/conflict' ? { kind: 'conflict', message } : { kind: 'refused', message }
    },
    discoverModels: async (settingsNs, request) => {
      const response = await ctx.remote.llm.discoverModels(settingsNs, request)
      return response.ok
        ? { kind: 'found', models: response.value }
        : { kind: 'refused', message: response.error.message }
    },
    listAuthorizations: async () => {
      const response = await ctx.remote.authorization.list()
      return response.ok ? response.value : []
    },
    beginAuthorization: async (key, method, signal) => {
      const response = await ctx.remote.authorization.begin(key, method, signal)
      if (!response.ok) return { kind: 'refused', message: response.error.message }
      return { kind: response.value.status }
    },
    cancelAuthorization: async (key) => {
      await ctx.remote.authorization.cancel(key)
    },
    onAuthorizationNotice: handler => ctx.remote.$on('authorization/notice', handler),
    onAuthorizationPrompt: handler => ctx.remote.$on('authorization/prompt', handler),
    answerAuthorizationPrompt: async (key, value) => {
      const response = await ctx.remote.authorization.answerPrompt(key, value)
      return response.ok ? undefined : response.error.message
    },
    declineAuthorizationPrompt: async (key) => {
      await ctx.remote.authorization.declinePrompt(key)
    },
  }
}
