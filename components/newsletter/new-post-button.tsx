import { Plus } from "lucide-react";
import { SubmitButton } from "@/components/dashboard/submit-button";
import { createDraftAction } from "@/app/tools/newsletter/actions";

export function NewPostButton() {
  return (
    <form action={createDraftAction}>
      <SubmitButton>
        <Plus className="h-3.5 w-3.5" />
        New Post
      </SubmitButton>
    </form>
  );
}
