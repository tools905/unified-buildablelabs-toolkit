import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const DUMMY_PASSWORD = "TestReview123!";

export type DummyMember = {
  email: string;
  password: string;
  fullName: string;
};

function assertDevTestingEnabled() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ALLOW_SMALL_TEST_TEAMS !== "true"
  ) {
    throw new Error("Dummy member tools are only available in local testing.");
  }
}

async function findUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  let page = 1;
  const perPage = 100;

  while (page < 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
    );
    if (user) return user;
    if (data.users.length < perPage) return null;
    page += 1;
  }

  return null;
}

export async function seedDummyWorkspaceMembers(workspaceId: string) {
  assertDevTestingEnabled();

  const admin = createAdminClient();
  const prefix = workspaceId.slice(0, 8);
  const dummies: DummyMember[] = [
    {
      fullName: "Dummy Reviewer One",
      email: `dummy.reviewer.1.${prefix}@peer-review.test`,
      password: DUMMY_PASSWORD,
    },
    {
      fullName: "Dummy Reviewer Two",
      email: `dummy.reviewer.2.${prefix}@peer-review.test`,
      password: DUMMY_PASSWORD,
    },
  ];

  for (const dummy of dummies) {
    const existing = await findUserByEmail(admin, dummy.email);
    const userResult = existing
      ? await admin.auth.admin.updateUserById(existing.id, {
          password: dummy.password,
          email_confirm: true,
          user_metadata: { full_name: dummy.fullName },
        })
      : await admin.auth.admin.createUser({
          email: dummy.email,
          password: dummy.password,
          email_confirm: true,
          user_metadata: { full_name: dummy.fullName },
        });

    if (userResult.error) throw userResult.error;
    const userId = userResult.data.user.id;

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        email: dummy.email,
        full_name: dummy.fullName,
      },
      { onConflict: "id" },
    );
    if (profileError) throw profileError;

    const { error: memberError } = await admin.from("workspace_members").upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        role: "member",
        status: "active",
      },
      { onConflict: "workspace_id,user_id" },
    );
    if (memberError) throw memberError;
  }

  return dummies;
}

export function isDevTestingEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_SMALL_TEST_TEAMS === "true"
  );
}
