import { redirect } from "next/navigation";

/** Settings live in Account → Profile modal. */
export default function SettingsRedirectPage() {
  redirect("/dashboard");
}
