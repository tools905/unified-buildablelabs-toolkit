import { describe, expect, it } from "vitest";
import { contactsFromText, daysUntilPurge, initials, normalizeUrl, storageName } from "@/lib/utils/talent";
import { applicationSchema, candidateSchema } from "@/lib/validation/talent-schema";

describe("Talent Bank", () => {
  it("reads contact details from a resume's text", () => {
    const text = "Priya Nair\nBengaluru · priya.NAIR@gmail.com · +91 98765 43210\nlinkedin.com/in/priya-nair\nExperience 2019 - 2024";
    expect(contactsFromText(text)).toEqual({ email: "priya.nair@gmail.com", phone: "+91 98765 43210", linkedin_url: "https://linkedin.com/in/priya-nair" });
    expect(contactsFromText("No contact here, 2019-2024").phone).toBeNull();
  });

  it("keeps rejected people 60 days", () => {
    expect(daysUntilPurge("2026-11-15T10:00:00Z", new Date("2026-11-15T10:00:00Z"))).toBe(60);
    expect(daysUntilPurge("2026-09-01T10:00:00Z", new Date("2026-11-15T10:00:00Z"))).toBe(0);
  });

  it("tidies names, links and file names", () => {
    expect(initials("Priya  Nair")).toBe("PN");
    expect(normalizeUrl("behance.net/priya/")).toBe("https://behance.net/priya");
    expect(normalizeUrl("not a link")).toBeNull();
    expect(storageName("My Résumé (final).PDF")).toBe("my-r-sum-final.pdf");
  });

  it("needs only a name from an admin, and name, email and consent from the form", () => {
    expect(candidateSchema.safeParse({ fullName: "Priya" }).success).toBe(true);
    expect(candidateSchema.safeParse({ fullName: " " }).success).toBe(false);
    const parsed = candidateSchema.parse({ fullName: "Priya", email: "", links: ["github.com/p", "github.com/p", "nope"] });
    expect(parsed.email).toBeNull();
    expect(parsed.links).toEqual(["https://github.com/p"]);
    expect(applicationSchema.safeParse({ fullName: "Priya", email: "p@x.com", consent: false }).success).toBe(false);
    expect(applicationSchema.safeParse({ fullName: "Priya", email: "p@x.com", consent: true }).success).toBe(true);
  });
});
