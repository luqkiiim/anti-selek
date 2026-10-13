// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element -- Mock avatars expose rendered URLs for component assertions. */
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PrototypeApp from "./PrototypeApp";
import { useResource } from "./api";

const session = vi.hoisted(() => ({ data: { user: { id: "account-1", name: "Ari", canBrowseAllClubs: false } }, status: "authenticated" }));
vi.mock("next-auth/react", () => ({ useSession: () => session }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("./Club", () => ({ default: function MockClub({ club, onSwitch, initialPage = "club" }: { club: { id: string }; onSwitch: () => void; initialPage?: "club" | "profile" }) { const [page, setPage] = useState(initialPage); const [open, setOpen] = useState(false); const profile = useResource<{ avatarUrl: string | null }>(`/api/clubs/${club.id}`); return <div data-selected-club={club.id} data-page={page}>Selected club<button onClick={() => setPage("club")}>Club tab</button>{profile.data?.avatarUrl && <img alt="Selected Player photo" src={profile.data.avatarUrl} />}<button onClick={onSwitch}>Switch club</button><button onClick={() => setOpen(true)}>Open club account</button>{open && <div role="dialog" aria-label="Club account sheet">Saved draft</div>}</div>; } }));
vi.mock("./Primitives", () => ({
  Avatar: ({ name, url }: { name: string; url?: string | null }) => <span>{url ? <img alt={`${name} photo`} src={url} /> : name}</span>,
  ErrorText: ({ error }: { error: string }) => error ? <p role="alert">{error}</p> : null,
  Sheet: ({ open = true, title, children, footer }: { open?: boolean; title: string; children: ReactNode; footer?: ReactNode }) => open ? <div role="dialog" aria-label={title}>{children}{footer}</div> : null,
}));
let accountGender = "UNSPECIFIED";
vi.mock("./AccountSettings", () => ({ AccountSettings: ({ open, onSaved, onClose }: { open: boolean; onSaved: () => Promise<unknown>; onClose: () => void }) => { const resource = useResource<{ user: { avatarUrl?: string | null } }>(open ? "/api/user/me" : null); return open ? <div role="dialog" aria-label="Your account">{resource.data?.user.avatarUrl && <img alt="Account settings photo" src={resource.data.user.avatarUrl} />}<button onClick={() => { accountGender = "FEMALE"; void onSaved(); }}>Save details</button><button onClick={onClose}>Close account</button></div> : null; } }));
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  session.status = "authenticated";
  session.data.user.canBrowseAllClubs = false;
  accountGender = "UNSPECIFIED"; localStorage.clear(); history.replaceState(null, "", "/?join=club-1");
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => ({ ok: true, json: async () => String(url) === "/api/user/me" ? { user: { id: "account-1", name: "Ari", gender: accountGender } } : String(url) === "/api/clubs" ? [] : { requiresJoinCode: false, club: { id: "club-1", name: "Riverside", allowJoinRequests: true, isPasswordProtected: false, avatarUrl: null }, players: [], requests: [], access: null, membership: null } }) as Response));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); history.replaceState(null, "", "/"); });
function button(label: string) {
  const found = Array.from(container.querySelectorAll("button")).find(item => item.textContent === label);
  if (!found) throw new Error(`Missing ${label}`); return found;
}
it("opens account settings and returns to the same joining confirmation after refreshed details", async () => {
  await act(async () => root.render(<PrototypeApp />));
  await act(async () => button("I’m new to this club").click());
  await act(async () => button("Complete account details").click());
  expect(container.querySelector('[aria-label="Join a club"]')).toBeNull();
  expect(container.querySelector('[aria-label="Your account"]')).not.toBeNull();
  await act(async () => button("Save details").click());
  expect(container.querySelector('[aria-label="Your account"]')).toBeNull();
  expect(container.textContent).toContain("Riverside");
  expect(container.textContent).toContain("Request a new Player profile");
  expect(container.querySelector(".admission-account-summary")?.textContent).toContain("AriFemale");
  expect(button("Send request").disabled).toBe(false);
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/api/clubs/join-requests?clubId=club-1")).toHaveLength(1);
});

it("shows browse clubs only for the independent account flag", async () => {
  history.replaceState(null, "", "/");
  await act(async () => root.render(<PrototypeApp />));
  expect(Array.from(container.querySelectorAll("button")).some(b => b.textContent === "Browse clubs")).toBe(false);
  session.data.user.canBrowseAllClubs = true;
  await act(async () => root.render(<PrototypeApp />));
  expect(button("Browse clubs")).not.toBeNull();
});

