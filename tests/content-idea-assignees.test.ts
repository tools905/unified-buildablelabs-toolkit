import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/workspace-service", () => ({ isWorkspaceAdmin: vi.fn() }));
vi.mock("@/lib/services/audit-service", () => ({ writeAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/services/notification-service", () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/services/email-service", () => ({ sendContentIdeaAssignedEmail: vi.fn(async () => undefined) }));

import { writeAuditLog } from "@/lib/services/audit-service";
import { setIdeaAssignees } from "@/lib/services/content-idea-service";
import { createNotification } from "@/lib/services/notification-service";
import { sendContentIdeaAssignedEmail } from "@/lib/services/email-service";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { assigneeIdsSchema } from "@/lib/validation/content-idea-schema";
import { diffAssignees, MAX_ASSIGNEES, orderAssignees, toMemberOptions } from "@/lib/utils/content-board";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const IDEA = "22222222-2222-4222-8222-222222222222";
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ANA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BEN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STRANGER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const PEOPLE: Record<string, string> = { [ADMIN]: "Akhil", [ANA]: "Ana", [BEN]: "Ben", [CAL]: "Cal" };

// A stand-in for Supabase that answers the few queries setIdeaAssignees makes and records its writes.
function fakeSupabase(options: { members: string[]; assigned: string[] }) {
  const written = { inserted: [] as Record<string, string>[], deleted: [] as string[] };
  const from = (table: string) => {
    let deleting = false;
    let filterIn: string[] | null = null;
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      delete: () => {
        deleting = true;
        return builder;
      },
      in: (_column: string, values: string[]) => {
        filterIn = values;
        if (deleting) {
          written.deleted.push(...values);
          return Promise.resolve({ error: null });
        }
        return builder;
      },
      insert: (rows: Record<string, string>[]) => {
        written.inserted.push(...rows);
        return Promise.resolve({ error: null });
      },
      maybeSingle: () => Promise.resolve({ data: { title: "Carousel on onboarding" }, error: null }),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        const data =
          table === "workspace_members"
            ? options.members.filter((id) => (filterIn ?? []).includes(id)).map((user_id) => ({ user_id }))
            : table === "profiles"
              ? (filterIn ?? []).map((id) => ({ id, full_name: PEOPLE[id] ?? null, email: `${(PEOPLE[id] ?? id).toLowerCase()}@buildablelabs.com` }))
              : options.assigned.map((user_id) => ({ user_id }));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return builder;
  };
  return { client: { from } as never, written };
}

const asAdmin = (isAdmin: boolean) => vi.mocked(isWorkspaceAdmin).mockResolvedValue(isAdmin);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createNotification).mockResolvedValue(undefined);
  asAdmin(true);
});

