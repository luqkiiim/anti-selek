import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Award,
  BarChart3,
  CalendarDays,
  Camera,
  Flame,
  LayoutGrid,
  Medal,
  MoreVertical,
  Share2,
  ShieldCheck,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Trash2,
  Users,
  X,
} from "lucide-react";

const tabs = ["Overview", "Matches", "Stats", "Achievements"];
const ranges = ["30D", "90D", "1Y", "All"];

const performanceStats = [
  { icon: Trophy, label: "Win rate", value: "67%" },
  { icon: LayoutGrid, label: "Matches played", value: "42" },
  { icon: Target, label: "Points scored", value: "896" },
  { icon: ShieldCheck, label: "Points conceded", value: "810" },
  { icon: TrendingUp, label: "Point diff", value: "+86" },
  { icon: Flame, label: "Recent form", value: "3-1" },
];

const achievements = [
  {
    title: "Strong Start",
    progress: "1/2",
    tone: "teal",
    icon: Flame,
    criteria: "Win 2 of your first 3 recorded matches.",
  },
  {
    title: "Win Streak Master",
    progress: "3/5",
    tone: "gold",
    icon: Star,
    criteria: "Win 5 matches in a row.",
  },
  {
    title: "Perfect Session",
    progress: "2/3",
    tone: "teal",
    icon: Award,
    criteria: "Finish 3 sessions unbeaten.",
  },
  {
    title: "Reliable Partner",
    progress: "28/50",
    tone: "silver",
    icon: Users,
    criteria: "Complete 50 matches with recorded partners.",
  },
  {
    title: "Clutch Finish",
    progress: "2/2",
    tone: "teal",
    icon: Target,
    criteria: "Win 2 matches by 2 points.",
  },
  {
    title: "Podium Regular",
    progress: "4/5",
    tone: "gold",
    icon: Medal,
    criteria: "Finish top 3 in 5 sessions.",
  },
  {
    title: "Point Saver",
    progress: "18/25",
    tone: "teal",
    icon: ShieldCheck,
    criteria: "Win 25 matches while conceding under 15 points.",
  },
  {
    title: "Fast Climber",
    progress: "86/100",
    tone: "gold",
    icon: TrendingUp,
    criteria: "Gain 100 rating points across recent sessions.",
  },
  {
    title: "Club Regular",
    progress: "12/20",
    tone: "silver",
    icon: CalendarDays,
    criteria: "Play in 20 club sessions.",
  },
  {
    title: "Table Leader",
    progress: "1/1",
    tone: "teal",
    icon: Trophy,
    criteria: "Reach #1 on the club leaderboard.",
  },
];
const achievementsPreviewCount = 6;

const matches = [
  {
    date: "May 18",
    year: "2025",
    score: "21-16",
    meta: "Session 12",
    partner: "Haziq Azman",
    partnerAvatar: "/players/haziq-azman.jpg",
    opponents: "Daniel Nabil / Khairul Zaim",
    opponentAvatars: ["/players/daniel-nabil.jpg", "/players/khairul-zaim.jpg"],
    result: "W",
  },
  {
    date: "May 15",
    year: "2025",
    score: "21-17",
    meta: "Session 11",
    partner: "Haziq Azman",
    partnerAvatar: "/players/haziq-azman.jpg",
    opponents: "Arif Hakim / Syafiq Halim",
    opponentAvatars: ["/players/arif-hakim.jpg", "/players/syafiq-halim.jpg"],
    result: "W",
  },
  {
    date: "May 11",
    year: "2025",
    score: "21-14",
    meta: "Session 10",
    partner: "Farid Iqbal",
    partnerAvatar: "/players/farid-iqbal.jpg",
    opponents: "Khairul Zaim / Hafiz Omar",
    opponentAvatars: ["/players/khairul-zaim.jpg", "/players/hafiz-omar.jpg"],
    result: "W",
  },
  {
    date: "May 7",
    year: "2025",
    score: "17-21",
    meta: "Session 9",
    partner: "Farid Iqbal",
    partnerAvatar: "/players/farid-iqbal.jpg",
    opponents: "Aiman Hakim / Zaki Rahim",
    opponentAvatars: ["/aiman-portrait.png", "/players/zaki-rahim.jpg"],
    result: "L",
  },
  {
    date: "May 2",
    year: "2025",
    score: "21-19",
    meta: "Session 8",
    partner: "Haziq Azman",
    partnerAvatar: "/players/haziq-azman.jpg",
    opponents: "Nabil Rahman / Syafiq Halim",
    opponentAvatars: ["/players/nabil-rahman.jpg", "/players/syafiq-halim.jpg"],
    result: "W",
  },
];

