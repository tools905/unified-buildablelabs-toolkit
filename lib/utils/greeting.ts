// The greeting at the top of every page ("Hi Aditi", "Any interesting ideas, Aditi?"). Each person gets
// one line a day, changing at midnight India time, and different people see different lines on the
// same day. The same line shows on every page all day, so it reads as one greeting, not noise.

const LINES = [
  "Hi {name}",
  "Welcome back, {name}",
  "Good to see you, {name}",
  "Any interesting ideas today, {name}?",
  "Let's make something great, {name}",
  "Ready when you are, {name}",
  "Big ideas start small, {name}",
  "What are we building today, {name}?",
  "Hello again, {name}",
  "One great post at a time, {name}",
  "Make it count today, {name}",
  "Your ideas matter, {name}",
  "Nice to have you here, {name}",
  "Let's ship something, {name}",
  "Keep the good work going, {name}",
  "Fresh day, fresh ideas, {name}",
  "Hey {name}, what's next?",
  "Small steps, big results, {name}",
  "Curious minds win, {name}",
  "Let's get creative, {name}",
  "Work hard, have fun, {name}",
  "Today's a good day to post, {name}",
  "Glad you're here, {name}",
  "Share an idea today, {name}?",
  "Let's turn ideas into posts, {name}",
  "You've got this, {name}",
  "Stay curious, {name}",
  "Back at it, {name}",
  "Make today's post the best one, {name}",
  "Great things take shape here, {name}",
] as const;

export const GREETING_LINES: readonly string[] = LINES;

// "Aditi" from "Aditi Chourasia", or from the email address when there's no name.
export function firstName(fullName: string | null | undefined, email: string | null | undefined) {
  const fromName = (fullName ?? "").trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const local = (email ?? "").split("@")[0]?.split(/[._-]/)[0] ?? "";
  return local ? local[0].toUpperCase() + local.slice(1) : "there";
}

// Today's line for this person, split around the name so the page can set the name apart.
export function dailyGreetingParts(userId: string, name: string, now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  let hash = 0;
  for (const char of `${userId}:${day}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const [before, after] = LINES[hash % LINES.length].split("{name}");
  return { before, name, after };
}

export function dailyGreeting(userId: string, name: string, now = new Date()) {
  const { before, after } = dailyGreetingParts(userId, name, now);
  return `${before}${name}${after}`;
}

// "Tuesday · 4 November", India time.
export function todayLabel(now = new Date()) {
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...options }).format(now);
  return `${part({ weekday: "long" })} · ${part({ day: "numeric", month: "long" })}`;
}
