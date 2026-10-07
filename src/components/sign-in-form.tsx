"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

type SignInFormProps = {
  authError?: string;
  callbackURL?: string;
  methods?: { email: boolean; google: boolean };
};

function messageForAuthError(error?: string) {
  if (!error) {
    return "";
  }

  return error === "INVALID_TOKEN"
    ? "That sign-in link is invalid or expired. Request a new one."
    : "Sign-in did not complete. Try again or choose another method.";
}

function googleAuthorizationURL(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === "https://accounts.google.com"
      && url.pathname === "/o/oauth2/v2/auth"
      && !url.username && !url.password && !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function SignInForm({
  authError,
  callbackURL = "/dashboard",
  methods = { email: true, google: true },
}: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(messageForAuthError(authError));
  const [pending, setPending] = useState(false);

  const requestPending = useRef(false);
  const googleAttempt = useRef<{
    controller: AbortController;
    timeout: ReturnType<typeof setTimeout>;
  } | null>(null);
  const cancelGoogleRequest = useCallback(() => {
    const attempt = googleAttempt.current;
    if (!attempt) return;
    googleAttempt.current = null;
    clearTimeout(attempt.timeout);
    attempt.controller.abort();
    requestPending.current = false;
  }, []);

  useEffect(() => {
    const pageWindow = window;
    const cancelForNavigation = () => {
      if (!googleAttempt.current) return;
      cancelGoogleRequest();
      setPending(false);
      setStatus("Sign-in was canceled. You can try again.");
    };
    const onLinkNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>("a[href]")
        : null;
      if (!link || link.hasAttribute("download")
        || (link.target && link.target !== "_self")) return;
      const destination = new URL(link.href, pageWindow.location.href);
      const current = new URL(pageWindow.location.href);
      if (!/^https?:$/.test(destination.protocol)) return;
      if (destination.origin === current.origin
        && destination.pathname === current.pathname
        && destination.search === current.search) return;
      cancelForNavigation();
    };
    // Cancel at navigation intent, not only after a delayed Next transition
    // finally unmounts this form. Header links are outside the form itself.
    document.addEventListener("click", onLinkNavigation, true);
    pageWindow.addEventListener("pagehide", cancelForNavigation);
    pageWindow.addEventListener("popstate", cancelForNavigation);
    return () => {
      document.removeEventListener("click", onLinkNavigation, true);
      pageWindow.removeEventListener("pagehide", cancelForNavigation);
      pageWindow.removeEventListener("popstate", cancelForNavigation);
      cancelGoogleRequest();
    };
  }, [cancelGoogleRequest]);
  const errorCallbackURL = callbackURL === "/dashboard"
    ? "/sign-in"
    : `/sign-in?next=${encodeURIComponent(callbackURL)}`;

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestPending.current) return;
    requestPending.current = true;
    setPending(true);
    setStatus("Sending your sign-in link…");

    try {
      const result = await authClient.signIn.magicLink({
        callbackURL,
        email,
        errorCallbackURL,
      });
      setStatus(
        result.error
          ? "We could not send a sign-in link. Check the address and try again."
          : "Check your email. The link expires soon and can be used once.",
      );
    } catch {
      setStatus(
        "We could not reach the sign-in service. Check your connection and try again.",
      );
    } finally {
      requestPending.current = false;
      setPending(false);
    }
  }

  async function continueWithGoogle() {
    if (requestPending.current) return;
    requestPending.current = true;
    setPending(true);
    setStatus("Connecting to Google…");
    const controller = new AbortController();
    // Better Fetch's built-in timeout is inactive when a signal is supplied.
    const attempt = {
      controller,
      timeout: setTimeout(() => controller.abort(), 15_000),
    };
    googleAttempt.current = attempt;

    try {
      const result = await authClient.signIn.social({
        callbackURL,
        disableRedirect: true,
        errorCallbackURL,
        provider: "google",
      }, { signal: controller.signal });
      if (googleAttempt.current !== attempt) return;
      if (controller.signal.aborted) throw new Error("Sign-in request expired");
      const destination = googleAuthorizationURL(result.data?.url);
      if (result.error || !destination) {
        setStatus(methods.email
          ? "Google sign-in did not complete. Try again or use email."
          : "Google sign-in did not complete. Try again.");
        return;
      }
      window.location.assign(destination);
      setStatus("Google should open in this tab. If it does not, try again.");
    } catch {
      if (googleAttempt.current !== attempt) return;
      setStatus(
        "We could not reach the sign-in service. Check your connection and try again.",
      );
    } finally {
      clearTimeout(attempt.timeout);
      if (googleAttempt.current === attempt) {
        googleAttempt.current = null;
        requestPending.current = false;
        setPending(false);
      }
    }
  }

  return (
    <main className="auth-page" id="main-content">
      <section className="auth-card" aria-labelledby="sign-in-heading">
        <p className="section-label">Your dashboard</p>
        <h1 id="sign-in-heading">Sign in to your dashboard</h1>
        <p className="auth-intro">
          Public civic information remains available without an account.
        </p>

        {methods.email && (
          <form aria-busy={pending} className="auth-form" onSubmit={requestLink}>
            <label htmlFor="email">Email address</label>
            <input
              autoComplete="email"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
            <button disabled={pending} type="submit">
              Email me a sign-in link
            </button>
          </form>
        )}

        {methods.email && methods.google && (
          <div className="auth-divider" aria-hidden="true">
            <span>or</span>
          </div>
        )}

        {methods.google && (
          <button
            className="secondary-button"
            disabled={pending}
            onClick={continueWithGoogle}
            type="button"
          >
            Continue with Google
          </button>
        )}

        {!methods.email && !methods.google && (
          <p role="status">
            Sign-in is not available right now. You can still browse public information.
          </p>
        )}

        <p className="auth-note">
          We use your email only for account access. Residence is requested
          separately, only when needed for personalized civic information.
        </p>
        <p aria-live="polite" className="auth-status" role="status">
          {status}
        </p>
        <Link href="/">Browse public information</Link>
      </section>
    </main>
  );
}