const recentSessions = [
  { date: "May 18", record: "3-1", diff: "+24", rating: "+18" },
  { date: "May 15", record: "2-2", diff: "+3", rating: "+2" },
  { date: "May 11", record: "4-0", diff: "+31", rating: "+24" },
  { date: "May 7", record: "1-3", diff: "-14", rating: "-11" },
];

const bestPartners = [
  { name: "Haziq Azman", record: "11W/3L", avatar: "/players/haziq-azman.jpg" },
  { name: "Farid Iqbal", record: "7W/4L", avatar: "/players/farid-iqbal.jpg" },
  { name: "Nabil Rahman", record: "6W/3L", avatar: "/players/nabil-rahman.jpg" },
  { name: "Syafiq Halim", record: "5W/4L", avatar: "/players/syafiq-halim.jpg" },
  { name: "Daniel Nabil", record: "4W/3L", avatar: "/players/daniel-nabil.jpg" },
];

const toughestOpponents = [
  { name: "Zaki Rahim", record: "2W/5L", avatar: "/players/zaki-rahim.jpg" },
  { name: "Khairul Zaim", record: "3W/4L", avatar: "/players/khairul-zaim.jpg" },
  { name: "Arif Hakim", record: "2W/4L", avatar: "/players/arif-hakim.jpg" },
  { name: "Amirul Fikri", record: "1W/3L", avatar: "/players/amirul-fikri.jpg" },
  { name: "Hafiz Omar", record: "2W/3L", avatar: "/players/hafiz-omar.jpg" },
];
const relationshipPreviewCount = 3;

function progressPercent(progress) {
  const [current, total] = progress.split("/").map((value) => Number(value));

  if (!current || !total) {
    return 0;
  }

  return Math.min(100, Math.round((current / total) * 100));
}

function winRateFromRecord(record) {
  const match = record.match(/^(\d+)W\/(\d+)L$/);

  if (!match) {
    return "";
  }

  const wins = Number(match[1]);
  const losses = Number(match[2]);
  const total = wins + losses;

  return total ? `${Math.round((wins / total) * 100)}%` : "0%";
}

function StatStrip() {
  const items = [
    { icon: LayoutGrid, label: "Matches", value: "42" },
    { icon: BarChart3, label: "Win rate", value: "67%" },
    { icon: Flame, label: "Streak", value: "W3", accent: true },
    { icon: Award, label: "Point diff", value: "+86", accent: true },
  ];

  return (
    <section className="stat-strip" aria-label="Player summary">
      {items.map(({ icon: Icon, label, value, accent }) => (
        <div className="stat-strip-item" key={label}>
          <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
          <span>{label}</span>
          <strong className={accent ? "accent-value" : undefined}>{value}</strong>
        </div>
      ))}
    </section>
  );
}

