import { useMemo, useState } from "react";
import {
  Activity,
  Bell,
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Flame,
  Heart,
  Home,
  Medal,
  MoreHorizontal,
  Newspaper,
  Play,
  Plus,
  Shield,
  SlidersHorizontal,
  Trophy,
  UsersRound,
  X,
} from "lucide-react";
import "./styles.css";

const leaders = [
  {
    rank: 1,
    name: "Aiman Rahman",
    rating: 1248,
    movement: "+28",
    record: "28W/14L",
    avatar: "/aiman-portrait.png",
  },
  {
    rank: 2,
    name: "Haziq Azman",
    rating: 1221,
    movement: "+18",
    record: "24W/10L",
    avatar: "/players/haziq-azman.jpg",
  },
  {
    rank: 3,
    name: "Farid Iqbal",
    rating: 1187,
    movement: "-1",
    record: "20W/11L",
    avatar: "/players/farid-iqbal.jpg",
  },
  {
    rank: 4,
    name: "Nabil Rahman",
    rating: 1168,
    movement: "+9",
    record: "18W/12L",
    avatar: "/players/nabil-rahman.jpg",
  },
  {
    rank: 5,
    name: "Syafiq Halim",
    rating: 1157,
    movement: "+12",
    record: "17W/14L",
    avatar: "/players/syafiq-halim.jpg",
  },
  {
    rank: 6,
    name: "Daniel Nabil",
    rating: 1138,
    movement: "+4",
    record: "14W/13L",
    avatar: "/players/daniel-nabil.jpg",
  },
  {
    rank: 7,
    name: "Arif Hakim",
    rating: 1126,
    movement: "-7",
    record: "12W/13L",
    avatar: "/players/arif-hakim.jpg",
  },
];

const inForm = [
  {
    rank: 1,
    name: "Aiman Rahman",
    winRate: "67%",
    record: "28-14",
    avatar: "/aiman-portrait.png",
  },
  {
    rank: 2,
    name: "Haziq Azman",
    winRate: "79%",
    record: "11-3",
    avatar: "/players/haziq-azman.jpg",
  },
  {
    rank: 3,
    name: "Farid Iqbal",
    winRate: "64%",
    record: "7-4",
    avatar: "/players/farid-iqbal.jpg",
  },
  {
    rank: 4,
    name: "Syafiq Halim",
    winRate: "61%",
    record: "8-5",
    avatar: "/players/syafiq-halim.jpg",
  },
];

const movers = [
  {
    rank: 1,
    name: "Amir Hakim",
    badge: "W2",
    movement: "+42",
    avatar: "/players/amirul-fikri.jpg",
  },
  {
    rank: 2,
    name: "Nabil Rahman",
    badge: "W3",
    movement: "+31",
    avatar: "/players/nabil-rahman.jpg",
  },
  {
    rank: 3,
    name: "Arif Hakim",
    badge: "W1",
    movement: "+18",
    avatar: "/players/arif-hakim.jpg",
  },
];

const partners = [
  {
    left: { name: "Haziq Azman", avatar: "/players/haziq-azman.jpg" },
    right: { name: "Aiman Rahman", avatar: "/aiman-portrait.png" },
    record: "11W/3L",
    rate: "79%",
  },
  {
    left: { name: "Farid Iqbal", avatar: "/players/farid-iqbal.jpg" },
    right: { name: "Nabil Rahman", avatar: "/players/nabil-rahman.jpg" },
    record: "7W/4L",
    rate: "64%",
  },
  {
    left: { name: "Daniel Nabil", avatar: "/players/daniel-nabil.jpg" },
    right: { name: "Syafiq Halim", avatar: "/players/syafiq-halim.jpg" },
    record: "6W/5L",
    rate: "55%",
  },
];

const rivalries = [
  {
    rank: 1,
    left: { name: "Aiman Rahman", avatar: "/aiman-portrait.png" },
    right: { name: "Khairul Zaim", avatar: "/players/khairul-zaim.jpg" },
    score: "3 - 2",
    matches: "5 matches",
  },
  {
    rank: 2,
    left: { name: "Haziq Azman", avatar: "/players/haziq-azman.jpg" },
    right: { name: "Farid Iqbal", avatar: "/players/farid-iqbal.jpg" },
    score: "4 - 3",
    matches: "7 matches",
  },
  {
    rank: 3,
    left: { name: "Nabil Rahman", avatar: "/players/nabil-rahman.jpg" },
    right: { name: "Arif Hakim", avatar: "/players/arif-hakim.jpg" },
    score: "2 - 2",
    matches: "4 matches",
  },
];

