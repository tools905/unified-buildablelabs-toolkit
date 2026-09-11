"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateRoadmapDialog } from "@/components/resources/create-roadmap-dialog";
import { QaHistory } from "@/components/resources/qa-history";
import { QaSession } from "@/components/resources/qa-session";
import { startQaAttemptAction } from "@/app/tools/resources/qa-actions";
import type { QaAttemptPublic } from "@/lib/services/qa-service";

type Roadmap = { id: string; name: string; description: string | null };
type QaHistoryAttempt = {
  id: string;
  status: string;
  score: number | null;
  total_questions: number;
  completed_at: string | null;
  created_at: string;
};

export function QaTopicPicker({
  roadmaps,
  historyByRoadmapId,
  isAdmin,
}: {
  roadmaps: Roadmap[];
  historyByRoadmapId: Record<string, QaHistoryAttempt[]>;
  isAdmin: boolean;
}) {
  const [attempt, setAttempt] = useState<QaAttemptPublic | null>(null);
  const [pendingRoadmapId, setPendingRoadmapId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleStart(roadmapId: string) {
    setError(null);
    setPendingRoadmapId(roadmapId);
    startTransition(async () => {
      try {
        const result = await startQaAttemptAction(roadmapId);
        setAttempt(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start this Q&A session.");
      } finally {
        setPendingRoadmapId(null);
      }
    });
  }

  if (attempt) {
    return <QaSession initialAttempt={attempt} onExit={() => setAttempt(null)} />;
  }

  if (roadmaps.length === 0) {
    return (
      <div className="text-center">
        <p className="mb-4 text-muted-foreground">
          {isAdmin
            ? "No topics yet — add one below to let the team start a Q&A session."
            : "No topics yet — ask a workspace admin to add one."}
        </p>
        {isAdmin ? <CreateRoadmapDialog /> : null}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Pick a topic to start a 6-question adaptive Q&amp;A session.</p>
        {isAdmin ? <CreateRoadmapDialog /> : null}
      </div>
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {roadmaps.map((roadmap) => (
          <Card key={roadmap.id} className="flex h-full flex-col">
            <CardHeader>
              <CardTitle className="text-base">{roadmap.name}</CardTitle>
              {roadmap.description ? <CardDescription>{roadmap.description}</CardDescription> : null}
            </CardHeader>
            <CardContent className="mt-auto">
              <Button onClick={() => handleStart(roadmap.id)} disabled={isPending && pendingRoadmapId === roadmap.id}>
                {isPending && pendingRoadmapId === roadmap.id ? "Starting…" : "Start Q&A"}
              </Button>
              <QaHistory attempts={historyByRoadmapId[roadmap.id] ?? []} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