it("retains the selected club and its open sheet while the signed-in session refreshes", async () => {
  history.replaceState(null, "", "/");
  vi.mocked(fetch).mockImplementation(async (url) => ({ ok: true, json: async () => String(url) === "/api/clubs" ? [{ id: "club", name: "Riverside", role: "MEMBER", membersCount: 1, sessionsCount: 0 }] : { user: { id: "account-1", name: "Ari", gender: "MALE" } } }) as Response);
  await act(async () => root.render(<PrototypeApp />));
  await act(async () => button("Open club account").click());
  expect(container.querySelector('[aria-label="Club account sheet"]')).not.toBeNull();
  session.status = "loading";
  await act(async () => root.render(<PrototypeApp />));
  expect(container.textContent).toContain("Selected club");
  expect(container.querySelector('[aria-label="Club account sheet"]')?.textContent).toBe("Saved draft");
  session.status = "authenticated";
  await act(async () => root.render(<PrototypeApp />));
  expect(container.querySelector('[aria-label="Club account sheet"]')).not.toBeNull();
  session.status = "unauthenticated";
  await act(async () => root.render(<PrototypeApp />));
  expect(container.querySelector('[aria-label="Club account sheet"]')).toBeNull();
});


const adoptedPhoto = "/avatars/adopted-player.png";
const dashboardClub = { id: "club-1", name: "Riverside", role: "MEMBER", membersCount: 1, sessionsCount: 0 };
function admissionStatus(status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED") {
  return { requiresJoinCode: false, club: { id: "club-1", name: "Riverside", allowJoinRequests: true, isPasswordProtected: false, avatarUrl: null },
    players: [{ id: "player-1", name: "Ari", avatarUrl: adoptedPhoto }],
    requests: [{ id: "request-1", clubId: "club-1", kind: "EXISTING_PLAYER", status, revision: 1, createdAt: "2026-10-01T00:00:00Z" }], access: null, membership: null };
}
function response(data: unknown) { return { ok: true, json: async () => data } as Response; }

it("refreshes stale account and club resources after approved Open club without another sign-in", async () => {
  let approved = false;
  vi.mocked(fetch).mockImplementation(async url => {
    const path = String(url);
    if (path === "/api/user/me") return response({ user: { id: "account-1", name: "Ari", gender: "FEMALE", avatarUrl: approved ? adoptedPhoto : null } });
    if (path === "/api/clubs") return response(approved ? [dashboardClub] : []);
    if (path === "/api/clubs/club-1") return response({ avatarUrl: approved ? adoptedPhoto : null });
    return response(admissionStatus(approved ? "APPROVED" : "PENDING"));
  });
  await act(async () => root.render(<PrototypeApp />));
  expect(container.textContent).toContain("Waiting for admin approval");
  expect(container.querySelector('[aria-label="Account"] img')).toBeNull();
  approved = true;
  await act(async () => button("Refresh status").click());
  // Discovery may show approval, but only the authoritative account read supplies its photo.
  expect(container.querySelector('[aria-label="Account"] img')).toBeNull();
  await act(async () => button("Open club").click());
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/api/user/me")).toHaveLength(2);
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/api/clubs")).toHaveLength(2);
  expect(container.querySelector('[alt="Selected Player photo"]')?.getAttribute("src")).toBe(adoptedPhoto);
  await act(async () => button("Switch club").click());
  expect(container.querySelector('[aria-label="Account"] img')?.getAttribute("src")).toBe(adoptedPhoto);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Account"]')!.click());
  expect(container.querySelector('[alt="Account settings photo"]')?.getAttribute("src")).toBe(adoptedPhoto);
});

it.each(["PENDING", "REJECTED", "CANCELLED"] as const)("keeps the account photo unchanged while a request is %s", async status => {
  vi.mocked(fetch).mockImplementation(async url => String(url) === "/api/user/me"
    ? response({ user: { id: "account-1", name: "Ari", gender: "FEMALE", avatarUrl: null } })
    : String(url) === "/api/clubs" ? response([]) : response(admissionStatus(status)));
  await act(async () => root.render(<PrototypeApp />));
  expect(Array.from(container.querySelectorAll("button")).some(item => item.textContent === "Open club")).toBe(false);
  expect(container.querySelector('[aria-label="Account"] img')).toBeNull();
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/api/user/me")).toHaveLength(1);
  expect(localStorage.getItem("pc-club:account-1")).toBeNull();
});

