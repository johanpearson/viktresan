import { ROUTES, hrefFor, type Route } from '../routes.ts';
import { NavIcon } from './NavIcon.tsx';

export function NavBar({ current }: { current: Route }) {
  return (
    <nav className="nav" aria-label="Huvudmeny">
      <ul className="nav-list">
        {ROUTES.map((route) => {
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
