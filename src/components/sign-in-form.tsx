"use client";

import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

type SignInFormProps = {
  authError?: string;
};

function messageForAuthError(error?: string) {
  if (!error) {
    return "";
  }

  return error === "INVALID_TOKEN"
    ? "That sign-in link is invalid or expired. Request a new one."
    : "Sign-in did not complete. Try again or choose another method.";
}

export function SignInForm({ authError }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(messageForAuthError(authError));
  const [pending, setPending] = useState(false);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setStatus("");

    const result = await authClient.signIn.magicLink({
      callbackURL: "/dashboard",
      email,
      errorCallbackURL: "/sign-in",
    });

    setPending(false);
    setStatus(
      result.error
        ? "We could not send a sign-in link. Check the address and try again."
        : "Check your email. The link expires soon and can be used once.",
    );
  }

  async function continueWithGoogle() {
    setPending(true);
    setStatus("");

    const result = await authClient.signIn.social({
      callbackURL: "/dashboard",
      errorCallbackURL: "/sign-in",
      provider: "google",
    });

    if (result.error) {
      setPending(false);
      setStatus("Google sign-in did not complete. Try again or use email.");
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

        <form className="auth-form" onSubmit={requestLink}>
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

        <div className="auth-divider" aria-hidden="true">
          <span>or</span>
        </div>

        <button
          className="secondary-button"
          disabled={pending}
          onClick={continueWithGoogle}
          type="button"
        >
          Continue with Google
        </button>

        <p className="auth-note">
          We use your email only for account access. Residence is requested
          separately, only when needed for personalized civic information.
        </p>
        <p aria-live="polite" className="auth-status">
          {status}
        </p>
      </section>
    </main>
  );
}
