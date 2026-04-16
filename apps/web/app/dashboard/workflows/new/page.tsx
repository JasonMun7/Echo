import { redirect } from "next/navigation";

/** Legacy URL: creation options live on `/dashboard/workflows` (header menu) and sidebar Quick Create. */
export default function WorkflowNewRedirectPage() {
  redirect("/dashboard/workflows");
}
