import { getRuntimeAuth } from "@/lib/auth";

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    confirmation?: string;
  } | null;

  if (body?.confirmation !== "DELETE") {
    return Response.json(
      { error: 'Type "DELETE" to confirm account deletion.' },
      { status: 400 },
    );
  }

  const authRequest = new Request(
    new URL("/api/auth/delete-user", request.url),
    {
      body: "{}",
      headers: request.headers,
      method: "POST",
    },
  );

  return (await getRuntimeAuth()).handler(authRequest);
}
