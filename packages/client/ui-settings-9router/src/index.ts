/**
 * Host loader entry for the local 9router and importer integration.
 * @module @deepseek-ai/dsh-client-ui-settings-9router
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

/** Loopback host shared by both local services. */
export const NINE_ROUTER_HOST = '127.0.0.1'
/** 9router dashboard and API port. */
export const NINE_ROUTER_PORT = 20128
/** Codex importer workspace port. */
export const NINE_ROUTER_IMPORTER_PORT = 20129

/** Host configuration for automatic local-process startup. */
export interface Config {
  /** Absolute 9router cli.js or executable path; environment fallback: DSH_9ROUTER_ENTRY or NINER_CLI. */
  routerEntry?: string
  /** Absolute path to Import-9Router-JsCodex/gui.js; environment fallback: DSH_9ROUTER_IMPORTER_ENTRY. */
  importerEntry?: string
  /** Start the 9router gateway when port 20128 is closed. */
  autoStartRouter?: boolean
  /** Start the importer workspace when port 20129 is closed. */
  autoStartImporter?: boolean
}

/** Runtime validation and defaults for local service startup. */
export const Config: z<Config> = z.object({
  routerEntry: z.string(),
  importerEntry: z.string(),
  autoStartRouter: z.boolean().default(true),
  autoStartImporter: z.boolean().default(true),
})

/** Command specification for a local child process. */
export interface LaunchSpec {
  file: string
  args: string[]
  cwd?: string
}

/**
 * Check whether a local TCP port accepts a connection.
 * @param host - TCP host address to probe.
 * @param port - TCP port to probe.
 * @param timeoutMs - maximum milliseconds to wait.
 * @returns true when a connection is accepted.
 */
export function checkPortListening(host: string, port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolveResult) => {
    const socket = createConnection({ host, port })
    let settled = false
    const finish = (listening: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolveResult(listening)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => { finish(true) })
    socket.once('timeout', () => { finish(false) })
    socket.once('error', () => { finish(false) })
  })
}

/**
 * Resolve a command for the installed 9router CLI.
 * @param routerEntry - explicit cli.js/executable path, or undefined to use environment and PATH fallbacks.
 * @returns executable and argument list for background launch.
 */
export function resolveNineRouterCommand(routerEntry?: string): LaunchSpec {
  const args = ['--host', NINE_ROUTER_HOST, '--no-browser', '--tray', '--skip-update']
  const configured = routerEntry?.trim() || process.env.DSH_9ROUTER_ENTRY?.trim() || process.env.NINER_CLI?.trim()
  if (configured) {
    const entry = resolve(configured)
    return entry.endsWith('.js')
      ? { file: process.execPath, args: [entry, ...args], cwd: dirname(entry) }
      : { file: entry, args }
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (appData) {
      const cliPath = join(appData, 'npm', 'node_modules', '9router', 'cli.js')
      if (existsSync(cliPath)) return { file: process.execPath, args: [cliPath, ...args] }
    }
    const comSpec = process.env.ComSpec || 'cmd.exe'
    return { file: comSpec, args: ['/d', '/s', '/c', '9router.cmd', ...args] }
  }
  return { file: '9router', args }
}

/**
 * Resolve the configured importer command without invoking a shell.
 * @param importerEntry - explicit config value, or undefined to use the environment.
 * @returns a launch spec when the JavaScript entry exists.
 */
export function resolveImporterCommand(importerEntry?: string): LaunchSpec | undefined {
  const configured = importerEntry?.trim() || process.env.DSH_9ROUTER_IMPORTER_ENTRY?.trim()
  const candidates = configured ? [resolve(configured)] : [
    resolve(process.cwd(), 'Import-9Router-JsCodex', 'gui.js'),
    resolve(process.cwd(), 'downloads', 'Import-9Router-JsCodex', 'gui.js'),
    resolve(process.cwd(), '..', 'Import-9Router-JsCodex', 'gui.js'),
  ]
  const entry = candidates.find(candidate => existsSync(candidate))
  if (!entry) return undefined
  return {
    file: process.execPath,
    args: [entry, '--port', String(NINE_ROUTER_IMPORTER_PORT), '--no-browser'],
    cwd: dirname(entry),
  }
}

/**
 * Launch one optional local service independently from the dsh process lifetime.
 * @param spec - executable, arguments, and optional working directory.
 */
export function launchBackground(spec: LaunchSpec): void {
  try {
    const child = spawn(spec.file, spec.args, {
      cwd: spec.cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.on('error', () => {})
    child.unref()
  } catch {
    // Optional integration startup must never break dsh Host startup.
  }
}

/** Start configured local 9router services when their ports are closed. */
export function apply(ctx: Context, config: Config = {}): void {
  if (typeof process === 'undefined' || !process.versions?.node) return
  ctx.effect(() => {
    let active = true
    if (config.autoStartRouter !== false) {
      void checkPortListening(NINE_ROUTER_HOST, NINE_ROUTER_PORT).then((listening) => {
        if (active && !listening) launchBackground(resolveNineRouterCommand(config.routerEntry))
      })
    }
    if (config.autoStartImporter !== false) {
      const importer = resolveImporterCommand(config.importerEntry)
      if (importer) {
        void checkPortListening(NINE_ROUTER_HOST, NINE_ROUTER_IMPORTER_PORT).then((listening) => {
          if (active && !listening) launchBackground(importer)
        })
      }
    }
    return () => { active = false }
  }, 'ui-settings-9router: auto-start local services')
}
