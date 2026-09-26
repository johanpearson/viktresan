import type { ComponentType } from 'react';
import { Page } from '../components/Page.tsx';
import type { FeatureGated } from '../lib/features.ts';
import { useFeatures } from '../lib/features.ts';
import { useHashRoute } from '../lib/useHashRoute.ts';
import { hrefFor } from '../routes.ts';
import { Bilder } from './Bilder.tsx';
import { Historik } from './Historik.tsx';
import { Milstolpar } from './Milstolpar.tsx';
import { Veckor } from './Veckor.tsx';

interface Tab extends FeatureGated {
  /** Delsökväg: "#/framsteg/<sub>". Tom = första fliken. */
  sub: string;
  label: string;
  Content: ComponentType;
}

const TABS: readonly Tab[] = [
  { sub: '', label: 'Historik', Content: Historik },
  { sub: 'veckor', label: 'Veckor', Content: Veckor },
  { sub: 'bilder', label: 'Bilder', Content: Bilder, feature: 'bilder' },
  { sub: 'milstolpar', label: 'Milstolpar', Content: Milstolpar },
];

export function Framsteg() {
  const { route, sub } = useHashRoute();
  const features = useFeatures();
  const tabs = features.filter(TABS);
  // Okänd eller avstängd flik → första fliken. Resten av sökvägen (t.ex. "bilder/jamfor") hör till fliken.
  const [tabSub = ''] = sub.split('/');
  const active = tabs.find((t) => t.sub === tabSub) ?? tabs[0];

  return (
    <Page title="Framsteg">
      {tabs.length > 1 && (
        <div className="segmented" role="group" aria-label="Visa">
          {tabs.map((t) => (
            <button
              key={t.sub}
              type="button"
              className="segmented-button"
              aria-pressed={t === active}
              onClick={() => {
                window.location.hash = hrefFor(route, t.sub);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {/* Hela delsökvägen som nyckel: "bilder/jamfor" öppnar jämförelsen även från Bilder. */}
      {active && <active.Content key={sub} />}
    </Page>
  );
}
