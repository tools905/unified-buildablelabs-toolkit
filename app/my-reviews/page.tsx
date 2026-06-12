import { redirect } from "next/navigation";

export default function MyReviewsRedirectPage() {
  redirect("/tools/peer-review/member");
}
