import { z } from "zod";
import { MAX_LINKS, normalizeUrl } from "@/lib/utils/talent";

const optionalText = (max: number) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? null : typeof value === "string" ? value.trim() : value), z.string().max(max).nullable().optional());

const linkList = z
  .array(z.string())
  .default([])
  .transform((values) => [...new Set(values.map((value) => normalizeUrl(value)).filter((value): value is string => Boolean(value)))].slice(0, MAX_LINKS));

// An admin adding or editing a candidate: only the name is needed.
export const candidateSchema = z.object({
  fullName: z.string().trim().min(1, "Add their name.").max(200),
  email: z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? null : value), z.email("That email doesn't look right.").max(200).nullable().optional()),
  phone: optionalText(40),
  role: optionalText(120),
  location: optionalText(120),
  linkedinUrl: optionalText(300).transform((value) => (value ? normalizeUrl(value) : null)),
  source: optionalText(120),
  notes: optionalText(5000),
  links: linkList,
});
export type CandidateInput = z.input<typeof candidateSchema>;

// The public application form: name and email are needed, and agreeing that BuildableLabs keeps the details.
export const applicationSchema = z.object({
  fullName: z.string().trim().min(2, "Tell us your name.").max(200),
  email: z.email("That email doesn't look right.").max(200),
  phone: optionalText(40),
  role: optionalText(120),
  location: optionalText(120),
  linkedinUrl: optionalText(300).transform((value) => (value ? normalizeUrl(value) : null)),
  links: linkList,
  built: optionalText(2000),
  why: optionalText(2000),
  consent: z.literal(true, "Please agree so we can keep your details."),
});
export type ApplicationInput = z.input<typeof applicationSchema>;
