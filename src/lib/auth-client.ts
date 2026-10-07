"use client";

import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // The initiating form owns navigation so a late response cannot redirect
  // after the user has left or cancelled the request.
  disableDefaultFetchPlugins: true,
  fetchOptions: { timeout: 15_000 },
  plugins: [magicLinkClient()],
});
