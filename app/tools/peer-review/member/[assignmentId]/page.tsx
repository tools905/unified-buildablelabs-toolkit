import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RatingSlider } from "@/app/tools/peer-review/member/[assignmentId]/rating-slider";
import { TextField } from "@/app/tools/peer-review/member/[assignmentId]/text-field";
import { requireUser } from "@/lib/auth/require-user";
import { getAssignmentForReview } from "@/lib/services/assignment-service";
import { submitReview } from "@/lib/services/review-service";
import { one } from "@/lib/utils/relations";

const ratingFields = [
  ["communicationRating", "Communication"],
  ["reliabilityRating", "Reliability"],
  ["ownershipRating", "Ownership"],
  ["executionQualityRating", "Execution quality"],
  ["collaborationRating", "Collaboration"],
  ["technicalQualityRating", "Technical quality"],
  ["problemSolvingRating", "Problem solving"],
  ["leadershipRating", "Leadership"],
  ["systemDesignRating", "System design"],
  ["learningGrowthRating", "Learning growth"],
] as const;

export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { supabase, user } = await requireUser();
  const { assignmentId } = await params;
  const assignment = await getAssignmentForReview(supabase, assignmentId, user.id);
  const response = one(assignment.review_responses);

  async function submitAction(formData: FormData) {
    "use server";
    const { supabase, user } = await requireUser();
    await submitReview(supabase, assignmentId, user.id, {
      strengths: String(formData.get("strengths") || "") || undefined,
      improvements: String(formData.get("improvements") || "") || undefined,
      communicationRating: Number(formData.get("communicationRating") || 0) || undefined,
      reliabilityRating: Number(formData.get("reliabilityRating") || 0) || undefined,
      ownershipRating: Number(formData.get("ownershipRating") || 0) || undefined,
      executionQualityRating: Number(formData.get("executionQualityRating") || 0) || undefined,
      collaborationRating: Number(formData.get("collaborationRating") || 0) || undefined,
      technicalQualityRating: Number(formData.get("technicalQualityRating") || 0) || undefined,
      problemSolvingRating: Number(formData.get("problemSolvingRating") || 0) || undefined,
      leadershipRating: Number(formData.get("leadershipRating") || 0) || undefined,
      systemDesignRating: Number(formData.get("systemDesignRating") || 0) || undefined,
      learningGrowthRating: Number(formData.get("learningGrowthRating") || 0) || undefined,
      specificExample: String(formData.get("specificExample") || "") || undefined,
      privateNote: String(formData.get("privateNote") || "") || undefined,
    });
    redirect("/tools/peer-review/member");
  }

  return (
    <AppShell>
      <Card>
        <CardHeader>
          <CardTitle>
            Review {assignment.reviewee?.full_name ?? assignment.reviewee?.email}
          </CardTitle>
          <CardDescription>
            {assignment.review_rounds?.projects?.name} - {assignment.review_rounds?.title}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={submitAction} className="space-y-5">
            <TextField name="strengths" label="Strengths" defaultValue={response?.strengths} />
            <TextField name="improvements" label="Improvements" defaultValue={response?.improvements} />
            <div className="grid gap-3 md:grid-cols-2">
              {ratingFields.map(([name, label]) => (
                <RatingSlider
                  key={name}
                  name={name}
                  label={label}
                  defaultValue={ratingDefault(response, name)}
                />
              ))}
            </div>
            <TextField name="specificExample" label="Specific example" defaultValue={response?.specific_example} />
            <TextField name="privateNote" label="Private note for admin" defaultValue={response?.private_note ?? ""} optional />
            <Button>Submit review</Button>
          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function ratingDefault(response: Record<string, unknown> | undefined, field: string) {
  const key = field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).replace("_rating", "_rating");
  return response?.[key] as number | undefined;
}
