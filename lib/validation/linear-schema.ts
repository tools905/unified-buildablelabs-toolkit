import { z } from "zod";

export const linkLinearIssueSchema = z.object({
  ticketId: z.string().uuid(),
  linearIssueId: z.string().min(1),
});
export type LinkLinearIssueInput = z.infer<typeof linkLinearIssueSchema>;

export const unlinkLinearIssueSchema = z.object({
  ticketId: z.string().uuid(),
});
export type UnlinkLinearIssueInput = z.infer<typeof unlinkLinearIssueSchema>;

export const linearSettingsSchema = z.object({
  linearTeamIds: z.array(z.string().min(1)).default([]),
  suggestThreshold: z.coerce.number().min(0).max(1).default(0.5),
});
export type LinearSettingsInput = z.infer<typeof linearSettingsSchema>;