it.each(["account", "clubs"] as const)("preserves selection when the asynchronous %s refresh fails", async failedResource => {
  let opened = false;
  let rejectRefresh!: (reason: Error) => void;
  const failedRead = new Promise<Response>((_, reject) => { rejectRefresh = reject; });
  vi.mocked(fetch).mockImplementation(async url => {
    const path = String(url);
    if (opened && path === (failedResource === "account" ? "/api/user/me" : "/api/clubs")) return failedRead;
    if (path === "/api/user/me") return response({ user: { id: "account-1", name: "Ari", gender: "FEMALE", avatarUrl: null } });
    if (path === "/api/clubs") return response([dashboardClub]);
    if (path === "/api/clubs/club-1") return response({ avatarUrl: adoptedPhoto });
    return response(admissionStatus("APPROVED"));
  });
  await act(async () => root.render(<PrototypeApp />));
  opened = true;
  await act(async () => button("Open club").click());
  expect(container.textContent).toContain("Selected club");
  expect(container.querySelector('[aria-label="Join a club"]')).toBeNull();
  expect(localStorage.getItem("pc-club:account-1")).toBe("club-1");
  await act(async () => rejectRefresh(new Error("Temporary read failure")));
  expect(container.textContent).toContain("Selected club");
  expect(localStorage.getItem("pc-club:account-1")).toBe("club-1");
});

it("does not fabricate club membership when an approved request's refreshed club list is empty", async () => {
  vi.mocked(fetch).mockImplementation(async url => String(url) === "/api/user/me"
    ? response({ user: { id: "account-1", name: "Ari", gender: "FEMALE", avatarUrl: null } })
    : String(url) === "/api/clubs" ? response([]) : response(admissionStatus("APPROVED")));
  await act(async () => root.render(<PrototypeApp />));
  await act(async () => button("Open club").click());
  expect(container.textContent).not.toContain("Selected club");
  expect(container.querySelector('[aria-label="Account"] img')).toBeNull();
});


it("opens the authorized linked club's Profile among multiple clubs and consumes the link only once", async () => {
  history.replaceState(null, "", "/?club=club-1&tab=profile&keep=yes");
  localStorage.setItem("pc-club:account-1", "other-club");
  vi.mocked(fetch).mockImplementation(async url => String(url) === "/api/clubs"
    ? response([dashboardClub, { ...dashboardClub, id: "other-club" }])
    : String(url) === "/api/user/me" ? response({ user: { id: "account-1", name: "Ari", gender: "FEMALE" } }) : response({ avatarUrl: adoptedPhoto }));
  await act(async () => root.render(<PrototypeApp />));
  expect(container.querySelector('[data-selected-club="club-1"]')?.getAttribute("data-page")).toBe("profile");
  expect(localStorage.getItem("pc-club:account-1")).toBe("club-1");
  expect(location.search).toBe("?keep=yes");
  await act(async () => button("Club tab").click());
  session.status = "loading";
  await act(async () => root.render(<PrototypeApp />));
  session.status = "authenticated";
  await act(async () => root.render(<PrototypeApp />));
  expect(container.querySelector('[data-selected-club="club-1"]')?.getAttribute("data-page")).toBe("club");
});

it("does not read or select an unavailable club from a link, even with a saved authorized club", async () => {
  history.replaceState(null, "", "/?club=foreign-club&tab=profile");
  localStorage.setItem("pc-club:account-1", "club-1");
  vi.mocked(fetch).mockImplementation(async url => String(url) === "/api/clubs" ? response([dashboardClub])
    : response({ user: { id: "account-1", name: "Ari", gender: "FEMALE" } }));
  await act(async () => root.render(<PrototypeApp />));
  expect(container.textContent).not.toContain("Selected club");
  expect(location.search).toBe("");
  expect(localStorage.getItem("pc-club:account-1")).toBeNull();
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("foreign-club"))).toBe(false);
});

it("gives a join link priority over a club Profile link", async () => {
  history.replaceState(null, "", "/?join=club-1&club=club-1&tab=profile");
  await act(async () => root.render(<PrototypeApp />));
  expect(container.querySelector('[aria-label="Join a club"]')).not.toBeNull();
  expect(container.textContent).not.toContain("Selected club");
  expect(localStorage.getItem("pc-club:account-1")).toBeNull();
  expect(location.search).toBe("");
});
