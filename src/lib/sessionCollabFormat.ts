import {
  SessionClubRole,
  SessionClubStatus,
  SessionCollabFormat,
} from "@/types/enums";

const collabFormats = new Set<string>(Object.values(SessionCollabFormat));

export interface SessionClubFormatLink {
  clubId: string;
  role: string;
  status: string;
  createdAt?: Date | string;
  club?: {
    id: string;
    name: string;
  };
}

export interface SessionCollabFormatSource {
  collabFormat?: string | null;
}

export interface SessionInterclubSource extends SessionCollabFormatSource {
  clubId?: string | null;
  sessionClubs?: SessionClubFormatLink[];
}

export function isValidSessionCollabFormat(
  value: unknown
): value is SessionCollabFormat {
  return typeof value === "string" && collabFormats.has(value);
}

export function getSessionCollabFormat(
  source: SessionCollabFormatSource
): SessionCollabFormat {
  return isValidSessionCollabFormat(source.collabFormat)
    ? source.collabFormat
    : SessionCollabFormat.FREE_PLAY;
}

export function isInterclubSession(source: SessionCollabFormatSource) {
  return getSessionCollabFormat(source) === SessionCollabFormat.INTERCLUB;
}

export function getSessionCollabFormatLabel(
  format: SessionCollabFormat | string
) {
  switch (format) {
    case SessionCollabFormat.INTERCLUB:
      return "Club vs club";
    case SessionCollabFormat.FREE_PLAY:
      return "Free play";
    default:
      return format;
  }
}

function sortSessionClubLinks<T extends SessionClubFormatLink>(links: T[]) {
  return links.slice().sort((left, right) => {
    if (left.role !== right.role) {
      return left.role === SessionClubRole.HOST ? -1 : 1;
    }

    return (
      new Date(left.createdAt ?? 0).getTime() -
      new Date(right.createdAt ?? 0).getTime()
    );
  });
}

export function getAcceptedInterclubClubIds(
  session: SessionInterclubSource
): string[] {
  const acceptedLinks = sortSessionClubLinks(
    (session.sessionClubs ?? []).filter(
      (link) => link.status === SessionClubStatus.ACCEPTED
    )
  );
  const acceptedIds = acceptedLinks.map((link) => link.clubId);

  if (session.clubId && !acceptedIds.includes(session.clubId)) {
    acceptedIds.unshift(session.clubId);
  }

  return Array.from(new Set(acceptedIds));
}

export function getInterclubClubNameById(session: SessionInterclubSource) {
  return new Map(
    (session.sessionClubs ?? [])
      .filter((link) => link.club)
      .map((link) => [link.clubId, link.club!.name])
  );
}
