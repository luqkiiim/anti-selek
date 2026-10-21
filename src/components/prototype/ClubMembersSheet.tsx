"use client";

import type { ClubPageMember } from "@/components/club/clubTypes";
import { Avatar, Sheet } from "./Primitives";

export function ClubMembersSheet({
  members,
  open,
  onClose,
}: {
  members: Pick<ClubPageMember, "id" | "name" | "avatarUrl">[];
  open: boolean;
  onClose: () => void;
}) {
  const sortedMembers = [...members].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  return (
    <Sheet open={open} title="Members" onClose={onClose}>
      {sortedMembers.length ? (
        <ul className="club-members-list">
          {sortedMembers.map((member) => (
            <li key={member.id}>
              <Avatar name={member.name} url={member.avatarUrl} />
              <strong>{member.name}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No members yet.</p>
      )}
    </Sheet>
  );
}
