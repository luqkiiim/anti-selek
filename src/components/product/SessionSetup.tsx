"use client";

import { useAdminOnboardingProgress } from "@/components/onboarding/useAdminOnboardingProgress";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAppReady } from "@/components/app/AppStartup";
import { CaretRight, Check, Minus, Plus, MagnifyingGlass, Shuffle, Scales, ChartBar, UsersThree, Trash, X } from "@phosphor-icons/react";
import type { ClubPageMember } from "@/components/club/clubTypes";
import { MixedSide } from "@/types/enums";
import { Avatar, Sheet, ErrorText } from "./Primitives";
import { api, useAction } from "./api";
import "./session-setup.css";
import { NewSessionPlayerForm } from "./NewSessionPlayerForm";
import { SessionDetailsForm, sessionDetailsDraft, sessionDetailsFromDraft } from "@/components/session/SessionDetailsForm";

type Gender = "MALE" | "FEMALE" | "UNSPECIFIED";
type Pool = "A" | "B";
type Guest = { id: string; name: string; initialElo: number; gender: Gender; mixedSideOverride: MixedSide | null; pool: Pool };
const formats = [
  { id: "BALANCED", name: "Balanced", description: "More variety, while keeping teams balanced.", icon: Scales },
  { id: "SOCIAL", name: "Social", description: "Prioritize playing with different people.", icon: Shuffle },
  { id: "LEVEL_MATCH", name: "Level match", description: "Bring players of similar ability together.", icon: ChartBar },
] as const;