describe("setIdeaAssignees", () => {
  it("refuses anyone who is not an admin, and saves nothing", async () => {
    asAdmin(false);
    const { client, written } = fakeSupabase({ members: [ANA], assigned: [] });
    await expect(setIdeaAssignees(client, WORKSPACE, IDEA, ANA, [ANA])).rejects.toThrow("Only admins can assign ideas.");
    expect(written.inserted).toEqual([]);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("refuses someone who is not in the workspace", async () => {
    const { client, written } = fakeSupabase({ members: [ANA], assigned: [] });
    await expect(setIdeaAssignees(client, WORKSPACE, IDEA, ADMIN, [ANA, STRANGER])).rejects.toThrow(/in this workspace/);
    expect(written.inserted).toEqual([]);
  });

  it("assigns several people, records who did it, and notifies each of them", async () => {
    const { client, written } = fakeSupabase({ members: [ANA, BEN], assigned: [] });
    const result = await setIdeaAssignees(client, WORKSPACE, IDEA, ADMIN, [ANA, BEN], { ideaTitle: "Carousel on onboarding" });
    expect(written.inserted).toEqual([
      { idea_id: IDEA, user_id: ANA, workspace_id: WORKSPACE, assigned_by: ADMIN },
      { idea_id: IDEA, user_id: BEN, workspace_id: WORKSPACE, assigned_by: ADMIN },
    ]);
    expect(result.added).toEqual([ANA, BEN]);
    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ANA, type: "content_idea_assigned", message: expect.stringContaining("Carousel on onboarding") }),
    );
    expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "content_idea.assigned", actorId: ADMIN }));
  });

  it("changes the list: adds the new person, takes off the one left out, and notifies only the new one", async () => {
    const { client, written } = fakeSupabase({ members: [ANA, BEN, CAL], assigned: [ANA, BEN] });
    const result = await setIdeaAssignees(client, WORKSPACE, IDEA, ADMIN, [BEN, CAL]);
    expect(written.inserted.map((row) => row.user_id)).toEqual([CAL]);
    expect(written.deleted).toEqual([ANA]);
    expect(result).toEqual({ added: [CAL], removed: [ANA] });
    expect(vi.mocked(createNotification).mock.calls.map(([input]) => input.userId)).toEqual([CAL]);
  });

  it("emails each newly assigned person, saying who assigned them and linking to the idea", async () => {
    const { client } = fakeSupabase({ members: [ANA, BEN], assigned: [] });
    await setIdeaAssignees(client, WORKSPACE, IDEA, ADMIN, [ANA, BEN], { ideaTitle: "Carousel on onboarding" });
    expect(sendContentIdeaAssignedEmail).toHaveBeenCalledTimes(2);
    expect(sendContentIdeaAssignedEmail).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        to: "ana@buildablelabs.com",
        assigneeName: "Ana",
        assignerName: "Akhil",
        ideaTitle: "Carousel on onboarding",
        url: expect.stringContaining(`/tools/content-board?idea=${IDEA}`),
        workspaceId: WORKSPACE,
      }),
    );
  });

  it("does not email the admin about assigning themselves", async () => {
    const { client } = fakeSupabase({ members: [ADMIN, ANA], assigned: [] });
    await setIdeaAssignees(client, WORKSPACE, IDEA, ADMIN, [ADMIN, ANA]);
    expect(vi.mocked(sendContentIdeaAssignedEmail).mock.calls.map(([, input]) => input.to)).toEqual(["ana@buildablelabs.com"]);
  });

  it("does not notify the admin about assigning themselves", async () => {
    const { client } = fakeSupabase({ members: [ADMIN, ANA], assigned: [] });
    await setIdeaAssignees(client, WORKSPACE, IDEA, ADMIN, [ADMIN, ANA]);
    expect(vi.mocked(createNotification).mock.calls.map(([input]) => input.userId)).toEqual([ANA]);
  });

  it("can clear everyone", async () => {
    const { client, written } = fakeSupabase({ members: [ANA], assigned: [ANA] });
    expect(await setIdeaAssignees(client, WORKSPACE, IDEA, ADMIN, [])).toEqual({ added: [], removed: [ANA] });
    expect(written.deleted).toEqual([ANA]);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("writes and notifies nothing when nothing changed", async () => {
    const { client, written } = fakeSupabase({ members: [ANA], assigned: [ANA] });
    await setIdeaAssignees(client, WORKSPACE, IDEA, ADMIN, [ANA]);
    expect(written.inserted).toEqual([]);
    expect(written.deleted).toEqual([]);
    expect(writeAuditLog).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("keeps the assignment even if a notification cannot be sent", async () => {
    vi.mocked(createNotification).mockRejectedValue(new Error("email down"));
    const { client, written } = fakeSupabase({ members: [ANA], assigned: [] });
    await expect(setIdeaAssignees(client, WORKSPACE, IDEA, ADMIN, [ANA])).resolves.toMatchObject({ added: [ANA] });
    expect(written.inserted).toHaveLength(1);
  });
});

describe("assignee rules", () => {
  it("drops blanks and repeats, and rejects values that are not people", () => {
    expect(assigneeIdsSchema.parse([ANA, " ", ANA, BEN])).toEqual([ANA, BEN]);
    expect(assigneeIdsSchema.safeParse(["not-a-person"]).success).toBe(false);
  });

  it("limits how many people one idea can have", () => {
    const many = Array.from({ length: MAX_ASSIGNEES + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(assigneeIdsSchema.safeParse(many).success).toBe(false);
    expect(assigneeIdsSchema.safeParse(many.slice(0, MAX_ASSIGNEES)).success).toBe(true);
  });

  it("works out who was added and who was removed", () => {
    expect(diffAssignees(["a", "b"], ["b", "c"])).toEqual({ add: ["c"], remove: ["a"] });
    expect(diffAssignees([], ["a"])).toEqual({ add: ["a"], remove: [] });
    expect(diffAssignees(["a"], [])).toEqual({ add: [], remove: ["a"] });
  });

  it("turns workspace members into name and id options", () => {
    expect(
      toMemberOptions([
        { user_id: "1", profiles: { full_name: "Ana Rao", email: "ana@x.com" } },
        { user_id: "2", profiles: [{ full_name: null, email: "ben@x.com" }] },
        { user_id: "3", profiles: null },
      ]),
    ).toEqual([
      { id: "1", label: "Ana Rao", email: "ana@x.com" },
      { id: "2", label: "ben@x.com", email: "ben@x.com" },
      { id: "3", label: "Unknown", email: undefined },
    ]);
  });
});

describe("orderAssignees", () => {
  const people = [
    { label: "Vatsal Bhatt", email: "vatsal@buildablelabs.com" },
    { label: "Mridul", email: "mridul@buildablelabs.com" },
    { label: "Aditi Chourasia", email: "aditi@buildablelabs.com" },
    { label: "Pavan Shelat", email: "pavan@buildablelabs.com" },
    { label: "Ananya", email: "Ananya@BuildableLabs.com" },
    { label: "Akhil Alampally", email: "akhil@buildablelabs.com" },
    { label: "Ankitha Shivva", email: "ankitha@buildablelabs.com" },
    { label: "No email person" },
  ];

  it("puts the four usual people first, in the agreed order", () => {
    expect(orderAssignees(people).frequent.map((person) => person.label)).toEqual(["Ananya", "Ankitha Shivva", "Pavan Shelat", "Mridul"]);
  });

  it("lists everyone else alphabetically after them", () => {
    expect(orderAssignees(people).others.map((person) => person.label)).toEqual([
      "Aditi Chourasia",
      "Akhil Alampally",
      "No email person",
      "Vatsal Bhatt",
    ]);
  });

  it("shows only the people who exist, and works with an empty team", () => {
    expect(orderAssignees([{ label: "Mridul", email: "mridul@buildablelabs.com" }]).frequent).toHaveLength(1);
    expect(orderAssignees([])).toEqual({ frequent: [], others: [] });
  });
});
