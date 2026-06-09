import React from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { getRoundReport } from "@/lib/services/report-service";

function renderHighlightedText(text: string) {
  if (!text) return null;

  // Split by <good>...</good>, <concern>...</concern>, and **...** tags
  const regex = /(<good>[\s\S]*?<\/good>|<concern>[\s\S]*?<\/concern>|\*\*[\s\S]*?\*\*)/gi;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.toLowerCase().startsWith("<good>")) {
      const content = part.replace(/<\/?good>/gi, "");
      return (
        <span
          key={index}
          className="bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 px-1.5 py-0.5 rounded font-medium inline-block my-0.5"
        >
          {content}
        </span>
      );
    } else if (part.toLowerCase().startsWith("<concern>")) {
      const content = part.replace(/<\/?concern>/gi, "");
      return (
        <span
          key={index}
          className="bg-rose-500/15 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 px-1.5 py-0.5 rounded font-medium inline-block my-0.5"
        >
          {content}
        </span>
      );
    } else if (part.startsWith("**") && part.endsWith("**")) {
      const content = part.slice(2, -2);
      return (
        <strong key={index} className="font-semibold text-foreground block mt-3 mb-1 first:mt-0">
          {content}
        </strong>
      );
    }

    // Split text by newlines to keep line breaks
    return part.split("\n").map((line, lineIdx, array) => (
      <React.Fragment key={`${index}-${lineIdx}`}>
        {line}
        {lineIdx < array.length - 1 && <br />}
      </React.Fragment>
    ));
  });
}

const categoryDisplayNames: Record<string, string> = {
  communication: "Communication",
  reliability: "Reliability",
  ownership: "Ownership",
  executionQuality: "Execution Quality",
  collaboration: "Collaboration",
  technicalQuality: "Technical Quality",
  problemSolving: "Problem Solving",
  leadership: "Leadership",
  systemDesign: "System Design",
  learningGrowth: "Learning Growth",
};

export default async function ReportPage({
  params,
}: {
  params: Promise<{ projectId: string; roundId: string }>;
}) {
  const { supabase, user } = await requireUser();
  const { projectId, roundId } = await params;
  let report;
  try {
    report = await getRoundReport(supabase, roundId, user.id);
  } catch {
    redirect(`/projects/${projectId}`);
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">{report.round.title} report</h1>
        <p className="text-muted-foreground">
          Anonymous feedback grouped by reviewee. Reviewer identities are hidden.
        </p>
      </div>
      <div className="mb-4 flex gap-2">
        <Badge>{report.progress.completionRate}% complete</Badge>
        <Badge>{report.progress.submitted} submitted</Badge>
        <Badge>{report.progress.total - report.progress.submitted} missing</Badge>
      </div>
      {report.ai?.overallSummary || report.ai?.unavailableReason ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>AI summary</CardTitle>
          </CardHeader>
          <CardContent>
            {report.ai?.overallSummary ? (
              <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {renderHighlightedText(report.ai.overallSummary)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {report.ai.unavailableReason}
              </p>
            )}
            {report.ai?.model ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Model: {report.ai.model}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <div className="space-y-4">
        {report.reviewees.map((reviewee) => (
          <Card key={reviewee.revieweeId}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                <span>{reviewee.revieweeName}</span>
                <span className="text-base">
                  {reviewee.weightedScore} / 5 ({reviewee.scorePercentage}%)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-sm text-muted-foreground">
                  Role: {reviewee.roleLabel}. Reviews received: {reviewee.reviewCount}.
                </p>
                {reviewee.aiSummary ? (
                  <div className="mb-3 rounded-md bg-muted p-3 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {renderHighlightedText(reviewee.aiSummary)}
                  </div>
                ) : null}
                <h3 className="font-medium">Highest weighted categories</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {reviewee.highestWeightedCategories.map((item) => (
                    <Badge key={item.category}>
                      {categoryDisplayNames[item.category] ?? item.category}: {Math.round(item.weight * 100)}%
                    </Badge>
                  ))}
                  <Badge>weights: {reviewee.scoringSource}</Badge>
                </div>
                <h3 className="mt-4 font-medium">Raw category averages</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(reviewee.rawCategoryAverages).map(([category, value]) => (
                    <div key={category} className="rounded-md bg-muted p-2">
                      {categoryDisplayNames[category] ?? category}: {String(value ?? "n/a")}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <FeedbackList title="Strengths" items={reviewee.strengths} />
                <FeedbackList title="Improvement areas" items={reviewee.improvements} />
                <FeedbackList title="Specific examples" items={reviewee.examples} />
                <FeedbackList title="Private Notes for Admin" items={reviewee.privateNotes} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

function FeedbackList({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="font-medium">{title}</h3>
      <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
        {items.length === 0 ? <li>None</li> : items.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
    </section>
  );
}