const recentMatches = [
  {
    date: "Jun 28",
    session: "Session 24",
    score: "21-16",
    players: "Aiman / Haziq",
    opponents: "Daniel / Nabil",
  },
  {
    date: "Jun 24",
    session: "Session 23",
    score: "19-21",
    players: "Farid / Syafiq",
    opponents: "Khairul / Zaki",
  },
  {
    date: "Jun 21",
    session: "Session 22",
    score: "21-18",
    players: "Haziq / Nabil",
    opponents: "Arif / Daniel",
  },
];

const sessionNews = [
  {
    id: "rating-jump",
    show: true,
    label: "Rating jump",
    title: "Amir Hakim +42",
    meta: "Largest gain from the last session",
    value: "+42",
    tone: "positive",
    icon: Activity,
    avatar: "/players/amirul-fikri.jpg",
    likes: 12,
    liked: false,
  },
  {
    id: "perfect-session",
    show: true,
    label: "Perfect session",
    title: "Haziq Azman 4W/0L",
    meta: "Won every match played",
    value: "4W/0L",
    tone: "positive",
    icon: Shield,
    avatar: "/players/haziq-azman.jpg",
    likes: 8,
    liked: true,
  },
  {
    id: "upset",
    show: true,
    label: "Upset",
    title: "Farid / Syafiq beat Khairul / Zaki",
    meta: "Beat the higher-rated side",
    value: "Upset",
    tone: "gold",
    icon: Trophy,
    avatar: "/players/farid-iqbal.jpg",
    likes: 5,
    liked: false,
  },
  {
    id: "streak",
    show: true,
    label: "Streak",
    title: "Nabil Rahman W5",
    meta: "Win streak extended",
    value: "W5",
    tone: "positive",
    icon: Flame,
    avatar: "/players/nabil-rahman.jpg",
    likes: 10,
    liked: false,
  },
  {
    id: "bounce-back",
    show: true,
    label: "Bounce back",
    title: "Arif Hakim 3W/1L",
    meta: "Recovered from 0W/3L",
    value: "+18",
    tone: "positive",
    icon: Activity,
    avatar: "/players/arif-hakim.jpg",
    likes: 6,
    liked: false,
  },
  {
    id: "new-peak",
    show: false,
    label: "New peak",
    title: "Aiman Rahman hit 1248",
    meta: "New personal best rating",
    value: "1248",
    tone: "positive",
    icon: Medal,
    avatar: "/aiman-portrait.png",
    likes: 0,
    liked: false,
  },
];

const activeNews = sessionNews.filter((item) => item.show);

const activity = [
  { label: "Members", value: "24", icon: UsersRound },
  { label: "Matches", value: "42", icon: Trophy },
  { label: "Sessions", value: "12", icon: CalendarDays },
  { label: "Last played", value: "Jun 28", icon: Clock3 },
];

const navItems = [
  { label: "Overview", icon: Home },
  { label: "Tournaments", icon: Trophy },
  { label: "Host", icon: SlidersHorizontal },
  { label: "Leaderboard", icon: Medal },
  { label: "Profile", icon: CircleUserRound },
];

function Avatar({ src, name, size = "md" }) {
  return (
    <img
      className={`avatar avatar-${size}`}
      src={src}
      alt={`${name} avatar`}
      draggable="false"
    />
  );
}

