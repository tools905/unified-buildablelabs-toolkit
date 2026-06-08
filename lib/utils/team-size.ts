export function minimumProjectMembers() {
  return process.env.ALLOW_SMALL_TEST_TEAMS === "true" ? 1 : 3;
}

export function allowSmallTestTeams() {
  return minimumProjectMembers() === 1;
}
