/**
 * Host owner of the `authorization` Remote namespace: the wire contract that
 * carries `ctx.authorization`'s notices and prompts to the browser, and lets a
 * configuration surface list, start, answer, and cancel a login.
 *
 * @module @deepseek-ai/dsh-api-settings-controller/src/authorization.ts
 */

import { Context } from '@deepseek-ai/cordis'
import type {
  AuthorizationEntry, AuthorizationInteraction, AuthorizationNotice, AuthorizationOutcome, AuthorizationPrompt,
  AuthorizationService,
} from '@deepseek-ai/dsh-authorization'
import { AuthorizationDeclinedError, AuthorizationError } from '@deepseek-ai/dsh-authorization'
import { parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials/types'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'

function isParsableCredentialKey(value: string): boolean {
  try {
    parseCredentialKey(value)
    return true
  } catch {
    return false
  }
}

const credentialKeySchema = z.string().refine(isParsableCredentialKey, 'must be "<scope>/<id>"')
const beginRequestSchema = z.object({ key: credentialKeySchema, method: z.string().min(1).optional() })
const keyRequestSchema = z.object({ key: credentialKeySchema })
const answerRequestSchema = z.object({ key: credentialKeySchema, value: z.string() })

/** Parse the domain constraints that are more specific than generated TypeScript codecs. */
function parseRequest<T>(method: string, schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new RemoteError('gateway/bad-request', `invalid payload for ${method}`, { issues: parsed.error.issues })
  }
  return parsed.data
}

/** One prompt a running flow is waiting on, answered or declined over a separate call. */
interface PendingPrompt {
  readonly resolve: (value: string) => void
  readonly reject: (error: Error) => void
}

/**
 * Drop a prompt's own `signal`: this attempt's withdrawal already reaches the
 * browser as the whole dialog closing, and an `AbortSignal` is not lossless
 * JSON data, so forwarding it as-is would refuse the whole notification.
 */
function wireSafePrompt(prompt: AuthorizationPrompt): AuthorizationPrompt {
  const { signal: _signal, ...rest } = prompt
  return rest
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `authorization` Remote namespace. */
    authorizationController: AuthorizationController
  }
}

/**
 * Host service backing the generated `ctx.remote.authorization` namespace.
 *
 * A `begin()` call's notices and prompts both ride fire-and-forget events —
 * `authorization/notice` and `authorization/prompt` — because the Remote Event
 * carrier can only route a request/response waterfall to a live agent, and an
 * authorization attempt has none. A prompt's answer instead travels back over
 * `answerPrompt`/`declinePrompt`, plain calls this controller resolves against
 * the pending prompt it is holding for that key: two one-way trips instead of
 * one round trip, which needs no connection identity at all.
 */
export class AuthorizationController extends TypertRemoteService {
  private readonly pending = new Map<CredentialKey, PendingPrompt>()

  /** @param ctx - Host context where an authorization seam may be mounted. */
  constructor(ctx: Context) {
    super(ctx, 'authorizationController', { namespace: 'authorization' })
  }

  /**
   * Every registered flow, for a configuration surface to render.
   * @returns one entry per flow, in registration order.
   * @throws RemoteError when no authorization seam is mounted.
   */
  @Remote
  list(): readonly AuthorizationEntry[] {
    return this.provider().list()
  }

