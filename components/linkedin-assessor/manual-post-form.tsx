import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitLinkedInPostAction } from "@/app/tools/linkedin-assessor/actions";

type MemberOption = { id: string; name: string };

export function ManualPostForm({ members, memberId }: { members: MemberOption[]; memberId?: string }) {
  return <form action={submitLinkedInPostAction} className="grid gap-4 sm:grid-cols-2">
    <div className="space-y-2"><Label htmlFor="trackedMemberId">Profile</Label><select id="trackedMemberId" name="trackedMemberId" defaultValue={memberId} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm" required>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></div>
    <div className="space-y-2"><Label htmlFor="postKind">Post type</Label><select id="postKind" name="postKind" defaultValue="original_post" className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"><option value="original_post">Original post</option><option value="collaborative_post">Collaborative post</option></select></div>
    <div className="space-y-2 sm:col-span-2"><Label htmlFor="postUrl">LinkedIn post URL</Label><Input id="postUrl" name="postUrl" type="url" placeholder="https://www.linkedin.com/posts/..." required /></div>
    <div className="space-y-2"><Label htmlFor="postedAt">Published date</Label><Input id="postedAt" name="postedAt" type="date" required /></div>
    <div className="space-y-2"><Label htmlFor="collaborationContext">Collaboration context</Label><Input id="collaborationContext" name="collaborationContext" placeholder="Co-author or collaboration details" /></div>
    <div className="space-y-2 sm:col-span-2"><Label htmlFor="postText">Post text</Label><Textarea id="postText" name="postText" rows={8} minLength={20} placeholder="Paste the complete LinkedIn post text." required /></div>
    <div className="sm:col-span-2"><Button>Submit post</Button></div>
  </form>;
}
