import { hrefFor, type Route } from '../routes.ts';
import { NavIcon } from './NavIcon.tsx';

interface NavBarProps {
  /** Routes att visa – redan filtrerade på påslagna funktioner. */
  routes: readonly Route[];
  current: Route;
}

export function NavBar({ routes, current }: NavBarProps) {
  return (
    <nav className="nav" aria-label="Huvudmeny">
      <ul className="nav-list">
        {routes.map((route) => {
          const active = route.id === current.id;
          return (
            <li key={route.id}>
              <a
                className="nav-link"
                href={hrefFor(route)}
                aria-current={active ? 'page' : undefined}
              >
                <NavIcon id={route.id} />
                <span className="nav-label">{route.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