  /**
   * Run one attempt to authorize a credential key, relaying its notices and
   * prompts to whichever caller started it.
   * @param key - the credential record to authorize, as `<scope>/<id>`.
   * @param method - which of the flow's methods to run; defaults to its first.
   * @param signal - caller lifetime; abort withdraws the attempt.
   * @returns how the attempt ended.
   * @throws RemoteError when the request is invalid, no flow claims the key,
   *   the named method does not exist, an attempt is already running, or the
   *   flow failed to commit its credential.
   */
  @Remote
  async begin(key: string, method: string | undefined, signal: AbortSignal): Promise<AuthorizationOutcome> {
    const request = parseRequest('authorization.begin', beginRequestSchema, { key, method })
    const branded = parseCredentialKey(request.key)
    const ctx = this.ctx
    const interaction: AuthorizationInteraction = {
      notify: (notice: AuthorizationNotice) => {
        ctx.emit('authorization/notice', { key: branded, notice })
      },
      prompt: (prompt: AuthorizationPrompt) => new Promise<string>((resolve, reject) => {
        const settle = (run: () => void): void => {
          this.pending.delete(branded)
          run()
        }
        const decline = (): void => {
          settle(() => { reject(new AuthorizationDeclinedError('the authorization prompt was declined')) })
        }
        if (signal.aborted || prompt.signal?.aborted === true) { decline(); return }
        this.pending.set(branded, {
          resolve: (value) => { settle(() => { resolve(value) }) },
          reject: (error) => { settle(() => { reject(error) }) },
        })
        ctx.emit('authorization/prompt', { key: branded, prompt: wireSafePrompt(prompt) })
        signal.addEventListener('abort', decline, { once: true })
        prompt.signal?.addEventListener('abort', decline, { once: true })
      }),
    }
    try {
      return await this.provider().begin({
        key: branded,
        ...request.method === undefined ? {} : { method: request.method },
        interaction,
        signal,
      })
    } catch (error) {
      throw this.rejected(branded, request.method, error)
    }
  }

  /**
   * Answer the prompt currently pending for a key.
   * @param key - the credential record whose prompt to answer, as `<scope>/<id>`.
   * @param value - the typed text, or the chosen option's id.
   * @throws RemoteError when the request is invalid or no prompt is pending for that key.
   */
  @Remote
  answerPrompt(key: string, value: string): void {
    const request = parseRequest('authorization.answerPrompt', answerRequestSchema, { key, value })
    this.pendingPrompt(parseCredentialKey(request.key)).resolve(request.value)
  }

  /**
   * Decline the prompt currently pending for a key.
   * @param key - the credential record whose prompt to decline, as `<scope>/<id>`.
   * @throws RemoteError when the request is invalid or no prompt is pending for that key.
   */
  @Remote
  declinePrompt(key: string): void {
    const request = parseRequest('authorization.declinePrompt', keyRequestSchema, { key })
    const branded = parseCredentialKey(request.key)
    this.pendingPrompt(branded).reject(new AuthorizationDeclinedError('the authorization prompt was declined'))
  }

  /**
   * Withdraw the attempt running for a key, if any.
   * @param key - the credential record whose attempt should stop, as `<scope>/<id>`.
   * @throws RemoteError when the request is invalid or no authorization seam is mounted.
   */
  @Remote
  cancel(key: string): void {
    const request = parseRequest('authorization.cancel', keyRequestSchema, { key })
    this.provider().cancel(parseCredentialKey(request.key))
  }

  /** Resolve the mounted seam or report how to supply it. */
  private provider(): AuthorizationService {
    const authorization = this.ctx.get('authorization')
    if (authorization === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'authorization service is absent: this deployment does not mount the authorization seam',
        {},
      )
    }
    return authorization
  }

  /** Resolve the prompt pending for a key or report that none is. */
  private pendingPrompt(key: CredentialKey): PendingPrompt {
    const found = this.pending.get(key)
    if (found === undefined) {
      throw new RemoteError('gateway/bad-request', `no authorization prompt is pending for "${key}"`, {})
    }
    return found
  }

  /** Classify one seam refusal into its wire failure code. */
  private rejected(key: CredentialKey, method: string | undefined, error: unknown): RemoteError {
    if (error instanceof AuthorizationError) {
      switch (error.code) {
        case 'NO_FLOW':
          return new RemoteError('authorization/no-flow', error.message, { key }, { cause: error })
        case 'UNKNOWN_METHOD':
          return new RemoteError(
            'authorization/unknown-method', error.message, { key, method: method ?? '' }, { cause: error })
        case 'ALREADY_IN_FLIGHT':
          return new RemoteError('authorization/in-flight', error.message, { key }, { cause: error })
        case 'NOT_COMMITTED':
          return new RemoteError('authorization/not-committed', error.message, { key }, { cause: error })
        default:
          break
      }
    }
    const message = error instanceof Error ? error.message : String(error)
    return new RemoteError('gateway/internal', message, {}, { cause: error })
  }
}

export default AuthorizationController
