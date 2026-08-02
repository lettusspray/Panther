/**
 * Environment access — works across three runtimes:
 *   1. Cloudflare Worker bindings (pipeline worker hydrates globalThis.__WORKER_ENV__)
 *   2. Astro/Vite (import.meta.env)
 *   3. Node scripts (process.env)
 */
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
