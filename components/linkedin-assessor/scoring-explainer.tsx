import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LinkedInScoringExplainer() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>How these settings work</CardTitle>
        <CardDescription>The weights decide how much consistency and post quality contribute to a member&apos;s final score.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <Explanation title="Volume weight">The importance of posting consistency. Volume compares the number of assessed posts in the rolling period with the member&apos;s prorated monthly target. Reaching or exceeding the target gives a volume score of 100.</Explanation>
        <Explanation title="Quality weight">The importance of content quality. Quality is the average effective score of assessed posts after admin overrides and exclusions.</Explanation>
        <div className="rounded-md border border-border bg-muted/40 p-3 text-foreground">
          Final score = (volume score * volume weight) + (average quality * quality weight). The weights must total 1.00. For example, 0.40 volume and 0.60 quality means quality contributes 60% of the final score.
        </div>
        <Explanation title="Rolling analysis duration">How many recent days the live dashboard recalculates every day. A 30-day duration means today and the previous 29 days. Posts outside that moving window remain stored but do not affect current dashboard scores.</Explanation>
        <Explanation title="Manual post submission">Members submit the LinkedIn post URL and the post writing directly. The toolkit scores that exact post and emails private coaching to the member.</Explanation>
      </CardContent>
    </Card>
  );
}

function Explanation({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="font-medium text-foreground">{title}</h3><p className="mt-1 leading-6">{children}</p></section>;
}
