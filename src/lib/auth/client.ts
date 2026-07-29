/**
 * Better-Auth Client — Vanilla JS for Astro SSR/Islands
 *
 * Uses the vanilla client since Panther is Astro (no React/Vue).
 * All auth requests go through /api/auth/* which Better-Auth handles.
 */

import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: import.meta.env.BETTER_AUTH_URL ?? "http://localhost:4321",
});

export const { signIn, signUp, signOut, useSession } = authClient;
