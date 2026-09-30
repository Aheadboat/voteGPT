import { SignInForm } from "@/components/sign-in-form";
import { getSignInMethods } from "@/lib/auth";
import {
  governmentNavigationHref,
  normalizeGovernmentNavigation,
} from "@/lib/government-navigation";

type SignInPageProps = {
  searchParams?: Promise<{ error?: string; next?: string | string[] }>;
};

// Only the existing dashboard is a return destination. Rebuild its known
// navigation parameters so arbitrary query data never enters the OAuth flow.
function signInDestination(next?: string | string[]) {
  if (typeof next !== "string" || !/^\/dashboard(?:\?|$)/.test(next)) {
    return "/dashboard";
  }
  const destination = new URL(next, "https://votegpt.invalid");
  if (destination.pathname !== "/dashboard") return "/dashboard";
  if (!destination.search) return "/dashboard";
  return `/dashboard${governmentNavigationHref(normalizeGovernmentNavigation(destination.searchParams))}`;
}

export default async function SignInPage({ searchParams }: SignInPageProps = {}) {
  const params = await searchParams;

  return (
    <SignInForm
      authError={params?.error}
      callbackURL={signInDestination(params?.next)}
      methods={getSignInMethods()}
    />
  );
}