function Toggle({ title, hint, checked, onChange }: { title: string; hint?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="setup-toggle"><span><strong>{title}</strong>{hint && <small>{hint}</small>}</span><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span className="setup-switch" aria-hidden="true" /></label>;
}

export function SessionSetup({ clubId, members: initialMembers, onCreated, canSavePlayers = false, onMemberSaved, tutorial = false }: { clubId: string; members: ClubPageMember[]; onCreated: (code: string) => void; canSavePlayers?: boolean; onMemberSaved?: (member: ClubPageMember) => void; tutorial?: boolean }) {
  const guide = useAdminOnboardingProgress(tutorial);
  const [addedMembers, setAddedMembers] = useState<ClubPageMember[]>([]);
  const rosterMembers = [...new Map([...initialMembers, ...addedMembers].map(member => [member.id, member])).values()];
  const [playerNotice, setPlayerNotice] = useState("");
  const [savingPlayer, setSavingPlayer] = useState(false);
  useAppReady(true);
  const identities = new Set<string>();
  const memberIds = new Set([...rosterMembers].sort((a, b) => Number(b.isClaimed) - Number(a.isClaimed)).filter(member => {
    const key = member.offlineIdentityId ? `identity:${member.offlineIdentityId}` : `user:${member.id}`;
    if (identities.has(key)) return false;
    identities.add(key);
    return true;
  }).map(member => member.id));
  const members = rosterMembers.filter(member => memberIds.has(member.id));
  const [partner, setPartner] = useState<{id:string;name:string} | null>(null);
  const [partnerSearch, setPartnerSearch] = useState("");
  const [candidates, setCandidates] = useState<Array<{id:string;name:string;membersCount:number}>>([]);
  const [partnerError, setPartnerError] = useState("");
  const [collabFormat, setCollabFormat] = useState("FREE_PLAY");
  const [schedulingMode, setSchedulingMode] = useState("FREE_PLAY");
  const [scoringFormat, setScoringFormat] = useState("SINGLE_GAME");
  const [ratingMode, setRatingMode] = useState("UNRATED");
  useEffect(() => {
    let current = true;
    if (partnerSearch.trim().length < 2 || partner) return;
    const timer = setTimeout(() => {
      void api<typeof candidates>(`/api/clubs/${clubId}/collab-candidates?search=${encodeURIComponent(partnerSearch.trim())}`).then(value => { if (current) { setCandidates(value); setPartnerError(""); } }).catch(error => { if (current) setPartnerError(error instanceof Error ? error.message : "Unable to find clubs."); });
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [clubId, partnerSearch, partner]);
  const [name, setName] = useState("");
  const [courts, setCourts] = useState(2);
  const [details, setDetails] = useState(sessionDetailsDraft);
  const [selected, setSelected] = useState<string[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [style, setStyle] = useState<(typeof formats)[number]["id"]>("BALANCED");
  const [metric, setMetric] = useState("RATING");
  const [mixed, setMixed] = useState(false);
  const [groups, setGroups] = useState(false);
  const [crossover, setCrossover] = useState("BALANCED");
  const [autoQueue, setAutoQueue] = useState(false);
  const [pools, setPools] = useState<Record<string, Pool>>({});
  const [rosterOpen, setRosterOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const rosterHeader = useRef<HTMLDivElement>(null);
  const playerRows = useRef(new Map<string, HTMLDivElement>());
  const pendingScrollPlayerId = useRef<string | null>(null);
  const pendingSearchFocus = useRef(false);
  useLayoutEffect(() => {
    if (!savingPlayer && pendingSearchFocus.current) {
      pendingSearchFocus.current = false;
      searchInput.current?.focus({ preventScroll: true });
    }
  }, [savingPlayer]);
  useLayoutEffect(() => {
    const id = pendingScrollPlayerId.current;
    pendingScrollPlayerId.current = null;
    if (!id) return;
    const row = playerRows.current.get(id);
    const panel = searchInput.current?.closest<HTMLElement>(".sheet-panel");
    const header = rosterHeader.current;
    if (row && panel && header) {
      // Scroll only the sheet, keeping the picked player below the search bar.
      panel.scrollTop += row.getBoundingClientRect().top - panel.getBoundingClientRect().top - header.offsetHeight;
    }
  }, [search, selected]);
  const [addingGuest, setAddingGuest] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const action = useAction();
  const players = members.filter(p => selected.includes(p.id));
  const count = players.length + guests.length;
  const getPool = (p: ClubPageMember) => pools[p.id] ?? p.preferredPool ?? "B";
  const getGender = (p: ClubPageMember) => p.gender ?? "UNSPECIFIED";
  const competitive = players.filter(p => getPool(p) === "A").length + guests.filter(g => g.pool === "A").length;
  const visibleMembers = members
    .filter(p => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  function openPlayerForm(prefill = "") {
    setNewPlayerName(prefill);
    setAddingGuest(true);
  }
  function selectSavedMember(member: ClubPageMember) {
    setAddedMembers(current => [...current.filter(item => item.id !== member.id), member]);
    setSelected(current => current.includes(member.id) ? current : [...current, member.id]);
    onMemberSaved?.(member);
    setPlayerNotice(`${member.name} is saved to the club and selected.`);
    setAddingGuest(false);
    setSearch("");
    pendingScrollPlayerId.current = member.id;
    pendingSearchFocus.current = true;
  }
  function togglePlayer(id: string) {
    const isSelected = selected.includes(id);
    setSelected(ids => ids.includes(id) ? ids.filter(p => p !== id) : [...ids, id]);
    if (!isSelected) {
      if (search) pendingScrollPlayerId.current = id;
      setSearch("");
    }
  }
  function prepare() {
    void action.run(async () => {
      if (!name.trim()) throw new Error("Give this session a name.");
      if (!partner && count < 2) throw new Error("Choose at least two players or guests.");
      if ((!partner || collabFormat === "FREE_PLAY") && mixed && players.some(p => getGender(p) === "UNSPECIFIED")) throw new Error("Some players haven’t set their gender. Ask them to update their account before using mixed pairs.");
      if ((!partner || collabFormat === "FREE_PLAY") && mixed && guests.some(g => g.gender === "UNSPECIFIED")) throw new Error("Set a gender for each guest in the player list before using mixed pairs.");
      if ((!partner || collabFormat === "FREE_PLAY") && groups && (competitive < 2 || count - competitive < 2)) throw new Error("Open the player list and assign at least two players to each group.");
      const created = await api<{ code: string }>("/api/sessions", "POST", {
        details: sessionDetailsFromDraft(details, Array.from({ length: courts }, (_, index) => index + 1)),
        name: name.trim(), clubId, courtCount: courts, scoringType: "POINTS", matchmakingStyle: style,
        balanceMetric: metric, pairingMode: partner && collabFormat === "INTERCLUB" ? "OPEN" : mixed ? "MIXED" : "OPEN", collabFormat: partner ? collabFormat : "FREE_PLAY",
        ...(partner ? { partnerClubId: partner.id, collaborationVersion: 2, schedulingMode: collabFormat === "INTERCLUB" ? schedulingMode : "FREE_PLAY", scoringFormat: collabFormat === "INTERCLUB" ? scoringFormat : "SINGLE_GAME", ratingMode: collabFormat === "INTERCLUB" ? ratingMode : "RATED" } : {}),
        playerIds: players.map(p => p.id), playerConfigs: players.map(p => ({ playerId: p.id, pool: getPool(p) })),
        guestConfigs: guests.map(({ name, initialElo, gender, mixedSideOverride, pool }) => ({ name, initialElo, gender, mixedSideOverride, pool })),
        poolsEnabled: partner && collabFormat === "INTERCLUB" ? false : groups, crossoverFrequency: crossover, autoQueueEnabled: partner && collabFormat === "INTERCLUB" ? false : autoQueue, respectPlayerRest: true, isTest: false,
      });
      if (tutorial) guide.completeStep("host-session");
      onCreated(created.code);
    });
  }
  const rosterError = /player|guest|gender|group/i.test(action.error) ? action.error : "";
  return <section className="session-setup" aria-label="Session setup">
    <div className="setup-intro"><span className="eyebrow">LET’S PLAY</span><h1>Make it your session.</h1></div>
    <form onSubmit={e => { e.preventDefault(); prepare(); }}>
      <fieldset disabled={action.busy} className="setup-fields">
        <section className="setup-section" aria-label="Session details">
          <label className="field-label setup-name">Session name<input id="admin-onboarding-session-name" value={name} onChange={e => setName(e.target.value)} required /></label>
          <div className="setup-courts"><span><strong>Courts</strong></span><div className="setup-stepper"><button type="button" aria-label="Fewer courts" disabled={courts === 1} onClick={() => setCourts(n => n - 1)}><Minus size={18} /></button><output aria-label="Court count" aria-live="polite">{courts}</output><button type="button" aria-label="More courts" disabled={courts === 10} onClick={() => setCourts(n => n + 1)}><Plus size={18} /></button></div></div>
        </section>

        <section className="setup-section" aria-labelledby="setup-players"><h2 id="setup-players">Who’s playing?</h2>
          <button type="button" id="admin-onboarding-host-players" className="setup-roster-summary" onClick={() => setRosterOpen(true)} aria-haspopup="dialog">
            <span className="setup-roster-faces" aria-hidden="true">{players.slice(0, 3).map(p => <Avatar key={p.id} name={p.name} url={p.avatarUrl} />)}{!players.length && <UsersThree size={28} />}</span>
            <span><strong>Add players</strong><small>{count} selected{guests.length ? ` · ${guests.length} session-only` : ""}</small></span><CaretRight size={18} />
          </button>
          <ErrorText error={rosterError} />
          {count < 4 && <p className="setup-hint">You’ll need four players to start a doubles game.</p>}
        </section>

        {(!partner || collabFormat === "FREE_PLAY") && <section className="setup-section" aria-labelledby="setup-matches"><h2 id="setup-matches">How should we match?</h2>
          <div className="setup-format-list" role="radiogroup" aria-label="Matchmaking style">{formats.map(({ id, name, description, icon: Icon }) => <label key={id} className={`setup-format ${style === id ? "is-selected" : ""}`}><input type="radio" name="matchmaking" value={id} checked={style === id} onChange={() => setStyle(id)} /><Icon size={24} weight="duotone" aria-hidden="true" /><span><strong>{name}</strong><small>{description}</small></span><span className="setup-radio-mark" aria-hidden="true">{style === id && <Check size={13} weight="bold" />}</span></label>)}</div>
          <Toggle title="Mixed pairs" checked={mixed} onChange={setMixed} />
          {style !== "SOCIAL" && <fieldset className="setup-metric"><legend>Balance teams using</legend><div className="setup-segments">{[{ id: "RATING", name: "Club rating" }, { id: "SESSION_POINTS", name: "Session points" }].map(option => <label key={option.id}><input type="radio" name="balance" value={option.id} checked={metric === option.id} onChange={() => setMetric(option.id)} /><span>{option.name}</span></label>)}</div></fieldset>}
        </section>}

        <details className="setup-options setup-partner" aria-label="Partner club">
          <summary><span><strong>Invite a club</strong>{partner && <small>{partner.name}</small>}</span><CaretRight size={18} /></summary>
          <div className="setup-options-content">
            {partner ? <div className="setup-partner-selected"><strong>{partner.name}</strong><button type="button" className="text-button" onClick={() => { setPartner(null); setPartnerSearch(""); setCandidates([]); }}>Remove</button></div> : <><label className="field-label">Find a partner club<input type="search" value={partnerSearch} onChange={e => { setPartnerSearch(e.target.value); setCandidates([]); }} placeholder="Club name" /></label>{partnerSearch.trim().length >= 2 && <div className="setup-partner-results">{candidates.map(club => <button type="button" className="secondary full" key={club.id} onClick={() => { setPartner(club); setCandidates([]); }}><strong>{club.name}</strong><span>{club.membersCount} members</span></button>)}</div>}<ErrorText error={partnerError} /></>}
            {partner && <><fieldset className="setup-metric"><legend>Play style</legend><div className="setup-segments">{[{id:"FREE_PLAY",name:"Play together"},{id:"INTERCLUB",name:"Club vs club"}].map(option => <label key={option.id}><input type="radio" name="collab-format" checked={collabFormat === option.id} onChange={() => setCollabFormat(option.id)} /><span>{option.name}</span></label>)}</div></fieldset>
            {collabFormat === "INTERCLUB" && <div className="setup-collab-options">{[{label:"Matches",name:"scheduling",value:schedulingMode,set:setSchedulingMode,options:[["LINEUP","Lineup"],["FREE_PLAY","Free play"]]},{label:"Scoring",name:"scoring",value:scoringFormat,set:setScoringFormat,options:[["SINGLE_GAME","Single game"],["BEST_OF_THREE","Best of three"]]},{label:"Club ratings",name:"ratings",value:ratingMode,set:setRatingMode,options:[["UNRATED","Unrated"],["RATED","Rated"]]}].map(group => <fieldset key={group.name} className="setup-metric"><legend>{group.label}</legend><div className="setup-segments">{group.options.map(([id,label]) => <label key={id}><input type="radio" name={group.name} checked={group.value === id} onChange={() => group.set(id)} /><span>{label}</span></label>)}</div></fieldset>)}</div>}</>}
          </div>
        </details>

        {(!partner || collabFormat === "FREE_PLAY") && <details className="setup-options"><summary><span><strong>More options</strong></span><CaretRight size={18} /></summary><div className="setup-options-content">
          <Toggle title="Player groups" hint="Separate Competitive and Social groups." checked={groups} onChange={setGroups} />
          {groups && <div className="setup-group-options"><button type="button" className="setup-inline-action" onClick={() => setGroupsOpen(true)} aria-haspopup="dialog">{competitive} Competitive · {count - competitive} Social<CaretRight size={16} /></button><label className="field-label">Mix groups<select aria-label="Mix groups" value={crossover} onChange={e => setCrossover(e.target.value)}><option value="OCCASIONAL">Occasionally</option><option value="BALANCED">Sometimes</option><option value="FREQUENT">Often</option></select></label></div>}
          <Toggle title="Prepare the next game" hint="Automatically keep the next match queued." checked={autoQueue} onChange={setAutoQueue} />

        </div></details>}
        <SessionDetailsForm value={details} onChange={setDetails} courtNumbers={Array.from({ length: courts }, (_, index) => index + 1)} />
      </fieldset>
      <div className="setup-submit"><ErrorText error={rosterError ? "" : action.error} /><button className="primary full" id="admin-onboarding-create-session" type="submit" disabled={action.busy}>{action.busy ? "Preparing…" : "Prepare session"}<CaretRight size={18} /></button></div>
    </form>

    <Sheet open={rosterOpen} busy={savingPlayer} title="Who’s playing?" onClose={() => { setRosterOpen(false); setAddingGuest(false); }}>
      <div className="setup-roster-sheet"><div hidden={addingGuest}><div ref={rosterHeader} className="setup-roster-header"><div className="setup-roster-tools"><strong>{count} selected</strong></div>
        <div className="setup-search"><MagnifyingGlass size={18} aria-hidden="true" /><input ref={searchInput} aria-label="Find a player" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a player" />{search && <button type="button" className="setup-search-clear" aria-label="Clear player search" onClick={() => { setSearch(""); searchInput.current?.focus(); }}><X size={18} aria-hidden="true" /></button>}</div>
        </div>
        <div className="setup-roster-list">{visibleMembers.map(p => <div key={p.id} ref={node => { if (node) playerRows.current.set(p.id, node); else playerRows.current.delete(p.id); }} className="setup-person"><label className="setup-person-select"><input type="checkbox" checked={selected.includes(p.id)} onChange={() => togglePlayer(p.id)} /><Avatar name={p.name} url={p.avatarUrl} /><span><strong>{p.name}</strong><small>{p.status === "CORE" ? "Core" : "Occasional"} · {p.elo}</small></span></label>{selected.includes(p.id) && groups && <div className="setup-person-options">{groups && <label>Group<select value={getPool(p)} onChange={e => setPools(g => ({ ...g, [p.id]: e.target.value as Pool }))} aria-label={`Group for ${p.name}`}><option value="A">Competitive</option><option value="B">Social</option></select></label>}</div>}</div>)}{!visibleMembers.length && <div className="setup-no-match"><p className="setup-hint">No players found.</p>{!addingGuest && search.trim().length >= 2 && <button type="button" className="secondary full" onClick={() => openPlayerForm(search.trim())}>Add “{search.trim()}”</button>}</div>}</div>
        {guests.length > 0 && <div className="setup-guests"><h3>Guests</h3>{[...guests].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })).map(g => <div className="setup-person" key={g.id}><div className="setup-guest-heading"><Avatar name={g.name} /><span><strong>{g.name}</strong><small>Guest · {g.initialElo}</small></span><button type="button" className="icon-button" aria-label={`Remove guest ${g.name}`} onClick={() => setGuests(list => list.filter(item => item.id !== g.id))}><Trash size={18} /></button></div>{(mixed || groups) && <div className="setup-person-options">{mixed && <label>Gender<select aria-label={`Gender for ${g.name}`} value={g.gender} onChange={e => setGuests(list => list.map(item => item.id === g.id ? { ...item, gender: e.target.value as Gender, mixedSideOverride: null } : item))}><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label>}{groups && <label>Group<select aria-label={`Group for ${g.name}`} value={g.pool} onChange={e => setGuests(list => list.map(item => item.id === g.id ? { ...item, pool: e.target.value as Pool } : item))}><option value="A">Competitive</option><option value="B">Social</option></select></label>}</div>}</div>)}</div>}
        {playerNotice && <p role="status">{playerNotice}</p>}</div>
        {addingGuest ? <NewSessionPlayerForm
          clubs={[{ id: clubId, name: "This club", canSave: canSavePlayers }]}
          mode="setup" initialName={newPlayerName} mixed={mixed && (!partner || collabFormat === "FREE_PLAY")}
          onBusyChange={setSavingPlayer} onSaved={selectSavedMember}
          onGuest={guest => {
            if (guests.some(item => item.name.trim().toLocaleLowerCase() === guest.name.toLocaleLowerCase())) throw new Error("That guest is already selected.");
            setGuests(list => [...list, { ...guest, id: crypto.randomUUID(), pool: "B" }]);
            setAddingGuest(false); setSearch("");
            pendingSearchFocus.current = true;
          }} onCancel={() => setAddingGuest(false)}
        /> : <button type="button" className="secondary full" onClick={() => openPlayerForm()}><Plus size={18} />Add new player</button>}
        {!addingGuest && <div className="setup-roster-done"><button type="button" className="primary full" onClick={() => setRosterOpen(false)}>Done · {count} players</button></div>}
      </div>
    </Sheet>

    <Sheet open={groupsOpen} title="Player groups" onClose={() => setGroupsOpen(false)}>
      <div className="setup-roster-sheet">
        <div className="setup-roster-tools"><strong>{count} selected</strong></div>
        {!count && <p className="setup-hint">Choose players in “Who’s playing?” first.</p>}
        <div className="setup-roster-list">
          {[...players].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })).map(p => <div key={p.id} className="setup-person">
            <div className="setup-guest-heading"><Avatar name={p.name} url={p.avatarUrl} /><span><strong>{p.name}</strong><small>{p.status === "CORE" ? "Core" : "Occasional"} · {p.elo}</small></span></div>
            <div className="setup-person-options"><label>Group<select value={getPool(p)} onChange={e => setPools(g => ({ ...g, [p.id]: e.target.value as Pool }))} aria-label={`Group for ${p.name}`}><option value="A">Competitive</option><option value="B">Social</option></select></label></div>
          </div>)}
        </div>
        {guests.length > 0 && <div className="setup-guests"><h3>Guests</h3>
          {[...guests].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })).map(g => <div key={g.id} className="setup-person">
            <div className="setup-guest-heading"><Avatar name={g.name} /><span><strong>{g.name}</strong><small>Guest · {g.initialElo}</small></span></div>
            <div className="setup-person-options"><label>Group<select aria-label={`Group for ${g.name}`} value={g.pool} onChange={e => setGuests(list => list.map(item => item.id === g.id ? { ...item, pool: e.target.value as Pool } : item))}><option value="A">Competitive</option><option value="B">Social</option></select></label></div>
          </div>)}
        </div>}
        <div className="setup-roster-done"><button type="button" className="primary full" onClick={() => setGroupsOpen(false)}>Done</button></div>
      </div>
    </Sheet>
  </section>;
}
