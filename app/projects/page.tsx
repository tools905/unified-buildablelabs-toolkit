import { redirect } from "next/navigation";

export default function ProjectsRedirectPage() {
  redirect("/tools/peer-review/admin");
}
