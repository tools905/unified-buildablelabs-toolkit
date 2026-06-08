import { z } from "zod";
import { minimumProjectMembers } from "@/lib/utils/team-size";

export const projectSchema = z
  .object({
    name: z.string().min(2, "Project name must be at least 2 characters."),
    description: z.string().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    cadence: z.enum(["weekly", "biweekly", "final_only", "custom"]),
    reviewDueHours: z.coerce.number().int().min(24).max(168).default(48),
    memberIds: z.array(z.string().uuid()).min(minimumProjectMembers()),
    roleLabels: z.record(z.string().uuid(), z.string().optional()).default({}),
  })
  .refine((input) => input.endDate >= input.startDate, {
    path: ["endDate"],
    message: "End date must be on or after the start date.",
  });

export type ProjectInput = z.infer<typeof projectSchema>;
