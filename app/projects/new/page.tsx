import { redirect } from "next/navigation";

export default function NewProjectRedirectPage() {
  redirect("/tools/peer-review/admin/new");
}
