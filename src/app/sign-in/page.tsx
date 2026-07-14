import { SignInForm } from "@/components/sign-in-form";

type SignInPageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps = {}) {
  const error = (await searchParams)?.error;

  return <SignInForm authError={error} />;
}
