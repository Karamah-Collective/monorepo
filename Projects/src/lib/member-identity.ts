type CurrentMember = {
  userId?: string | null;
  user?: { email?: string | null } | null;
};

type MemberCandidate = {
  id?: string | null;
  email?: string | null;
};

export function isCurrentMember(candidate: MemberCandidate, current?: CurrentMember | null) {
  const candidateId = String(candidate.id || "");
  const currentId = String(current?.userId || "");
  const candidateEmail = String(candidate.email || "").toLowerCase();
  const currentEmail = String(current?.user?.email || "").toLowerCase();
  return Boolean(
    (candidateId && currentId && candidateId === currentId) ||
    (candidateEmail && currentEmail && candidateEmail === currentEmail),
  );
}
