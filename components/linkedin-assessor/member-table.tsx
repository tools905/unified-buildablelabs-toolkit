import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LinkedInMemberStats } from "@/modules/linkedin-assessor";

export function LinkedInMemberTable({ stats, linkMembers = true }: { stats: LinkedInMemberStats[]; linkMembers?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Posts</TableHead>
          <TableHead>Average score</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stats.map((member) => (
          <TableRow key={member.trackedMemberId}>
            <TableCell>
              {linkMembers ? (
                <Link className="font-medium hover:underline" href={`/tools/linkedin-assessor/admin/members/${member.trackedMemberId}`}>{member.name}</Link>
              ) : <span className="font-medium">{member.name}</span>}
              <div className="max-w-64 truncate text-xs text-muted-foreground">{member.linkedinProfileUrl}</div>
            </TableCell>
            <TableCell className="capitalize">{member.role.replaceAll("_", " ")}</TableCell>
            <TableCell>{member.postCount}</TableCell>
            <TableCell className="font-semibold">{member.averageQualityScore ?? "N/A"}</TableCell>
          </TableRow>
        ))}
        {stats.length === 0 ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No LinkedIn profiles are being tracked yet.</TableCell></TableRow> : null}
      </TableBody>
    </Table>
  );
}
