import { describe, expect, it } from "vitest";
import {
  calculateRoleWeightedScore,
  defaultWeights,
  getRoleWeights,
  normalizeWeightsForAvailableRatings,
} from "@/lib/services/scoring-service";

const ratings = {
  communication: 4,
  reliability: 3,
  ownership: 4,
  executionQuality: 3,
  collaboration: 4,
  technicalQuality: 5,
  problemSolving: 5,
  leadership: 3,
  systemDesign: 5,
  learningGrowth: 3,
};

describe("scoring service", () => {
  it("uses intern and system designer weights", () => {
    expect(getRoleWeights("Intern").learningGrowth).toBe(0.18);
    expect(getRoleWeights("System Designer").systemDesign).toBe(0.25);
  });

  it("uses default weights for unknown roles", () => {
    expect(getRoleWeights("Astronaut")).toEqual(defaultWeights);
  });

  it("keeps weighted score on a 1-5 scale and calculates percentage", () => {
    const result = calculateRoleWeightedScore(ratings, "System Designer");
    expect(result.weightedScore).toBeGreaterThanOrEqual(1);
    expect(result.weightedScore).toBeLessThanOrEqual(5);
    expect(result.scorePercentage).toBe(Math.round((result.weightedScore / 5) * 100));
  });

  it("does not count missing categories as zero and re-normalizes weights", () => {
    const normalized = normalizeWeightsForAvailableRatings(getRoleWeights("Intern"), {
      ...ratings,
      systemDesign: null,
    });
    expect(normalized.systemDesign).toBe(0);
    expect(Object.values(normalized).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
  });

  it("allows same raw ratings to produce different role-weighted scores", () => {
    const intern = calculateRoleWeightedScore(ratings, "Intern");
    const designer = calculateRoleWeightedScore(ratings, "System Designer");
    expect(intern.weightedScore).not.toBe(designer.weightedScore);
  });
});
