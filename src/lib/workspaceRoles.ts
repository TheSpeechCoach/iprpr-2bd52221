export type WorkspaceRole = "owner" | "admin" | "member";

export function canInvite(role: WorkspaceRole) {
  return role === "owner" || role === "admin";
}

export function canAssignInviteRole(
  inviterRole: WorkspaceRole,
  invitedRole: WorkspaceRole,
) {
  if (!canInvite(inviterRole)) return false;
  if (invitedRole === "owner") return false;
  return invitedRole === "admin" || invitedRole === "member";
}

export function isInviteExpired(expiresAt: string | Date) {
  return new Date(expiresAt).getTime() < Date.now();
}
