import { drizzleAdapter, type DB } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { magicLink, type MagicLinkOptions } from "better-auth/plugins/magic-link";
import { google, type GoogleOptions } from "better-auth/social-providers";
import nodemailer from "nodemailer";
import { authSchema } from "@/db/schema";
import { createDatabase } from "@/db";

type CreateAuthOptions = {
  baseURL: string;
  database: DB;
  google?: {
    clientId: string;
    clientSecret: string;
    getUserInfo?: GoogleOptions["getUserInfo"];
    verifyIdToken?: GoogleOptions["verifyIdToken"];
  };
  magicLinkExpiresIn?: number;
  secret: string;
  sendMagicLink: MagicLinkOptions["sendMagicLink"];
};

export function createAuth({
  baseURL,
  database,
  google: googleOptions,
  magicLinkExpiresIn,
  secret,
  sendMagicLink,
}: CreateAuthOptions) {
  return betterAuth({
    account: {
      accountLinking: {
        allowDifferentEmails: false,
        enabled: true,
        trustedProviders: [],
      },
    },
    advanced: {
      disableCSRFCheck: false,
      disableOriginCheck: false,
      ipAddress: { disableIpTracking: true },
    },
    baseURL,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: authSchema,
    }),
    plugins: [
      magicLink({
        expiresIn: magicLinkExpiresIn,
        sendMagicLink,
        storeToken: "hashed",
      }),
    ],
    secret,
    session: {
      cookieCache: { enabled: false },
    },
    trustedOrigins: [baseURL],
    socialProviders: googleOptions
      ? { google: verifiedGoogleOptions(googleOptions) }
      : undefined,
    user: {
      deleteUser: { enabled: true },
    },
  });
}

function verifiedGoogleOptions(
  options: NonNullable<CreateAuthOptions["google"]>,
): GoogleOptions {
  const provider = google(options);
  const getUserInfo = options.getUserInfo ?? provider.getUserInfo;

  return {
    ...options,
    disableDefaultScope: true,
    getUserInfo: async (tokens) => {
      const profile = await getUserInfo(tokens);
      return profile?.user.emailVerified ? profile : null;
    },
    scope: ["openid", "email"],
  };
}

let runtimeAuth: Promise<ReturnType<typeof createAuth>> | undefined;

function requiredEnvironment(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function getRuntimeAuth() {
  if (runtimeAuth) {
    return runtimeAuth;
  }

  runtimeAuth = createRuntimeAuth();
  return runtimeAuth;
}

async function createRuntimeAuth() {
  const emailFrom = requiredEnvironment("EMAIL_FROM");
  const transport = nodemailer.createTransport(
    requiredEnvironment("EMAIL_SERVER"),
  );

  return createAuth({
    baseURL: requiredEnvironment("BETTER_AUTH_URL"),
    database: await createDatabase(requiredEnvironment("DATABASE_URL")),
    google: {
      clientId: requiredEnvironment("GOOGLE_CLIENT_ID"),
      clientSecret: requiredEnvironment("GOOGLE_CLIENT_SECRET"),
    },
    secret: requiredEnvironment("BETTER_AUTH_SECRET"),
    sendMagicLink: async ({ email, url }) => {
      await transport.sendMail({
        from: emailFrom,
        subject: "Your voteGPT sign-in link",
        text: `Use this one-time link to sign in to voteGPT:\n\n${url}\n\nIf you did not request it, you can ignore this email.`,
        to: email,
      });
    },
  });
}
