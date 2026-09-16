"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Zod's default Error.message is the issues array JSON-stringified, not a
// sentence — pull the first issue's message out when that's what we got.
function friendlyMessage(error: Error) {
  try {
    const issues = JSON.parse(error.message);
    if (Array.isArray(issues) && issues[0]?.message) return issues[0].message as string;
  } catch {
    // Not a Zod error — fall through to the raw message.
  }
  return error.message || "That action couldn't be completed. Check your input and try again.";
}

export default function LinkedInAssessorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>{friendlyMessage(error)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={reset}>Try again</Button>
        </CardContent>
      </Card>
    </div>
  );
}
