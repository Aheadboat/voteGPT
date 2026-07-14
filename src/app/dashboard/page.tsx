import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRuntimeAuth } from "@/lib/auth";
import { AccountControls } from "@/components/account-controls";

const signInURL = "/sign-in?next=%2Fdashboard";

export default async function DashboardPage() {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie");

  if (!cookie?.includes("better-auth.session_token=")) {
    redirect(signInURL);
  }

  const auth = await getRuntimeAuth();
  const currentSession = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!currentSession) {
    redirect(signInURL);
  }

  return (
    <main className="dashboard" id="main-content">
      <section aria-labelledby="dashboard-heading" className="dashboard-card">
        <p className="section-label">Account</p>
        <h1 id="dashboard-heading">Your dashboard</h1>
        <p>
          Signed in as <strong>{currentSession.user.email}</strong>
        </p>
        <p>
          Personalized civic information is not available yet. Public
          information remains accessible from the home page.
        </p>
        <AccountControls />
      </section>
    </main>
  );
}