function SectionHeader({ icon: Icon, title, action = "View all", onAction }) {
  return (
    <div className="section-header">
      <div className="section-title">
        <Icon size={23} strokeWidth={2} />
        <h2>{title}</h2>
      </div>
      <button className="link-button" type="button" onClick={onAction}>
        {action}
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

function Popover({ title, children, onClose }) {
  return (
    <div className="popover-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="popover"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="popover-header">
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={21} />
          </button>
        </div>
        <div className="popover-body">{children}</div>
      </section>
    </div>
  );
}

function ClubHeader({ onCreate, onActions }) {
  return (
    <header className="club-header">
      <div className="club-identity">
        <div className="club-mark">AS</div>
        <div>
          <h1>Anti-Selek</h1>
          <div className="club-chips">
            <span>
              <UsersRound size={17} />
              24 players
            </span>
            <span>
              <span className="live-dot" />
              Live
            </span>
          </div>
        </div>
      </div>
      <div className="header-actions">
        <button className="icon-button" type="button" aria-label="Alerts" onClick={onActions}>
          <Bell size={22} />
        </button>
        <button className="icon-button" type="button" aria-label="Create" onClick={onCreate}>
          <Trophy size={23} />
        </button>
      </div>
    </header>
  );
}

function PodiumPlayer({ player, placement }) {
  const isFirst = placement === "first";
  const movementClass = player.movement.startsWith("-") ? "negative" : "positive";

  return (
    <button className={`podium-player ${placement}`} type="button">
      <span className={`podium-rank rank-${player.rank}`}>{player.rank}</span>
      <Avatar src={player.avatar} name={player.name} size={isFirst ? "xl" : "lg"} />
      <strong>{player.name}</strong>
      <span className="podium-rating">{player.rating}</span>
      <span className="podium-record">{player.record}</span>
      <span className={`movement-pill ${movementClass}`}>{player.movement}</span>
    </button>
  );
}

function LeaderboardPodium({ onViewAll }) {
  const [first, second, third] = leaders;

  return (
    <section className="panel podium-panel">
      <SectionHeader icon={Activity} title="Leaderboard" onAction={onViewAll} />
      <div className="podium-stage">
        <PodiumPlayer player={second} placement="second" />
        <PodiumPlayer player={first} placement="first" />
        <PodiumPlayer player={third} placement="third" />
      </div>
    </section>
  );
}

function SessionCard({ onOpen }) {
  return (
    <section className="session-card">
      <div className="session-icon">
        <CalendarDays size={30} />
      </div>
      <div className="session-copy">
        <h2>Friday Mexicano</h2>
        <div className="session-meta">
          <span>
            <span className="live-dot" />
            Live
          </span>
          <span>16 players</span>
          <span>3 courts</span>
        </div>
      </div>
      <button className="primary-button" type="button" onClick={onOpen}>
        Open
        <ChevronRight size={19} />
      </button>
    </section>
  );
}

function PulseStrip() {
  return (
    <section className="pulse-strip" aria-label="Club pulse">
      {activity.map((item) => {
        const Icon = item.icon;

        return (
          <article className="pulse-item" key={item.label}>
            <Icon size={24} strokeWidth={1.9} />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        );
      })}
    </section>
  );
}

function InFormList({ onViewAll }) {
  return (
    <section className="panel list-panel">
      <SectionHeader icon={Flame} title="In form" onAction={onViewAll} />
      <div className="rank-list">
        {inForm.slice(0, 3).map((player) => (
          <button className="rank-row form-row" type="button" key={player.name}>
            <span className="list-rank">{player.rank}</span>
            <Avatar src={player.avatar} name={player.name} size="md" />
            <strong className="row-name">{player.name}</strong>
            <span className="stat-cell">
              <em>Win rate</em>
              <b>{player.winRate}</b>
            </span>
            <span className="stat-cell">
              <em>W/L</em>
              <b>{player.record}</b>
            </span>
            <ChevronRight size={19} />
          </button>
        ))}
      </div>
    </section>
  );
}

function MoversList({ onViewAll }) {
  return (
    <section className="panel list-panel">
      <SectionHeader icon={Activity} title="Rating movers" onAction={onViewAll} />
      <div className="rank-list">
        {movers.map((player) => (
          <button className="rank-row mover-row" type="button" key={player.name}>
            <span className="list-rank">{player.rank}</span>
            <Avatar src={player.avatar} name={player.name} size="md" />
            <strong className="row-name">{player.name}</strong>
            <span className="mini-pill">{player.badge}</span>
            <b className="move-value">{player.movement}</b>
            <ChevronRight size={19} />
          </button>
        ))}
      </div>
    </section>
  );
}

function LatestSession({ onOpen }) {
  return (
    <section className="panel latest-panel">
      <SectionHeader icon={CalendarDays} title="Latest session" onAction={onOpen} />
      <div className="latest-card">
        <div className="latest-icon">
          <Trophy size={38} />
        </div>
        <div className="latest-copy">
          <h3>Monday Mexicano</h3>
          <p>May 18 - 12 matches</p>
          <span>
            MVP <Avatar src="/players/amirul-fikri.jpg" name="Amir Hakim" size="xs" />
            Amir Hakim +5 rating
          </span>
        </div>
        <button className="primary-button small" type="button" onClick={onOpen}>
          Results
          <ChevronRight size={17} />
        </button>
      </div>
    </section>
  );
}

function NewsRows({ limit, reactions, onToggleLike }) {
  const rows = typeof limit === "number" ? activeNews.slice(0, limit) : activeNews;

  return (
    <div className="news-list">
      {rows.map((item) => {
        const Icon = item.icon;
        const reaction = reactions?.[item.id] ?? { count: item.likes, liked: item.liked };

        return (
          <article className={`news-row ${item.tone}`} key={item.id}>
            <span className="news-visual">
              <Avatar src={item.avatar} name={item.title} size="md" />
              <span className="news-marker" aria-hidden="true">
                <Icon size={13} strokeWidth={2.1} />
              </span>
            </span>
            <span className="news-copy">
              <strong>{item.title}</strong>
              <em>{item.meta}</em>
            </span>
            <span className="news-actions">
              <b className="news-value">{item.value}</b>
              <button
                className={`news-like ${reaction.liked ? "liked" : ""}`}
                type="button"
                aria-label={`${reaction.liked ? "Unlike" : "Like"} ${item.title}`}
                aria-pressed={reaction.liked}
                onClick={() => onToggleLike?.(item.id)}
              >
                <Heart size={15} strokeWidth={2.2} />
                <span>{reaction.count}</span>
              </button>
            </span>
          </article>
        );
      })}
    </div>
  );
}

function SessionNews({ onViewAll, reactions, onToggleLike }) {
  if (activeNews.length === 0) {
    return null;
  }

  return (
    <section className="panel news-panel">
      <SectionHeader icon={Newspaper} title="Session news" onAction={onViewAll} />
      <NewsRows limit={3} reactions={reactions} onToggleLike={onToggleLike} />
    </section>
  );
}

function RivalryCard({ onOpen }) {
  return (
    <section className="panel rivalry-panel">
      <SectionHeader icon={Trophy} title="Top rivalry" onAction={onOpen} />
      <div className="rivalry-list">
        {rivalries.map((rivalry) => (
          <button className="rivalry-row" type="button" key={`${rivalry.left.name}-${rivalry.right.name}`}>
            <span className="list-rank">{rivalry.rank}</span>
            <Avatar src={rivalry.left.avatar} name={rivalry.left.name} size="sm" />
            <strong className="rival-name">{rivalry.left.name}</strong>
            <span className="rival-score">
              <strong>{rivalry.score}</strong>
            </span>
            <strong className="rival-name">{rivalry.right.name}</strong>
            <Avatar src={rivalry.right.avatar} name={rivalry.right.name} size="sm" />
            <ChevronRight size={19} />
          </button>
        ))}
      </div>
    </section>
  );
}

function PartnerChemistry({ onViewAll }) {
  return (
    <section className="panel partners-panel">
      <SectionHeader icon={UsersRound} title="Partner chemistry" onAction={onViewAll} />
      <div className="partner-list">
        {partners.map((partner) => (
          <button className="partner-row" type="button" key={`${partner.left.name}-${partner.right.name}`}>
            <span className="partner-avatars">
              <Avatar src={partner.left.avatar} name={partner.left.name} size="md" />
              <span>+</span>
              <Avatar src={partner.right.avatar} name={partner.right.name} size="md" />
            </span>
            <span className="partner-name">
              <strong>{partner.left.name}</strong>
              <strong>+ {partner.right.name}</strong>
            </span>
            <span className="partner-record">
              <strong>{partner.record}</strong>
              <em>{partner.rate}</em>
            </span>
            <ChevronRight size={19} />
          </button>
        ))}
      </div>
    </section>
  );
}

function RecentMatchesList({ onViewAll }) {
  return (
    <section className="panel list-panel">
      <SectionHeader icon={CalendarDays} title="Recent matches" onAction={onViewAll} />
      <div className="match-list">
        {recentMatches.map((match) => (
          <button className="match-row" type="button" key={`${match.date}-${match.score}`}>
            <span>
              <strong>{match.date}</strong>
              <em>{match.session}</em>
            </span>
            <span>
              <em>{match.players}</em>
            </span>
            <strong className="match-score">{match.score}</strong>
            <span>
              <strong>{match.opponents}</strong>
            </span>
            <ChevronRight size={19} />
          </button>
        ))}
      </div>
    </section>
  );
}

function LeaderboardRows() {
  return (
    <div className="modal-list">
      {leaders.map((player) => {
        const movementClass = player.movement.startsWith("-") ? "negative" : "positive";

        return (
          <button className="modal-row" type="button" key={player.name}>
            <span className="list-rank">{player.rank}</span>
            <Avatar src={player.avatar} name={player.name} size="md" />
            <span>
              <strong>{player.name}</strong>
              <em>{player.record}</em>
            </span>
            <span>
              <strong>{player.rating}</strong>
              <em className={movementClass}>{player.movement}</em>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SimpleModalList({ type, newsReactions, onToggleNewsLike }) {
  if (type === "matches") {
    return <RecentMatchesList onViewAll={() => {}} />;
  }

  if (type === "news") {
    return <NewsRows reactions={newsReactions} onToggleLike={onToggleNewsLike} />;
  }

  if (type === "partners") {
    return <PartnerChemistry onViewAll={() => {}} />;
  }

  const rows = type === "movers" ? movers : inForm;

  return (
    <div className="modal-list">
      {rows.map((row) => (
        <button className="modal-row" type="button" key={row.name}>
          <span className="list-rank">{row.rank}</span>
          <Avatar src={row.avatar} name={row.name} size="md" />
          <span>
            <strong>{row.name}</strong>
            <em>{"winRate" in row ? `${row.winRate} - ${row.record}` : row.badge}</em>
          </span>
          <span>
            <strong>{"movement" in row ? row.movement : "W/L"}</strong>
          </span>
        </button>
      ))}
    </div>
  );
}

function BottomNav({ activeNav, setActiveNav }) {
  return (
    <nav className="bottom-nav" aria-label="Club navigation">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = activeNav === item.label;

        return (
          <button
            className={`nav-item ${active ? "active" : ""}`}
            type="button"
            key={item.label}
            onClick={() => setActiveNav(item.label)}
          >
            <Icon size={22} strokeWidth={active ? 2.1 : 1.85} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function App() {
  const [modal, setModal] = useState(null);
  const [activeNav, setActiveNav] = useState("Overview");
  const [newsReactions, setNewsReactions] = useState(() =>
    Object.fromEntries(
      sessionNews.map((item) => [item.id, { count: item.likes, liked: item.liked }]),
    ),
  );
  const toggleNewsLike = (id) => {
    setNewsReactions((current) => {
      const reaction = current[id] ?? { count: 0, liked: false };
      const liked = !reaction.liked;

      return {
        ...current,
        [id]: {
          liked,
          count: Math.max(0, reaction.count + (liked ? 1 : -1)),
        },
      };
    });
  };
  const modalTitle = useMemo(
    () =>
      ({
        leaderboard: "Leaderboard",
        form: "In form",
        movers: "Rating movers",
        latest: "Latest session",
        news: "Session news",
        rivalry: "Top rivalry",
        partners: "Partner chemistry",
        matches: "Recent matches",
        session: "Friday Mexicano",
        actions: "Club actions",
        create: "Create",
      })[modal] ?? "",
    [modal],
  );

  return (
    <main className="app-shell">
      <ClubHeader onCreate={() => setModal("create")} onActions={() => setModal("actions")} />

      <div className="content-stack">
        <SessionCard onOpen={() => setModal("session")} />
        <PulseStrip />
        <SessionNews
          onViewAll={() => setModal("news")}
          reactions={newsReactions}
          onToggleLike={toggleNewsLike}
        />
        <InFormList onViewAll={() => setModal("form")} />
        <MoversList onViewAll={() => setModal("movers")} />
        <LatestSession onOpen={() => setModal("latest")} />
        <RivalryCard onOpen={() => setModal("rivalry")} />
        <PartnerChemistry onViewAll={() => setModal("partners")} />
        <RecentMatchesList onViewAll={() => setModal("matches")} />
      </div>

      <BottomNav activeNav={activeNav} setActiveNav={setActiveNav} />

      {modal ? (
        <Popover title={modalTitle} onClose={() => setModal(null)}>
          {modal === "leaderboard" ? <LeaderboardRows /> : null}
          {modal === "form" || modal === "movers" || modal === "matches" || modal === "partners" || modal === "news" ? (
            <SimpleModalList
              type={modal}
              newsReactions={newsReactions}
              onToggleNewsLike={toggleNewsLike}
            />
          ) : null}
          {modal === "session" || modal === "latest" || modal === "rivalry" ? (
            <div className="action-list">
              <button type="button">Open details</button>
              <button type="button">View matches</button>
              <button type="button">Share</button>
            </div>
          ) : null}
          {modal === "actions" || modal === "create" ? (
            <div className="action-list">
              <button type="button">Start session</button>
              <button type="button">Invite member</button>
              <button type="button">Club settings</button>
            </div>
          ) : null}
        </Popover>
      ) : null}
    </main>
  );
}
