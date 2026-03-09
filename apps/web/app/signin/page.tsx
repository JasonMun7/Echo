import { redirect } from "next/navigation";

export default async function SignInRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const desktop = params?.desktop === "1" ? "?desktop=1" : "";
  redirect(`/sign-in${desktop}`);
}
