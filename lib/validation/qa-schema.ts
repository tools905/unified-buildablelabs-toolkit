import { z } from "zod";

export const QA_OPTION_IDS = ["A", "B", "C", "D"] as const;
export const QA_TOTAL_QUESTIONS = 6;

export const qaOptionSchema = z.object({
  id: z.enum(QA_OPTION_IDS),
  text: z.string().min(1),
});

export const qaGeneratedTurnSchema = z
  .object({
    question: z.string().min(10),
    options: z.array(qaOptionSchema).length(4),
    correctOptionId: z.enum(QA_OPTION_IDS),
    isChallenge: z.boolean(),
  })
  .superRefine((turn, context) => {
    const ids = turn.options.map((option) => option.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", path: ["options"], message: "Option ids must be unique." });
    }
    if (!ids.includes(turn.correctOptionId)) {
      context.addIssue({
        code: "custom",
        path: ["correctOptionId"],
        message: "correctOptionId must match one of the option ids.",
      });
    }
  });

export type QaGeneratedTurn = z.infer<typeof qaGeneratedTurnSchema>;

export const qaFinalSummarySchema = z.object({
  improvementSteps: z.array(z.string().min(1)).min(1),
});

export type QaFinalSummary = z.infer<typeof qaFinalSummarySchema>;

export const startQaAttemptSchema = z.object({
  roadmapId: z.string().uuid(),
});

export const submitQaAnswerSchema = z.object({
  attemptId: z.string().uuid(),
  selectedOptionId: z.enum(QA_OPTION_IDS),
});
