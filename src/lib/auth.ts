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
  sendMagicLink?: MagicLinkOptions["sendMagicLink"];
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
    onAPIError: { errorURL: new URL("/sign-in", baseURL).toString() },
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: authSchema,
    }),
    plugins: sendMagicLink
      ? [
          magicLink({
            expiresIn: magicLinkExpiresIn,
            sendMagicLink,
            storeToken: "hashed",
          }),
        ]
      : [],
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

export function getSignInMethods() {
  return {
    email: Boolean(
      process.env.EMAIL_FROM?.trim() && process.env.EMAIL_SERVER?.trim(),
    ),
    google: Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
    ),
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

  const initialization = createRuntimeAuth();
  runtimeAuth = initialization;
  void initialization.catch(() => {
    if (runtimeAuth === initialization) {
      runtimeAuth = undefined;
    }
  });
  return initialization;
}

async function createRuntimeAuth() {
  const emailFrom = process.env.EMAIL_FROM?.trim();
  const emailServer = process.env.EMAIL_SERVER?.trim();
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const transport = emailFrom && emailServer
    ? nodemailer.createTransport(emailServer)
    : undefined;

  return createAuth({
    baseURL: requiredEnvironment("BETTER_AUTH_URL"),
    database: await createDatabase(requiredEnvironment("DATABASE_URL")),
    google: googleClientId && googleClientSecret
      ? { clientId: googleClientId, clientSecret: googleClientSecret }
      : undefined,
    secret: requiredEnvironment("BETTER_AUTH_SECRET"),
    sendMagicLink: transport
      ? async ({ email, url }) => {
          await transport.sendMail({
            from: emailFrom,
            subject: "Your voteGPT sign-in link",
            text: `Use this one-time link to sign in to voteGPT:\n\n${url}\n\nIf you did not request it, you can ignore this email.`,
            to: email,
          });
        }
      : undefined,
  });
}
