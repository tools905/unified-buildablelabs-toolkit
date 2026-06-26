export type AssignmentMember = {
  userId: string;
};

export type GeneratedAssignment = {
  reviewerId: string;
  revieweeId: string;
};

export function generateFullPeerAssignments(
  members: AssignmentMember[],
  options: { allowSmallTeam?: boolean } = {},
): GeneratedAssignment[] {
  const minimumMembers = options.allowSmallTeam ? 1 : 2;
  if (members.length < minimumMembers) {
    throw new Error(`At least ${minimumMembers} active project members are required.`);
  }

  const sorted = [...members].sort((a, b) => a.userId.localeCompare(b.userId));
  const assignments: GeneratedAssignment[] = [];

  for (const reviewer of sorted) {
    for (const reviewee of sorted) {
      if (reviewer.userId === reviewee.userId) continue;
      assignments.push({
        reviewerId: reviewer.userId,
        revieweeId: reviewee.userId,
      });
    }
  }

  return assignments;
}
