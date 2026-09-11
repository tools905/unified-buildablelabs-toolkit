import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStructuredAnalysis } from "@/modules/shared/ai";
import { writeAuditLog } from "@/lib/services/audit-service";
import { listResources } from "@/lib/services/resource-service";
import {
  QA_TOTAL_QUESTIONS,
  qaFinalSummarySchema,
  qaGeneratedTurnSchema,
  type QaGeneratedTurn,
} from "@/lib/validation/qa-schema";

type QaOptionId = "A" | "B" | "C" | "D";

export type QaTurnRecord = {
  turnNumber: number;
  question: string;
  options: { id: QaOptionId; text: string }[];
  isChallenge: boolean;
  correctOptionId: QaOptionId;
  selectedOptionId: QaOptionId | null;
  isCorrect: boolean | null;
  answeredAt: string | null;
};

export type QaTurnPublic = Omit<QaTurnRecord, "correctOptionId"> & { correctOptionId?: QaOptionId };

export type QaAttemptPublic = {
  id: string;
  roadmapId: string;
  status: "in_progress" | "completed";
  totalQuestions: number;
  turns: QaTurnPublic[];
  score: number | null;
  summary: { improvementSteps: string[] } | null;
};

type RoadmapContext = {
  roadmapName: string;
  roadmapDescription: string | null;
  resources: { title: string; description: string | null; category: string }[];
};

function omitCorrectOptionId(turn: QaTurnRecord): QaTurnPublic {
  return {
    turnNumber: turn.turnNumber,
    question: turn.question,
    options: turn.options,
    isChallenge: turn.isChallenge,
    selectedOptionId: turn.selectedOptionId,
    isCorrect: turn.isCorrect,
    answeredAt: turn.answeredAt,
  };
}

function toPublicAttempt(row: any): QaAttemptPublic {
  const turns: QaTurnRecord[] = row.turns ?? [];
  return {
    id: row.id,
    roadmapId: row.roadmap_id,
    status: row.status,
    totalQuestions: row.total_questions,
    // Never leak the answer key for a question that hasn't been answered yet.
    turns: turns.map((turn) => (turn.selectedOptionId === null ? omitCorrectOptionId(turn) : turn)),
    score: row.score,
    summary: row.summary,
  };
}

function gradeTurn(turn: QaTurnRecord, selectedOptionId: QaOptionId): QaTurnRecord {
  return {
    ...turn,
    selectedOptionId,
    isCorrect: selectedOptionId === turn.correctOptionId,
    answeredAt: new Date().toISOString(),
  };
}

function computeScore(turns: QaTurnRecord[]) {
  return turns.filter((turn) => turn.isCorrect).length;
}

async function buildRoadmapContext(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  roadmapId: string,
): Promise<RoadmapContext> {
  const [{ data: roadmap, error: roadmapError }, resources] = await Promise.all([
    supabase.from("learning_roadmaps").select("id, name, description").eq("id", roadmapId).single(),
    listResources(supabase, workspaceId, { roadmapId }),
  ]);
  if (roadmapError) throw roadmapError;

  return {
    roadmapName: roadmap.name,
    roadmapDescription: roadmap.description ?? null,
    resources: (resources as any[]).map((resource) => ({
      title: resource.title,
      description: resource.description ?? null,
      category: resource.category,
    })),
  };
}

function summarizeTurnForPrompt(turn: QaTurnRecord) {
  return {
    turnNumber: turn.turnNumber,
    question: turn.question,
    wasChallenge: turn.isChallenge,
    yourAnswer: turn.options.find((option) => option.id === turn.selectedOptionId)?.text ?? null,
    correctAnswer: turn.options.find((option) => option.id === turn.correctOptionId)?.text ?? null,
    wasCorrect: turn.isCorrect,
  };
}

export async function generateQaTurn(input: {
  roadmapContext: RoadmapContext;
  priorTurns: QaTurnRecord[];
  turnNumber: number;
}): Promise<QaGeneratedTurn | null> {
  const history = input.priorTurns.map(summarizeTurnForPrompt);
  const lastTurn = history[history.length - 1];

  const instructions =
    history.length === 0
      ? "This is the opening question: ask a foundational, basic question about the roadmap's core topic."
      : lastTurn.wasCorrect
        ? "The user just answered correctly. About half the time, set isChallenge=true and probe deeper on the SAME concept with a trickier edge case or a plausible-but-wrong claim to see if their understanding really holds up, instead of moving to a brand new topic. Otherwise ask a new, slightly harder question."
        : "The user just answered incorrectly. Ask a slightly simpler, clarifying question on the SAME concept to check whether they can recover, rather than piling on a harder or unrelated question.";

  try {
    const result = await generateStructuredAnalysis<QaGeneratedTurn>({
      system:
        "You are an internal upskilling quizmaster running a live, adaptive multiple-choice interview on a specific learning roadmap, in the probing style of a tough technical interviewer: you don't just move on after a correct answer, you sometimes push back with an edge case or a plausible complication to test whether the person truly understands the concept, not just recalls the term. Return JSON only. Every turn — including a challenge — must be a well-formed 4-option multiple-choice question with exactly one correct option. Base every question strictly on the given roadmap context; do not invent unrelated topics.",
      user: {
        roadmap: input.roadmapContext,
        turnNumber: input.turnNumber,
        totalQuestions: QA_TOTAL_QUESTIONS,
        priorTurns: history,
        instructions,
        outputShape: {
          question: "string",
          options: [{ id: "A|B|C|D", text: "string" }],
          correctOptionId: "A|B|C|D — must match one of the option ids",
          isChallenge: "boolean — true only if this question is a probing follow-up on the same concept as the previous one",
        },
      },
      temperature: 0.4,
    });
    if (!result) return null;
    return qaGeneratedTurnSchema.parse(result.data);
  } catch {
    return null;
  }
}

