"use client";

import { useRef, useState } from "react";
import { CaretRight, Check, Minus, Plus, MagnifyingGlass, Shuffle, Scales, ChartBar, UsersThree, Trash, X } from "@phosphor-icons/react";
import type { ClubPageMember } from "@/components/club/clubTypes";
import { Avatar, Sheet, ErrorText } from "./Primitives";
import { api, useAction } from "./api";
import "./session-setup.css";

type Gender = "MALE" | "FEMALE" | "UNSPECIFIED";
type Pool = "A" | "B";
type Guest = { id: string; name: string; initialElo: number; gender: Gender; pool: Pool };
const formats = [
  { id: "BALANCED", name: "Balanced", description: "More variety, while keeping teams balanced.", icon: Scales },
  { id: "SOCIAL", name: "Social", description: "Prioritize playing with different people.", icon: Shuffle },
  { id: "LEVEL_MATCH", name: "Level match", description: "Bring players of similar ability together.", icon: ChartBar },
] as const;

function Toggle({ title, hint, checked, onChange }: { title: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="setup-toggle"><span><strong>{title}</strong><small>{hint}</small></span><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span className="setup-switch" aria-hidden="true" /></label>;
}

export function SessionSetup({ clubId, members: rosterMembers, onCreated }: { clubId: string; members: ClubPageMember[]; onCreated: (code: string) => void }) {
  const identities = new Set<string>();
  const memberIds = new Set([...rosterMembers].sort((a, b) => Number(b.isClaimed) - Number(a.isClaimed)).filter(member => {
    const key = member.offlineIdentityId ? `identity:${member.offlineIdentityId}` : `user:${member.id}`;
    if (identities.has(key)) return false;
    identities.add(key);
    return true;
  }).map(member => member.id));
  const members = rosterMembers.filter(member => memberIds.has(member.id));
  const [name, setName] = useState("");
  const [courts, setCourts] = useState(2);
  const [selected, setSelected] = useState<string[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [style, setStyle] = useState<(typeof formats)[number]["id"]>("BALANCED");
  const [metric, setMetric] = useState("RATING");
  const [mixed, setMixed] = useState(false);
  const [groups, setGroups] = useState(false);
  const [crossover, setCrossover] = useState("BALANCED");
  const [autoQueue, setAutoQueue] = useState(false);
  const [respectRest, setRespectRest] = useState(true);
  const [pools, setPools] = useState<Record<string, Pool>>({});
  const [genders, setGenders] = useState<Record<string, Gender>>({});
  const [rosterOpen, setRosterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const [addingGuest, setAddingGuest] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestRating, setGuestRating] = useState("1000");
  const [guestGender, setGuestGender] = useState<Gender>("UNSPECIFIED");
  const [guestError, setGuestError] = useState("");
  const action = useAction();
  const players = members.filter(p => selected.includes(p.id));
  const count = players.length + guests.length;
  const getPool = (p: ClubPageMember) => pools[p.id] ?? p.preferredPool ?? "B";
  const getGender = (p: ClubPageMember) => genders[p.id] ?? p.gender ?? "UNSPECIFIED";
  const competitive = players.filter(p => getPool(p) === "A").length + guests.filter(g => g.pool === "A").length;
  const visibleMembers = members.filter(p => p.name.toLowerCase().includes(search.trim().toLowerCase()));
  function togglePlayer(id: string) { setSelected(ids => ids.includes(id) ? ids.filter(p => p !== id) : [...ids, id]); }
  function addGuest() {
    const clean = guestName.trim();
    if (clean.length < 2) return setGuestError("Use at least two characters for the guest’s name.");
    if (guests.some(g => g.name.toLowerCase() === clean.toLowerCase())) return setGuestError("That guest is already on the list.");
    if (rosterMembers.some(p => p.name.trim().toLowerCase() === clean.toLowerCase())) return setGuestError("That name belongs to a club member. Select them from the player list.");
    const rating = Number(guestRating);
    if (!guestRating.trim() || !Number.isInteger(rating) || rating < 0 || rating > 5000) return setGuestError("Enter a whole-number rating from 0 to 5000.");
    setGuests(list => [...list, { id: crypto.randomUUID(), name: clean, initialElo: rating, gender: guestGender, pool: "B" }]);
    setGuestName(""); setGuestRating("1000"); setGuestGender("UNSPECIFIED"); setGuestError(""); setAddingGuest(false);
  }
  function prepare() {
    void action.run(async () => {
      if (!name.trim()) throw new Error("Give this session a name.");
      if (count < 2) throw new Error("Choose at least two players or guests.");
      if (mixed && (players.some(p => getGender(p) === "UNSPECIFIED") || guests.some(g => g.gender === "UNSPECIFIED"))) throw new Error("Open the player list and set a gender for everyone before using mixed pairs.");
      if (groups && (competitive < 2 || count - competitive < 2)) throw new Error("Open the player list and assign at least two players to each group.");
      const created = await api<{ code: string }>("/api/sessions", "POST", {
        name: name.trim(), clubId, courtCount: courts, scoringType: "POINTS", matchmakingStyle: style,
        balanceMetric: metric, pairingMode: mixed ? "MIXED" : "OPEN", collabFormat: "FREE_PLAY",
        playerIds: players.map(p => p.id), playerConfigs: players.map(p => ({ userId: p.id, pool: getPool(p), ...(genders[p.id] ? { gender: genders[p.id] } : {}) })),
        guestConfigs: guests.map(({ name, initialElo, gender, pool }) => ({ name, initialElo, gender, pool })),
        poolsEnabled: groups, crossoverFrequency: crossover, autoQueueEnabled: autoQueue, respectPlayerRest: respectRest, isTest: false,
      });
      onCreated(created.code);
    });
  }
  return <section className="session-setup" aria-label="Session setup">
    <div className="setup-intro"><span className="eyebrow">LET’S PLAY</span><h1>Make it your session.</h1></div>
    <form onSubmit={e => { e.preventDefault(); prepare(); }}>
      <fieldset disabled={action.busy} className="setup-fields">
        <section className="setup-section" aria-labelledby="setup-basics">
          <h2 id="setup-basics">The essentials</h2>
          <label className="field-label">Session name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sunday rallies" required /></label>
          <div className="setup-courts"><span><strong>Courts</strong><small>Available for this session</small></span><div className="setup-stepper"><button type="button" aria-label="Fewer courts" disabled={courts === 1} onClick={() => setCourts(n => n - 1)}><Minus size={18} /></button><output aria-label="Court count" aria-live="polite">{courts}</output><button type="button" aria-label="More courts" disabled={courts === 10} onClick={() => setCourts(n => n + 1)}><Plus size={18} /></button></div></div>
        </section>

        <section className="setup-section" aria-labelledby="setup-players"><h2 id="setup-players">Who’s playing?</h2>
          <button type="button" className="setup-roster-summary" onClick={() => setRosterOpen(true)} aria-haspopup="dialog">
            <span className="setup-roster-faces" aria-hidden="true">{players.slice(0, 3).map(p => <Avatar key={p.id} name={p.name} url={p.avatarUrl} />)}{!players.length && <UsersThree size={28} />}</span>
            <span><strong>{count} {count === 1 ? "player" : "players"}</strong><small>{guests.length ? `${guests.length} ${guests.length === 1 ? "guest" : "guests"} included · Edit list` : "Choose players & add guests"}</small></span><CaretRight size={18} />
          </button>
          {count < 4 && <p className="setup-hint">You’ll need four players to start a doubles game.</p>}
        </section>

        <section className="setup-section" aria-labelledby="setup-matches"><h2 id="setup-matches">How should we match?</h2>
          <div className="setup-format-list" role="radiogroup" aria-label="Matchmaking style">{formats.map(({ id, name, description, icon: Icon }) => <label key={id} className={`setup-format ${style === id ? "is-selected" : ""}`}><input type="radio" name="matchmaking" value={id} checked={style === id} onChange={() => setStyle(id)} /><Icon size={24} weight="duotone" aria-hidden="true" /><span><strong>{name}</strong><small>{description}</small></span><span className="setup-radio-mark" aria-hidden="true">{style === id && <Check size={13} weight="bold" />}</span></label>)}</div>
          {style !== "SOCIAL" && <fieldset className="setup-metric"><legend>Balance teams using</legend><div className="setup-segments">{[{ id: "RATING", name: "Club rating" }, { id: "SESSION_POINTS", name: "Session points" }].map(option => <label key={option.id}><input type="radio" name="balance" value={option.id} checked={metric === option.id} onChange={() => setMetric(option.id)} /><span>{option.name}</span></label>)}</div><p className="setup-hint">{metric === "RATING" ? "Use each player’s current rating." : "Use points earned during this session."}</p></fieldset>}
        </section>

        <details className="setup-options"><summary><span><strong>More options</strong><small>Pairing, groups & session controls</small></span><CaretRight size={18} /></summary><div className="setup-options-content">
          <Toggle title="Mixed pairs" hint="Build mixed-gender teams." checked={mixed} onChange={setMixed} />
          {mixed && <button type="button" className="setup-inline-action" onClick={() => setRosterOpen(true)}>Review player genders<CaretRight size={16} /></button>}
          <Toggle title="Player groups" hint="Separate Competitive and Social groups." checked={groups} onChange={setGroups} />
          {groups && <div className="setup-group-options"><button type="button" className="setup-inline-action" onClick={() => setRosterOpen(true)}>{competitive} Competitive · {count - competitive} Social<CaretRight size={16} /></button><label className="field-label">Mix groups<select aria-label="Mix groups" value={crossover} onChange={e => setCrossover(e.target.value)}><option value="OCCASIONAL">Occasionally</option><option value="BALANCED">Sometimes</option><option value="FREQUENT">Often</option></select></label></div>}
          <Toggle title="Prepare the next game" hint="Automatically keep the next match queued." checked={autoQueue} onChange={setAutoQueue} />
          <Toggle title="Respect extra rest" hint="Use players’ saved rest preferences." checked={respectRest} onChange={setRespectRest} />
        </div></details>
      </fieldset>
      <div className="setup-submit"><ErrorText error={action.error} /><button className="primary full" type="submit" disabled={action.busy}>{action.busy ? "Preparing…" : "Prepare session"}<CaretRight size={18} /></button><p>Players won’t start until you’re ready.</p></div>
    </form>

    <Sheet open={rosterOpen} title="Who’s playing?" onClose={() => { setRosterOpen(false); setAddingGuest(false); }}>
      <div className="setup-roster-sheet"><div className="setup-roster-tools"><strong>{count} selected</strong></div>
        <div className="setup-search"><MagnifyingGlass size={18} aria-hidden="true" /><input ref={searchInput} aria-label="Find a player" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a player" />{search && <button type="button" className="setup-search-clear" aria-label="Clear player search" onClick={() => { setSearch(""); searchInput.current?.focus(); }}><X size={18} aria-hidden="true" /></button>}</div>
        <div className="setup-roster-list">{visibleMembers.map(p => <div key={p.id} className="setup-person"><label className="setup-person-select"><input type="checkbox" checked={selected.includes(p.id)} onChange={() => togglePlayer(p.id)} /><Avatar name={p.name} url={p.avatarUrl} /><span><strong>{p.name}</strong><small>{p.status === "CORE" ? "Core" : "Occasional"} · {p.elo}</small></span></label>{selected.includes(p.id) && (mixed || groups) && <div className="setup-person-options">{mixed && <label>Gender<select value={getGender(p)} onChange={e => setGenders(g => ({ ...g, [p.id]: e.target.value as Gender }))} aria-label={`Gender for ${p.name}`}><option value="UNSPECIFIED">Choose</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label>}{groups && <label>Group<select value={getPool(p)} onChange={e => setPools(g => ({ ...g, [p.id]: e.target.value as Pool }))} aria-label={`Group for ${p.name}`}><option value="A">Competitive</option><option value="B">Social</option></select></label>}</div>}</div>)}{!visibleMembers.length && <p className="setup-hint">No players found.</p>}</div>
        {guests.length > 0 && <div className="setup-guests"><h3>Guests</h3>{guests.map(g => <div className="setup-person" key={g.id}><div className="setup-guest-heading"><Avatar name={g.name} /><span><strong>{g.name}</strong><small>Guest · {g.initialElo}</small></span><button type="button" className="icon-button" aria-label={`Remove guest ${g.name}`} onClick={() => setGuests(list => list.filter(item => item.id !== g.id))}><Trash size={18} /></button></div>{(mixed || groups) && <div className="setup-person-options">{mixed && <label>Gender<select aria-label={`Gender for ${g.name}`} value={g.gender} onChange={e => setGuests(list => list.map(item => item.id === g.id ? { ...item, gender: e.target.value as Gender } : item))}><option value="UNSPECIFIED">Choose</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label>}{groups && <label>Group<select aria-label={`Group for ${g.name}`} value={g.pool} onChange={e => setGuests(list => list.map(item => item.id === g.id ? { ...item, pool: e.target.value as Pool } : item))}><option value="A">Competitive</option><option value="B">Social</option></select></label>}</div>}</div>)}</div>}
        {addingGuest ? <div className="setup-add-guest"><h3>Add a guest</h3><label className="field-label">Guest name<input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Name" /></label><label className="field-label">Starting rating<input type="number" inputMode="numeric" min={0} max={5000} step={1} value={guestRating} onChange={e => setGuestRating(e.target.value)} /></label>{mixed && <label className="field-label">Gender<select value={guestGender} onChange={e => setGuestGender(e.target.value as Gender)}><option value="UNSPECIFIED">Choose</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label>}<ErrorText error={guestError} /><div className="setup-guest-actions"><button type="button" className="secondary" onClick={() => setAddingGuest(false)}>Cancel</button><button type="button" className="primary" onClick={addGuest}>Add guest</button></div></div> : <button type="button" className="secondary full" onClick={() => setAddingGuest(true)}><Plus size={18} />Add guest</button>}
        <div className="setup-roster-done"><button type="button" className="primary full" onClick={() => setRosterOpen(false)}>Done · {count} players</button></div>
      </div>
    </Sheet>
  </section>;
}