function RatingChart({ range, onRangeChange }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const data = {
    "30D": [
      { date: "Apr 20", rating: 1168 },
      { date: "Apr 23", rating: 1196 },
      { date: "Apr 27", rating: 1179 },
      { date: "May 1", rating: 1228 },
      { date: "May 4", rating: 1254 },
      { date: "May 7", rating: 1278 },
      { date: "May 10", rating: 1242 },
      { date: "May 13", rating: 1269 },
      { date: "May 16", rating: 1258 },
      { date: "May 18", rating: 1248 },
    ],
    "90D": [
      { date: "Feb 18", rating: 1104 },
      { date: "Mar 1", rating: 1132 },
      { date: "Mar 12", rating: 1121 },
      { date: "Mar 24", rating: 1176 },
      { date: "Apr 4", rating: 1198 },
      { date: "Apr 16", rating: 1216 },
      { date: "Apr 27", rating: 1179 },
      { date: "May 7", rating: 1278 },
      { date: "May 13", rating: 1269 },
      { date: "May 18", rating: 1248 },
    ],
    "1Y": [
      { date: "Jun", rating: 1034 },
      { date: "Jul", rating: 1068 },
      { date: "Sep", rating: 1125 },
      { date: "Nov", rating: 1106 },
      { date: "Jan", rating: 1160 },
      { date: "Feb", rating: 1198 },
      { date: "Mar", rating: 1216 },
      { date: "Apr", rating: 1179 },
      { date: "May 13", rating: 1269 },
      { date: "May 18", rating: 1248 },
    ],
    All: [
      { date: "Start", rating: 1000 },
      { date: "S2", rating: 1034 },
      { date: "S4", rating: 1104 },
      { date: "S6", rating: 1086 },
      { date: "S8", rating: 1148 },
      { date: "S10", rating: 1198 },
      { date: "S12", rating: 1216 },
      { date: "S14", rating: 1179 },
      { date: "S16", rating: 1269 },
      { date: "Now", rating: 1248 },
    ],
  };
  const chartWidth = 342;
  const chartHeight = 80;
  const axisX = 42;
  const plotStartX = 62;
  const plotEndX = 326;
  const plotTopY = 8;
  const plotBottomY = 66;
  const minRating = 1000;
  const maxRating = 1400;
  const rangeData = data[range];
  const points = rangeData.map((point, index) => {
    const x =
      plotStartX +
      (index / Math.max(rangeData.length - 1, 1)) * (plotEndX - plotStartX);
    const y =
      plotBottomY -
      ((point.rating - minRating) / (maxRating - minRating)) *
        (plotBottomY - plotTopY);

    return {
      ...point,
      x,
      y,
    };
  });
  const pointPairs = points
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const activePoint =
    activeIndex === null ? lastPoint : points[activeIndex];

  const setPointFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const svgX = ratio * chartWidth;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    points.forEach((point, index) => {
      const distance = Math.abs(point.x - svgX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    setActiveIndex(nearestIndex);
  };

  return (
    <section className="chart-block">
      <div className="chart-head">
        <h3>Rating trend</h3>
        <div className="range-tabs" aria-label="Rating range">
          {ranges.map((item) => (
            <button
              className={item === range ? "active" : ""}
              type="button"
              key={item}
              onClick={() => onRangeChange(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div
        className="chart-frame"
        onPointerDown={setPointFromPointer}
        onPointerMove={setPointFromPointer}
        onPointerLeave={() => setActiveIndex(null)}
      >
        <span className="axis axis-top">1400</span>
        <span className="axis axis-mid">1200</span>
        <span className="axis axis-bottom">1000</span>
        <svg
          viewBox="0 0 342 80"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Rating trend ${range}, ${firstPoint.date} to ${lastPoint.date}`}
        >
          <line x1={axisX} y1="8" x2={axisX} y2="66" className="chart-axis" />
          <line x1={axisX} y1="66" x2="326" y2="66" className="chart-axis" />
          <polyline points={pointPairs} className="spark-area" />
          <polyline points={pointPairs} className="spark-line" />
          <line
            x1={activePoint.x.toFixed(1)}
            y1="8"
            x2={activePoint.x.toFixed(1)}
            y2="66"
            className="hover-line"
          />
          {points.map((point) => (
            <circle
              key={`${range}-${point.date}`}
              cx={point.x.toFixed(1)}
              cy={point.y.toFixed(1)}
              r={point === activePoint ? "5" : "3"}
              className={point === activePoint ? "spark-dot active" : "spark-dot muted"}
            />
          ))}
        </svg>
        <span
          className="rating-pill chart-tooltip"
          style={{
            left: `${(activePoint.x / chartWidth) * 100}%`,
            top: `${Math.max(8, (activePoint.y / chartHeight) * 80 - 28)}px`,
          }}
        >
          <strong>{activePoint.rating}</strong>
          <span>{activePoint.date}</span>
        </span>
        <div className="date-row">
          <span style={{ left: `${(firstPoint.x / chartWidth) * 100}%` }}>
            {firstPoint.date}
          </span>
          <span style={{ left: `${(lastPoint.x / chartWidth) * 100}%` }}>
            {lastPoint.date}
          </span>
        </div>
      </div>
    </section>
  );
}

function Section({ icon: Icon, title, action, children }) {
  return (
    <section className="section-panel">
      <header className="section-title-row">
        <div className="section-title">
          <Icon size={21} strokeWidth={1.9} aria-hidden="true" />
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function PerformanceSection({ range, onRangeChange }) {
  return (
    <Section icon={TrendingUp} title="Performance">
      <div className="performance-grid">
        {performanceStats.map(({ icon: Icon, label, value }) => (
          <div className="performance-cell" key={label}>
            <Icon size={22} strokeWidth={1.7} aria-hidden="true" />
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </div>
        ))}
      </div>
      <RatingChart range={range} onRangeChange={onRangeChange} />
    </Section>
  );
}

function RelationshipRows({ items }) {
  return (
    <div className="relationship-list">
      {items.map((item, index) => (
        <div className="relationship-row" key={item.name}>
          <span className="relationship-rank">#{index + 1}</span>
          <img src={item.avatar} alt="" className="relationship-avatar" />
          <strong>{item.name}</strong>
          <span>{item.record}</span>
          <span className="relationship-rate">{winRateFromRecord(item.record)}</span>
        </div>
      ))}
    </div>
  );
}

function RelationshipGroup({ title, items, onViewAll }) {
  const visibleItems = items.slice(0, relationshipPreviewCount);
  const hasMore = items.length > relationshipPreviewCount;

  return (
    <div className="relationship-group">
      <div className="relationship-group-head">
        <h3>{title}</h3>
        {hasMore ? (
          <button
            className="inline-link-button"
            type="button"
            aria-label={`View all ${title}`}
            onClick={onViewAll}
          >
            View all
          </button>
        ) : null}
      </div>
      <RelationshipRows items={visibleItems} />
    </div>
  );
}

function RelationshipListDialog({ group, onClose }) {
  useEffect(() => {
    if (!group) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => window.removeEventListener("keydown", handleEscape);
  }, [group, onClose]);

  if (!group) {
    return null;
  }

  return (
    <div className="relationship-dialog-layer" onClick={onClose}>
      <div
        aria-label={`${group.title} list`}
        aria-modal="true"
        className="relationship-dialog"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="relationship-dialog-head">
          <h3>{group.title}</h3>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>
        <div className="relationship-dialog-list">
          <RelationshipRows items={group.items} />
        </div>
      </div>
    </div>
  );
}

function RelationshipsSection() {
  const [activeGroup, setActiveGroup] = useState(null);

  return (
    <Section icon={Users} title="Partners & opponents">
      <div className="relationship-grid">
        <RelationshipGroup
          title="Best partners"
          items={bestPartners}
          onViewAll={() => setActiveGroup({ title: "Best partners", items: bestPartners })}
        />
        <RelationshipGroup
          title="Toughest opponents"
          items={toughestOpponents}
          onViewAll={() =>
            setActiveGroup({ title: "Toughest opponents", items: toughestOpponents })
          }
        />
      </div>
      <RelationshipListDialog group={activeGroup} onClose={() => setActiveGroup(null)} />
    </Section>
  );
}

function AchievementToken({ achievement, selected, onSelect, full = false }) {
  const { title, progress, tone, icon: Icon } = achievement;

  return (
    <button
      className={`achievement-token ${full ? "full" : ""} ${selected ? "selected" : ""}`}
      type="button"
      aria-expanded={selected}
      onClick={onSelect}
    >
      <span className={`badge-token ${tone}`}>
        <Icon size={full ? 28 : 27} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <strong>{title}</strong>
      {!full ? (
        <div className="mini-progress" aria-hidden="true">
          <span style={{ width: `${progressPercent(progress)}%` }} />
        </div>
      ) : null}
      <span className="progress-text">{progress}</span>
    </button>
  );
}

function AchievementDetail({ achievement, onClose }) {
  useEffect(() => {
    if (!achievement) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => window.removeEventListener("keydown", handleEscape);
  }, [achievement, onClose]);

  if (!achievement) {
    return null;
  }

  return (
    <div className="achievement-popover-layer" onClick={onClose}>
      <div
        aria-label={`${achievement.title} badge details`}
        aria-modal="true"
        className="achievement-popover"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <strong>{achievement.title}</strong>
        <p>{achievement.criteria}</p>
        <small>{achievement.progress} complete</small>
      </div>
    </div>
  );
}

function AchievementShelf({ expanded, onToggle }) {
  const [selectedAchievementTitle, setSelectedAchievementTitle] = useState(null);
  const visibleAchievements = expanded ? achievements : achievements.slice(0, 4);
  const selectedAchievement = visibleAchievements.find(
    (achievement) => achievement.title === selectedAchievementTitle,
  );

  return (
    <Section
      icon={Medal}
      title="Achievements"
      action={
        <button className="link-button" type="button" onClick={onToggle}>
          {expanded ? "Show less" : "View all"}
        </button>
      }
    >
      <div className="achievement-shelf">
        {visibleAchievements.map((achievement) => (
          <AchievementToken
            achievement={achievement}
            key={achievement.title}
            selected={selectedAchievementTitle === achievement.title}
            onSelect={() =>
              setSelectedAchievementTitle((current) =>
                current === achievement.title ? null : achievement.title,
              )
            }
          />
        ))}
      </div>
      <AchievementDetail
        achievement={selectedAchievement}
        onClose={() => setSelectedAchievementTitle(null)}
      />
    </Section>
  );
}

function MatchAvatarStack({ avatars, label }) {
  return (
    <span className="match-avatar-stack" aria-label={label}>
      {avatars.map((avatar, index) => (
        <img
          src={avatar}
          alt=""
          className="match-avatar"
          key={`${avatar}-${index}`}
        />
      ))}
    </span>
  );
}

function TeamCell({ label, name, avatars, showAvatars }) {
  return (
    <div className="team-cell">
      <span>{label}</span>
      <div className="team-line">
        {showAvatars ? (
          <MatchAvatarStack avatars={avatars} label={`${label} avatars`} />
        ) : null}
        <strong>{name}</strong>
      </div>
    </div>
  );
}

function MatchRow({ match, selected, onSelect, variant = "full" }) {
  const showAvatars = variant === "recent";

  return (
    <button
      className={`match-row ${variant} ${selected ? "selected" : ""}`}
      type="button"
      onClick={onSelect}
    >
      <div className="match-primary">
        <div className="date-cell">
          <CalendarDays size={18} strokeWidth={1.7} aria-hidden="true" />
          <span>{match.date}</span>
          <span>{match.year}</span>
        </div>
        <div className="score-cell">
          <strong className={match.result === "W" ? "score-win" : "score-loss"}>
            {match.score}
          </strong>
          <span>{match.meta}</span>
        </div>
        <span className={`result-chip ${match.result === "W" ? "win" : "loss"}`}>
          {match.result}
        </span>
      </div>
      <div className="match-teams">
        <TeamCell
          label="with"
          name={match.partner}
          avatars={[match.partnerAvatar]}
          showAvatars={showAvatars}
        />
        <TeamCell
          label="vs"
          name={match.opponents}
          avatars={match.opponentAvatars}
          showAvatars={showAvatars}
        />
      </div>
    </button>
  );
}

function RecentMatches({ showAll, onToggle, selectedMatch, setSelectedMatch }) {
  const visibleMatches = showAll ? matches : matches.slice(0, 4);

  return (
    <Section
      icon={CalendarDays}
      title="Recent matches"
      action={
        <button className="link-button" type="button" onClick={onToggle}>
          {showAll ? "Show less" : "View all"}
        </button>
      }
    >
      <div className="match-list">
        {visibleMatches.map((match, index) => (
          <MatchRow
            key={`${match.date}-${match.score}`}
            match={match}
            variant="recent"
            selected={selectedMatch === index}
            onSelect={() => setSelectedMatch(selectedMatch === index ? null : index)}
          />
        ))}
      </div>
      {selectedMatch !== null && visibleMatches[selectedMatch] ? (
        <div className="match-detail">
          <strong>{visibleMatches[selectedMatch].result === "W" ? "Win" : "Loss"}</strong>
          <span>
            {visibleMatches[selectedMatch].partner} vs{" "}
            {visibleMatches[selectedMatch].opponents}
          </span>
        </div>
      ) : null}
    </Section>
  );
}

function OverviewTab({
  range,
  setRange,
  expandedAchievements,
  setExpandedAchievements,
  showAllMatches,
  setShowAllMatches,
  selectedMatch,
  setSelectedMatch,
}) {
  return (
    <>
      <PerformanceSection range={range} onRangeChange={setRange} />
      <RelationshipsSection />
      <AchievementShelf
        expanded={expandedAchievements}
        onToggle={() => setExpandedAchievements((value) => !value)}
      />
      <RecentMatches
        showAll={showAllMatches}
        onToggle={() => setShowAllMatches((value) => !value)}
        selectedMatch={selectedMatch}
        setSelectedMatch={setSelectedMatch}
      />
    </>
  );
}

function MatchesTab({ selectedMatch, setSelectedMatch }) {
  return (
    <Section icon={CalendarDays} title="Matches">
      <div className="tab-summary">
        <strong>42</strong>
        <span>matches played</span>
        <strong>28-14</strong>
        <span>record</span>
      </div>
      <div className="match-list">
        {matches.map((match, index) => (
          <MatchRow
            key={`${match.date}-${match.score}`}
            match={match}
            selected={selectedMatch === index}
            onSelect={() => setSelectedMatch(selectedMatch === index ? null : index)}
          />
        ))}
      </div>
      {selectedMatch !== null && matches[selectedMatch] ? (
        <div className="match-detail">
          <strong>{matches[selectedMatch].result === "W" ? "Win" : "Loss"}</strong>
          <span>
            {matches[selectedMatch].partner} vs {matches[selectedMatch].opponents}
          </span>
        </div>
      ) : null}
    </Section>
  );
}

function StatsTab({ range, setRange }) {
  return (
    <>
      <Section icon={Star} title="Rating ledger">
        <RatingChart range={range} onRangeChange={setRange} />
        <div className="ledger-grid">
          <span>Current</span>
          <strong>1248</strong>
          <span>Peak</span>
          <strong>1292</strong>
          <span>Lowest</span>
          <strong>1034</strong>
          <span>30D change</span>
          <strong className="accent-value">+86</strong>
        </div>
      </Section>
      <Section icon={CalendarDays} title="Session form">
        <div className="session-form-list">
          {recentSessions.map((session) => (
            <div className="session-form-row" key={session.date}>
              <span>{session.date}</span>
              <strong>{session.record}</strong>
              <span>{session.diff} diff</span>
              <span className={session.rating.startsWith("+") ? "gain" : "drop"}>
                {session.rating} rating
              </span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function AchievementsTab() {
  const [showAllAchievements, setShowAllAchievements] = useState(false);
  const [selectedAchievementTitle, setSelectedAchievementTitle] = useState(null);
  const visibleAchievements = showAllAchievements
    ? achievements
    : achievements.slice(0, achievementsPreviewCount);
  const selectedAchievement = visibleAchievements.find(
    (achievement) => achievement.title === selectedAchievementTitle,
  );

  return (
    <Section
      icon={Medal}
      title="Achievements"
      action={
        achievements.length > achievementsPreviewCount ? (
          <button
            className="link-button"
            type="button"
            onClick={() => {
              setShowAllAchievements((value) => !value);
              setSelectedAchievementTitle((title) =>
                showAllAchievements &&
                !achievements
                  .slice(0, achievementsPreviewCount)
                  .some((achievement) => achievement.title === title)
                  ? null
                  : title,
              );
            }}
          >
            {showAllAchievements ? "Show less" : "View all"}
          </button>
        ) : null
      }
    >
      <div className="achievement-grid-full">
        {visibleAchievements.map((achievement) => (
          <AchievementToken
            achievement={achievement}
            full
            key={achievement.title}
            selected={selectedAchievementTitle === achievement.title}
            onSelect={() =>
              setSelectedAchievementTitle((current) =>
                current === achievement.title ? null : achievement.title,
              )
            }
          />
        ))}
      </div>
      <AchievementDetail
        achievement={selectedAchievement}
        onClose={() => setSelectedAchievementTitle(null)}
      />
    </Section>
  );
}

function HeaderActions() {
  const [shared, setShared] = useState(false);

  return (
    <div className="top-actions">
      <button type="button" aria-label="Back">
        <ArrowLeft size={27} strokeWidth={2.1} />
      </button>
      <div>
        <button
          className={shared ? "shared" : ""}
          type="button"
          aria-label="Share profile"
          onClick={() => setShared((value) => !value)}
        >
          <Share2 size={25} strokeWidth={2} />
        </button>
        <button type="button" aria-label="More">
          <MoreVertical size={25} strokeWidth={2} />
        </button>
      </div>
      {shared ? <span className="share-toast">Profile link copied</span> : null}
    </div>
  );
}

function PlayerHeader() {
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [hasProfilePhoto, setHasProfilePhoto] = useState(true);
  const [photoFeedback, setPhotoFeedback] = useState("");
  const avatarZoneRef = useRef(null);

  useEffect(() => {
    if (!photoMenuOpen) {
      return undefined;
    }

    const handleOutsidePress = (event) => {
      if (!avatarZoneRef.current?.contains(event.target)) {
        setPhotoMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handleOutsidePress);

    return () => document.removeEventListener("pointerdown", handleOutsidePress);
  }, [photoMenuOpen]);

  const handlePhotoAction = (action) => {
    if (action === "remove") {
      setHasProfilePhoto(false);
      setPhotoFeedback("Photo removed");
    } else {
      setHasProfilePhoto(true);
      setPhotoFeedback(action === "add" ? "Add photo opened" : "Change photo opened");
    }

    setPhotoMenuOpen(false);
  };

  return (
    <header className="player-header">
      <HeaderActions />
      <div className="identity-row">
        <div className="avatar-zone" ref={avatarZoneRef}>
          <button
            className={`avatar-button ${photoMenuOpen ? "active" : ""}`}
            type="button"
            aria-expanded={photoMenuOpen}
            aria-label="Profile photo actions"
            onClick={() => {
              setPhotoMenuOpen((value) => !value);
              setPhotoFeedback("");
            }}
          >
            {hasProfilePhoto ? (
              <img
                src="/aiman-portrait.png"
                alt="Aiman Rahman"
                className="avatar"
              />
            ) : (
              <span className="avatar-placeholder" aria-hidden="true">AR</span>
            )}
            <span className="avatar-camera" aria-hidden="true">
              <Camera size={15} strokeWidth={2.1} />
            </span>
          </button>
          {photoMenuOpen ? (
            <div className="photo-menu">
              <button type="button" onClick={() => handlePhotoAction(hasProfilePhoto ? "change" : "add")}>
                <Camera size={15} strokeWidth={2} aria-hidden="true" />
                {hasProfilePhoto ? "Change photo" : "Add photo"}
              </button>
              {hasProfilePhoto ? (
                <button type="button" onClick={() => handlePhotoAction("remove")}>
                  <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                  Remove
                </button>
              ) : null}
            </div>
          ) : null}
          {photoFeedback ? <span className="photo-feedback">{photoFeedback}</span> : null}
        </div>
        <div className="identity-copy">
          <h1>Aiman Rahman</h1>
          <div className="chips-row">
            <span className="rank-chip">#4</span>
            <span className="trend-chip">
              <TrendingUp size={17} strokeWidth={2} aria-hidden="true" />
              Rising
            </span>
          </div>
          <div className="hero-metrics">
            <div className="metric-plain">
              <strong>1248</strong>
              <span>Rating</span>
            </div>
            <div>
              <TrendingUp size={25} strokeWidth={1.9} aria-hidden="true" />
              <strong>W3</strong>
              <span>Recent form</span>
            </div>
          </div>
        </div>
      </div>
      <StatStrip />
    </header>
  );
}

export function App() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [range, setRange] = useState("30D");
  const [expandedAchievements, setExpandedAchievements] = useState(false);
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);

  const tabContent = useMemo(() => {
    if (activeTab === "Matches") {
      return (
        <MatchesTab
          selectedMatch={selectedMatch}
          setSelectedMatch={setSelectedMatch}
        />
      );
    }

    if (activeTab === "Stats") {
      return <StatsTab range={range} setRange={setRange} />;
    }

    if (activeTab === "Achievements") {
      return <AchievementsTab />;
    }

    return (
      <OverviewTab
        range={range}
        setRange={setRange}
        expandedAchievements={expandedAchievements}
        setExpandedAchievements={setExpandedAchievements}
        showAllMatches={showAllMatches}
        setShowAllMatches={setShowAllMatches}
        selectedMatch={selectedMatch}
        setSelectedMatch={setSelectedMatch}
      />
    );
  }, [
    activeTab,
    expandedAchievements,
    range,
    selectedMatch,
    showAllMatches,
  ]);

  return (
    <main className="app-shell">
      <div className="phone-canvas">
        <PlayerHeader />
        <div className="profile-tabs" role="tablist" aria-label="Profile tabs">
          {tabs.map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={activeTab === tab ? "active" : ""}
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setSelectedMatch(null);
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="tab-content">{tabContent}</div>
      </div>
    </main>
  );
}
