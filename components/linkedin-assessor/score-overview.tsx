import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LinkedInMemberStats } from "@/modules/linkedin-assessor";

export function LinkedInScoreOverview({ stats }: { stats: LinkedInMemberStats[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Original posts by member</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {stats.map((member) => <MetricBar key={member.trackedMemberId} label={member.name} value={member.postCount} maximum={Math.max(1, ...stats.map((item) => item.postCount))} suffix=" posts" />)}
          {stats.length === 0 ? <p className="text-sm text-muted-foreground">Add a tracked member to begin.</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Final score</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {stats.map((member) => <MetricBar key={member.trackedMemberId} label={member.name} value={member.finalScore ?? 0} maximum={100} suffix={member.finalScore == null ? " N/A" : ""} />)}
          {stats.length === 0 ? <p className="text-sm text-muted-foreground">Scores appear after posts are synced and analyzed.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricBar({ label, value, maximum, suffix }: { label: string; value: number; maximum: number; suffix: string }) {
  const width = Math.max(2, Math.min(100, (value / Math.max(1, maximum)) * 100));
  return <div><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="truncate">{label}</span><span className="font-medium">{value}{suffix}</span></div><div className="h-2 overflow-hidden rounded-sm bg-muted"><div className="h-full bg-primary" style={{ width: `${width}%` }} /></div></div>;
}
