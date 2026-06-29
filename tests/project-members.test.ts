import { describe, expect, it, vi } from "vitest";
import { removeProjectMember, addProjectMember } from "@/lib/services/project-service";

vi.mock("@/lib/services/round-service", () => ({
  completeRoundIfReady: vi.fn().mockResolvedValue(null),
}));

describe("project members management", () => {
  it("fails to remove member if project active members count is at or below minimum", async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === "project_members") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ count: 2, error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    } as any;

    await expect(
      removeProjectMember(mockSupabase, "project-1", "user-1", "actor-1")
    ).rejects.toThrow("Cannot remove member. A project must have at least 2 active members.");
  });

  it("successfully soft-removes project member and deletes active round pending assignments", async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    const mockSelect = vi.fn();

    // Mock query calls
    mockSelect.mockImplementation((fields, options) => {
      if (options?.count === "exact") {
        // Active members count
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
          }),
        };
      }
      return {
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [{ id: "round-1" }], error: null }),
        }),
      };
    });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === "project_members") {
          return {
            select: mockSelect,
            update: mockUpdate,
          };
        }
        if (table === "review_rounds") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [{ id: "round-1" }], error: null }),
              }),
            }),
          };
        }
        if (table === "review_assignments") {
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  neq: vi.fn().mockResolvedValue({ error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "projects") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { workspace_id: "workspace-1" }, error: null }),
              }),
            }),
          };
        }
        if (table === "audit_logs") {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    } as any;

    await expect(
      removeProjectMember(mockSupabase, "project-1", "user-1", "actor-1")
    ).resolves.not.toThrow();

    expect(mockUpdate).toHaveBeenCalledWith({ is_active: false });
  });

  it("successfully adds team member to project", async () => {
    const mockUpsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    mockUpsert.mockResolvedValue({ error: null });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === "project_members") {
          return {
            upsert: mockUpsert,
          };
        }
        if (table === "projects") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { workspace_id: "workspace-1" }, error: null }),
              }),
            }),
          };
        }
        if (table === "audit_logs") {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    } as any;

    await expect(
      addProjectMember(mockSupabase, "project-1", "user-1", "Project Lead", "actor-1")
    ).resolves.not.toThrow();

    expect(mockUpsert).toHaveBeenCalledWith(
      {
        project_id: "project-1",
        user_id: "user-1",
        role_label: "Project Lead",
        is_active: true,
      },
      { onConflict: "project_id,user_id" }
    );
  });
});
