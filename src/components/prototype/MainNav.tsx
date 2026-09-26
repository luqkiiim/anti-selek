import { UsersThree, CalendarBlank, Trophy, UserCircle } from "@phosphor-icons/react";
export const mainPages = ["club", "sessions", "rankings", "profile"] as const;
const items = [
  { page: "club", name: "Club", Icon: UsersThree },
  { page: "sessions", name: "Sessions", Icon: CalendarBlank },
  { page: "rankings", name: "Rankings", Icon: Trophy },
  { page: "profile", name: "Profile", Icon: UserCircle },
];
export function MainNav({ active, onNavigate }: { active: string; onNavigate: (page: string) => void }) {
  return <nav className="bottom-nav" aria-label="Main navigation">{items.map(({ page, name, Icon }) =>
    <button key={page} aria-current={active === page ? "page" : undefined} className={active === page ? "active" : ""} onClick={() => onNavigate(page)}>
      <Icon size={25} weight={active === page ? "fill" : "regular"} /><span>{name}</span>
    </button>)}</nav>;
}
