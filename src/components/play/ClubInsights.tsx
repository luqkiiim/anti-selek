"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Heart } from "@phosphor-icons/react";
import type { ClubPagePulse } from "@/components/club/clubTypes";
import { PlayAvatar, PlayRow } from "./PlayShell";
function News({
  item,
  clubId,
  readOnly,
}: {
  item: ClubPagePulse["sessionNews"][number];
  clubId: string;
  readOnly: boolean;
}) {
  const [reaction, setReaction] = useState({
    liked: item.likedByMe,
    count: item.likeCount,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function like() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/clubs/${clubId}/news-likes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsItemId: item.id, liked: !reaction.liked }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not save reaction");
      setReaction({ liked: d.likedByMe, count: d.likeCount });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="surface">
      <span className="eyebrow">{item.session.name}</span>
      <h3>{item.title}</h3>
      <p className="quiet">{item.detail}</p>
      <div className="section-head">
        <Link className="text-button" href={`/session/${item.session.code}`}>
          View session
        </Link>
        <button
          className="icon-button"
          disabled={busy || readOnly}
          aria-label={reaction.liked ? "Unlike news" : "Like news"}
          aria-pressed={reaction.liked}
          onClick={() => void like()}
        >
          <Heart size={20} weight={reaction.liked ? "fill" : "regular"} />
          {reaction.count}
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </article>
  );
}
export function ClubInsights({
  pulse,
  clubId,
  readOnly = false,
}: {
  pulse: ClubPagePulse | null;
  clubId: string;
  readOnly?: boolean;
}) {
  const search = useSearchParams();
  const [tab, setTab] = useState(
    search.get("view") === "connections" ? "connections" : "overview",
  );
  if (!pulse)
    return (
      <p className="quiet">
        Club statistics are unavailable. Return to the club and try again.
      </p>
    );
  return (
    <>
      <span className="eyebrow">OUR STORY SO FAR</span>
      <h1>Better together.</h1>
      <div className="stat-grid">
        {[
          ["Players", pulse.metrics.members],
          ["Sessions", pulse.metrics.totalSessions],
          ["Games", pulse.metrics.totalMatches],
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <small>{label}</small>
          </div>
        ))}
      </div>
      <nav className="local-tabs" aria-label="Club insights">
        {["overview", "connections", "activity"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      {tab === "overview" && (
        <>
          {[
            { title: "On a roll", players: pulse.hotPlayers },
            { title: "Rating movers", players: pulse.ratingMovers },
          ].map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              <div className="link-group">
                {group.players.length ? (
                  group.players.map((p) => (
                    <PlayRow
                      key={p.user.id}
                      icon={
                        <PlayAvatar name={p.user.name} url={p.user.avatarUrl} />
                      }
                      title={p.user.name}
                      sub={`${p.wins}W / ${p.losses}L · ${p.ratingChange > 0 ? "+" : ""}${p.ratingChange} rating`}
                      href={`/profile/${p.user.id}?clubId=${clubId}`}
                    />
                  ))
                ) : (
                  <p className="quiet">The next games will start the story.</p>
                )}
              </div>
            </section>
          ))}
          <h3>Around the club</h3>
          {pulse.sessionNews.length ? (
            pulse.sessionNews.map((n) => (
              <News key={n.id} item={n} clubId={clubId} readOnly={readOnly} />
            ))
          ) : (
            <p className="quiet">Highlights will appear as you play.</p>
          )}
        </>
      )}
      {tab === "connections" && (
        <>
          <h3>Top rivalries</h3>
          {pulse.rivalries.length ? (
            pulse.rivalries.map((r) => (
              <article
                className="surface rivalry"
                key={r.players.map((p) => p.id).join(":")}
              >
                <div className="rivalry-pair">
                  {r.players.map((p, i) => (
                    <Link key={p.id} href={`/profile/${p.id}?clubId=${clubId}`}>
                      <PlayAvatar name={p.name} url={p.avatarUrl} />
                      <strong>{p.name}</strong>
                      <b>{i === 0 ? r.playerOneWins : r.playerTwoWins}</b>
                    </Link>
                  ))}
                </div>
                <small>{r.matches} games against each other</small>
                {r.lastSession && (
                  <Link
                    className="text-button"
                    href={`/session/${r.lastSession.code}`}
                  >
                    Latest meeting
                  </Link>
                )}
              </article>
            ))
          ) : (
            <p className="quiet">
              Rivalries emerge as players face each other.
            </p>
          )}
          <h3>Winning partnerships</h3>
          {pulse.partnerships.length ? (
            pulse.partnerships.map((r) => (
              <article
                className="surface"
                key={r.players.map((p) => p.id).join(":")}
              >
                <div className="rivalry-pair">
                  {r.players.map((p) => (
                    <Link key={p.id} href={`/profile/${p.id}?clubId=${clubId}`}>
                      <PlayAvatar name={p.name} url={p.avatarUrl} />
                      <strong>{p.name}</strong>
                    </Link>
                  ))}
                </div>
                <p className="quiet">
                  {r.wins}W / {r.losses}L · {Math.round(r.winRate)}% win rate
                </p>
              </article>
            ))
          ) : (
            <p className="quiet">
              Play together to build your partnership record.
            </p>
          )}
        </>
      )}
      {tab === "activity" && (
        <>
          <h3>Recent games</h3>
          {pulse.recentMatches.length ? (
            pulse.recentMatches.map((m) => (
              <Link
                className="match-result"
                key={m.id}
                href={`/session/${m.session.code}/history`}
              >
                <div>
                  <strong>{m.team1.map((p) => p.name).join(" & ")}</strong>
                  <small>vs {m.team2.map((p) => p.name).join(" & ")}</small>
                  <small>{m.session.name}</small>
                </div>
                <b>
                  {m.team1Score}–{m.team2Score}
                </b>
              </Link>
            ))
          ) : (
            <p className="quiet">No completed games yet.</p>
          )}
        </>
      )}
    </>
  );
}
