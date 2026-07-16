"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function AccountControls({ children }: { children?: ReactNode }) {
  const [confirmation, setConfirmation] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");

  async function signOut() {
    setPending(true);
    const result = await authClient.signOut().catch(() => null);

    if (!result || result.error) {
      setPending(false);
      setStatus("Sign out did not complete. Try again.");
      return;
    }

    window.location.assign("/");
  }

  async function deleteAccount() {
    setPending(true);
    setStatus("");

    let response: Response;

    try {
      response = await fetch("/api/account", {
        body: JSON.stringify({ confirmation }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      });
    } catch {
      setPending(false);
      setStatus(
        "We could not reach the server. Your account was not deleted. Try again.",
      );
      return;
    }

    if (!response.ok) {
      setPending(false);
      setStatus("Account deletion did not complete. Sign in again and retry.");
      return;
    }

    setDeleted(true);
    setPending(false);
    setStatus("Your account was deleted.");
  }

  if (deleted) {
    return (
      <section aria-labelledby="account-deleted-heading" className="account-actions">
        <h2 id="account-deleted-heading">Account deleted</h2>
        <p aria-live="polite" className="auth-status">
          {status}
        </p>
        <Link className="sign-in-link" href="/">
          Return to public information
        </Link>
      </section>
    );
  }

  return (
    <>
      {children}
      <section aria-labelledby="account-actions-heading" className="account-actions">
        <h2 id="account-actions-heading">Account actions</h2>
        <button disabled={pending} onClick={signOut} type="button">
          Sign out
        </button>

        <div className="danger-zone">
          <h3>Delete account</h3>
          <p>
            Deleting your account permanently removes your saved home. It also
            removes your sessions and linked sign-in methods.
          </p>
          <label htmlFor="delete-confirmation">{'Type "DELETE" to confirm'}</label>
          <input
            autoComplete="off"
            id="delete-confirmation"
            onChange={(event) => setConfirmation(event.target.value)}
            value={confirmation}
          />
          <button
            disabled={pending || confirmation !== "DELETE"}
            onClick={deleteAccount}
            type="button"
          >
            Delete my account
          </button>
        </div>

        <p aria-live="polite" className="auth-status">
          {status}
        </p>
      </section>
    </>
  );
}