async function generateImprovementSteps(turns: QaTurnRecord[]): Promise<string[]> {
  try {
    const result = await generateStructuredAnalysis<{ improvementSteps: string[] }>({
      system:
        "You write a short, specific list of actionable improvement steps for someone who just finished an adaptive multiple-choice quiz on an internal learning roadmap. Return JSON only. Be concrete — reference the actual concepts they got wrong or were challenged on, not generic study advice.",
      user: {
        turns: turns.map(summarizeTurnForPrompt),
        outputShape: { improvementSteps: ["string", "..."] },
      },
      temperature: 0.3,
    });
    if (!result) throw new Error("No AI provider configured.");
    return qaFinalSummarySchema.parse(result.data).improvementSteps;
  } catch {
    return ["Review the roadmap's resources again, focusing on the questions you missed or were challenged on."];
  }
}

export async function startQaAttempt(
  supabase: SupabaseClient<any>,
  workspaceId: string,
  userId: string,
  roadmapId: string,
): Promise<QaAttemptPublic> {
  const { data: existing, error: existingError } = await supabase
    .from("qa_attempts")
    .select("*")
    .eq("user_id", userId)
    .eq("roadmap_id", roadmapId)
    .eq("status", "in_progress")
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return toPublicAttempt(existing);

  const roadmapContext = await buildRoadmapContext(supabase, workspaceId, roadmapId);
  const generated = await generateQaTurn({ roadmapContext, priorTurns: [], turnNumber: 1 });
  if (!generated) throw new Error("Could not generate a question right now. Try again shortly.");

  const turns: QaTurnRecord[] = [
    {
      turnNumber: 1,
      question: generated.question,
      options: generated.options,
      isChallenge: generated.isChallenge,
      correctOptionId: generated.correctOptionId,
      selectedOptionId: null,
      isCorrect: null,
      answeredAt: null,
    },
  ];

  const { data: attempt, error } = await supabase
    .from("qa_attempts")
    .insert({
      workspace_id: workspaceId,
      roadmap_id: roadmapId,
      user_id: userId,
      status: "in_progress",
      total_questions: QA_TOTAL_QUESTIONS,
      turns,
    })
    .select()
    .single();
  if (error) throw error;

  await writeAuditLog(supabase, {
    workspaceId,
    actorId: userId,
    action: "qa_attempt.started",
    entityType: "qa_attempt",
    entityId: attempt.id,
    metadata: { roadmapId },
  });

  return toPublicAttempt(attempt);
}

export async function submitQaAnswer(
  supabase: SupabaseClient<any>,
  userId: string,
  attemptId: string,
  selectedOptionId: QaOptionId,
): Promise<QaAttemptPublic> {
  const { data: attemptRow, error } = await supabase
    .from("qa_attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  if (attemptRow.status !== "in_progress") throw new Error("This Q&A session is already completed.");

  const turns: QaTurnRecord[] = attemptRow.turns ?? [];
  const pendingIndex = turns.findIndex((turn) => turn.selectedOptionId === null);
  if (pendingIndex === -1) throw new Error("No pending question on this attempt.");

  const nextTurns = [...turns];
  nextTurns[pendingIndex] = gradeTurn(turns[pendingIndex], selectedOptionId);

  const answeredCount = nextTurns.filter((turn) => turn.selectedOptionId !== null).length;

  if (answeredCount < QA_TOTAL_QUESTIONS) {
    const roadmapContext = await buildRoadmapContext(supabase, attemptRow.workspace_id, attemptRow.roadmap_id);
    const generated = await generateQaTurn({
      roadmapContext,
      priorTurns: nextTurns,
      turnNumber: answeredCount + 1,
    });
    if (!generated) throw new Error("Could not generate the next question right now. Try again shortly.");

    nextTurns.push({
      turnNumber: answeredCount + 1,
      question: generated.question,
      options: generated.options,
      isChallenge: generated.isChallenge,
      correctOptionId: generated.correctOptionId,
      selectedOptionId: null,
      isCorrect: null,
      answeredAt: null,
    });

    const { data: updated, error: updateError } = await supabase
      .from("qa_attempts")
      .update({ turns: nextTurns })
      .eq("id", attemptId)
      .select()
      .single();
    if (updateError) throw updateError;
    return toPublicAttempt(updated);
  }

  const score = computeScore(nextTurns);
  const improvementSteps = await generateImprovementSteps(nextTurns);

  const { data: completed, error: completeError } = await supabase
    .from("qa_attempts")
    .update({
      turns: nextTurns,
      status: "completed",
      score,
      summary: { improvementSteps },
      completed_at: new Date().toISOString(),
    })
    .eq("id", attemptId)
    .select()
    .single();
  if (completeError) throw completeError;

  await writeAuditLog(supabase, {
    workspaceId: attemptRow.workspace_id,
    actorId: userId,
    action: "qa_attempt.completed",
    entityType: "qa_attempt",
    entityId: attemptId,
    metadata: { score, totalQuestions: QA_TOTAL_QUESTIONS },
  });

  return toPublicAttempt(completed);
}

export async function getQaAttempt(supabase: SupabaseClient<any>, userId: string, attemptId: string) {
  const { data, error } = await supabase
    .from("qa_attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return toPublicAttempt(data);
}

export async function listQaAttemptsForUser(supabase: SupabaseClient<any>, userId: string, roadmapId: string) {
  const { data, error } = await supabase
    .from("qa_attempts")
    .select("id, status, score, total_questions, completed_at, created_at")
    .eq("user_id", userId)
    .eq("roadmap_id", roadmapId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export { computeScore };
