import type { ComponentType } from 'react';
import { Page } from '../components/Page.tsx';
import { SegmentedControl } from '../components/SegmentedControl.tsx';
import type { FeatureGated } from '../lib/features.ts';
import { useFeatures } from '../lib/features.ts';
import { useHashRoute } from '../lib/useHashRoute.ts';
import { hrefFor } from '../routes.ts';
import { Bilder } from './Bilder.tsx';
import { Historik } from './Historik.tsx';
import { Milstolpar } from './Milstolpar.tsx';
import { Rapport } from './Rapport.tsx';
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
  { sub: 'rapport', label: 'Rapport', Content: Rapport },
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
        <SegmentedControl
          label="Visa"
          options={tabs.map((t) => ({ id: t.sub, label: t.label }))}
          value={active?.sub ?? ''}
          onChange={(tabSub) => {
            window.location.hash = hrefFor(route, tabSub);
          }}
        />
      )}
      {/* Hela delsökvägen som nyckel: "bilder/jamfor" öppnar jämförelsen även från Bilder. */}
      {active && <active.Content key={sub} />}
    </Page>
  );
}
