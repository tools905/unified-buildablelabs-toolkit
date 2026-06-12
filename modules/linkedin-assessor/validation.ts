import { z } from "zod";
import { linkedinConnectors, linkedinMemberRoles } from "./types";

export function normalizeLinkedInProfileUrl(input: string) {
  const trimmed = input.trim();
  const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  if (!["http:", "https:"].includes(url.protocol) || host !== "linkedin.com" || parts[0] !== "in" || !parts[1]) {
    throw new Error("Use a LinkedIn profile URL such as linkedin.com/in/profile.");
  }
  return `https://www.linkedin.com/in/${parts[1]}/`;
}

export const linkedinTrackedMemberSchema = z
  .object({
    name: z.string().trim().min(1),
    email: z.string().trim().email().optional().or(z.literal("")),
    profileId: z.string().uuid().optional().or(z.literal("")),
    memberRole: z.enum(linkedinMemberRoles),
    linkedinProfileUrl: z.string().min(1).transform(normalizeLinkedInProfileUrl),
    monthlyPostTarget: z.coerce.number().int().min(1).max(100),
    volumeWeight: z.coerce.number().min(0).max(1),
    qualityWeight: z.coerce.number().min(0).max(1),
    connectorPreference: z.enum(linkedinConnectors),
  })
  .refine((value) => Math.abs(value.volumeWeight + value.qualityWeight - 1) < 0.001, {
    message: "Volume and quality weights must total 1.",
    path: ["qualityWeight"],
  });

export const linkedinWindowSchema = z
  .object({
    name: z.string().trim().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((value) => value.endDate > value.startDate, {
    message: "End date must be after start date.",
    path: ["endDate"],
  });

export const linkedinSettingsSchema = z
  .object({
    monthlyPostTarget: z.coerce.number().int().min(1).max(100),
    volumeWeight: z.coerce.number().min(0).max(1),
    qualityWeight: z.coerce.number().min(0).max(1),
    connectorPreference: z.enum(linkedinConnectors),
    weeklyReportsEnabled: z.coerce.boolean(),
    memberInsightsEnabled: z.coerce.boolean(),
  })
  .refine((value) => Math.abs(value.volumeWeight + value.qualityWeight - 1) < 0.001, {
    message: "Volume and quality weights must total 1.",
    path: ["qualityWeight"],
  });
