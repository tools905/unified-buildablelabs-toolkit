export type RatingCategory =
  | "communication"
  | "reliability"
  | "ownership"
  | "executionQuality"
  | "collaboration"
  | "technicalQuality"
  | "problemSolving"
  | "leadership"
  | "systemDesign"
  | "learningGrowth";

export type RatingMap = Partial<Record<RatingCategory, number | null>>;
export type WeightMap = Record<RatingCategory, number>;

export const defaultWeights: WeightMap = {
  communication: 0.12,
  reliability: 0.12,
  ownership: 0.12,
  executionQuality: 0.14,
  collaboration: 0.12,
  technicalQuality: 0.12,
  problemSolving: 0.1,
  leadership: 0.06,
  systemDesign: 0.06,
  learningGrowth: 0.04,
};

const roleWeights: Record<string, WeightMap> = {
  intern: {
    communication: 0.15,
    reliability: 0.15,
    ownership: 0.1,
    executionQuality: 0.15,
    collaboration: 0.15,
    technicalQuality: 0.08,
    problemSolving: 0.06,
    leadership: 0.03,
    systemDesign: 0.05,
    learningGrowth: 0.18,
  },
  "system designer": {
    communication: 0.12,
    reliability: 0.08,
    ownership: 0.12,
    executionQuality: 0.1,
    collaboration: 0.1,
    technicalQuality: 0.15,
    problemSolving: 0.15,
    leadership: 0.02,
    systemDesign: 0.25,
    learningGrowth: 0.01,
  },
  developer: {
    communication: 0.1,
    reliability: 0.1,
    ownership: 0.13,
    executionQuality: 0.15,
    collaboration: 0.1,
    technicalQuality: 0.17,
    problemSolving: 0.14,
    leadership: 0.03,
    systemDesign: 0.05,
    learningGrowth: 0.03,
  },
  manager: {
    communication: 0.18,
    reliability: 0.12,
    ownership: 0.16,
    executionQuality: 0.1,
    collaboration: 0.14,
    technicalQuality: 0.05,
    problemSolving: 0.1,
    leadership: 0.12,
    systemDesign: 0.01,
    learningGrowth: 0.02,
  },
};

export const ratingCategories: RatingCategory[] = [
  "communication",
  "reliability",
  "ownership",
  "executionQuality",
  "collaboration",
  "technicalQuality",
  "problemSolving",
  "leadership",
  "systemDesign",
  "learningGrowth",
];

export function getRoleWeights(roleLabel?: string | null): WeightMap {
  if (!roleLabel) return defaultWeights;
  const normalizedLabel = roleLabel.trim().toLowerCase();
  
  // Exact match
  if (roleWeights[normalizedLabel]) {
    return roleWeights[normalizedLabel];
  }
  
  // Heuristic substring matches
  if (normalizedLabel.includes("intern")) {
    return roleWeights["intern"];
  }
  if (normalizedLabel.includes("designer") || normalizedLabel.includes("architect")) {
    return roleWeights["system designer"];
  }
  if (normalizedLabel.includes("manager") || normalizedLabel.includes("lead")) {
    return roleWeights["manager"];
  }
  if (
    normalizedLabel.includes("developer") ||
    normalizedLabel.includes("engineer") ||
    normalizedLabel.includes("programmer")
  ) {
    return roleWeights["developer"];
  }

  return defaultWeights;
}

export function normalizeWeightMap(
  weights: Partial<Record<RatingCategory, number>>,
): WeightMap {
  const sanitized = ratingCategories.reduce((acc, category) => {
    const value = weights[category];
    acc[category] =
      typeof value === "number" && Number.isFinite(value) && value > 0
        ? value
        : 0;
    return acc;
  }, {} as WeightMap);

  const total = ratingCategories.reduce(
    (sum, category) => sum + sanitized[category],
    0,
  );

  if (total <= 0) return defaultWeights;

  return ratingCategories.reduce((acc, category) => {
    acc[category] = sanitized[category] / total;
    return acc;
  }, {} as WeightMap);
}

export function normalizeWeightsForAvailableRatings(
  weights: WeightMap,
  ratings: RatingMap,
): WeightMap {
  const available = ratingCategories.filter((category) => {
    const value = ratings[category];
    return typeof value === "number" && Number.isFinite(value);
  });

  if (available.length === 0) return defaultWeights;

  const total = available.reduce((sum, category) => sum + weights[category], 0);

  return ratingCategories.reduce((acc, category) => {
    acc[category] = available.includes(category)
      ? weights[category] / total
      : 0;
    return acc;
  }, {} as WeightMap);
}

export function calculateRoleWeightedScore(
  ratings: RatingMap,
  roleLabel?: string | null,
  weightOverride?: WeightMap,
) {
  const normalizedWeights = normalizeWeightsForAvailableRatings(
    weightOverride ?? getRoleWeights(roleLabel),
    ratings,
  );

  const weightedScore = ratingCategories.reduce((sum, category) => {
    const rating = ratings[category];
    if (typeof rating !== "number") return sum;
    return sum + rating * normalizedWeights[category];
  }, 0);

  return {
    weightedScore: Number(weightedScore.toFixed(2)),
    scorePercentage: Number(((weightedScore / 5) * 100).toFixed(0)),
    roleWeights: normalizedWeights,
  };
}

export function calculateRawCategoryAverages(responses: RatingMap[]): RatingMap {
  return ratingCategories.reduce((acc, category) => {
    const values = responses
      .map((response) => response[category])
      .filter((value): value is number => typeof value === "number");
    acc[category] =
      values.length === 0
        ? null
        : Number(
            (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2),
          );
    return acc;
  }, {} as RatingMap);
}

export function highestWeightedCategories(weights: WeightMap, count = 4) {
  return ratingCategories
    .map((category) => ({ category, weight: weights[category] }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count);
}
