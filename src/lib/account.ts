import type { createAuth } from "./auth";

type Auth = ReturnType<typeof createAuth>;

export function deleteCurrentAccount(auth: Auth, headers: Headers) {
  return auth.api.deleteUser({ body: {}, headers });
}
