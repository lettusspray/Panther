/**
 * Environment access — works across three runtimes:
 *   1. Cloudflare Worker bindings (hydrated onto globalThis.__WORKER_ENV__)
 *   2. Astro/Vite (import.meta.env)
 *   3. Node scripts (process.env)
 */

const WORKER_ENV_KEY = "__WORKER_ENV__";

/**
 * Bridge a Cloudflare runtime `env` binding object onto globalThis so
 * `readEnv()` can see secrets/vars that only exist at runtime (never in
 * `import.meta.env`, which is baked at build time).
 */
export function hydrateWorkerEnv(env: Record<string, unknown>): void {
  const hydrated: Record<string, unknown> = { ...env };
  const hyperdrive = env.HYPERDRIVE as { connectionString?: string } | undefined;
  if (hyperdrive?.connectionString) {
    hydrated.HYPERDRIVE_CONNECTION_STRING = hyperdrive.connectionString;
  }
  (globalThis as Record<string, unknown>)[WORKER_ENV_KEY] = hydrated;
}

/** Resolve secrets from the Cloudflare runtime `env` binding, if running in a Worker. */
export async function hydrateFromCloudflareRuntime(): Promise<void> {
  try {
    const cf = (await import("cloudflare:workers")) as unknown as {
      env?: Record<string, unknown>;
    };
    if (cf?.env) hydrateWorkerEnv(cf.env as Record<string, unknown>);
  } catch {
    // Not in a Cloudflare Worker context (astro dev / vitest / node script) — skip.
  }
}

export function readEnv(name: string): string | undefined {
  const g = globalThis as Record<string, unknown>;
  const bindings = g.__WORKER_ENV__ as Record<string, unknown> | undefined;
  if (bindings && typeof bindings[name] === "string" && bindings[name] !== "") {
    return bindings[name] as string;
  }
  const meta = (import.meta as { env?: Record<string, unknown> }).env;
  if (meta && typeof meta[name] === "string" && meta[name] !== "") {
    return meta[name] as string;
  }
  if (typeof process !== "undefined" && process.env && typeof process.env[name] === "string" && process.env[name] !== "") {
    return process.env[name];
  }
  return undefined;
}

export function getEnv(key: string, fallback?: string): string {
  const value = readEnv(key) ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing env variable: ${key}`);
  }
  return value;
}
