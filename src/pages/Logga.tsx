import { useState, type ComponentType } from 'react';
import { BottomSheet } from '../components/BottomSheet.tsx';
import { Page } from '../components/Page.tsx';
import { StepsForm } from '../components/StepsForm.tsx';
import { WaistLog } from '../components/WaistLog.tsx';
import { WeightLog } from '../components/WeightLog.tsx';
import { todayIso } from '../lib/dates.ts';
import type { FeatureGated } from '../lib/features.ts';
import { useFeatures } from '../lib/features.ts';
import { formatCm, formatInt, formatKg } from '../lib/format.ts';
import { useAppData, type AppData } from '../lib/useAppData.ts';

type LogTypeId = 'vikt' | 'midja' | 'steg';

interface LogFormProps {
  data: AppData;
  reload: () => Promise<AppData>;
}

interface LogType extends FeatureGated {
  id: LogTypeId;
  label: string;
  /** Rubrik på panelen. */
  title: string;
  /** SVG-path för ikonen (24×24, streck). */
  icon: string;
  /** Kort status på rutan, t.ex. senaste värdet. */
  summary: (data: AppData) => string;
  Form: ComponentType<LogFormProps>;
}

/**
 * Loggtyperna i rutnätet, i visningsordning. Vatten, träning och doser (GLP-1)
 * läggs till här när de finns – funktionsbrytarna styr redan vilka som visas.
 */
const LOG_TYPES: readonly LogType[] = [
  {
    id: 'vikt',
    label: 'Vikt',
    title: 'Logga vikt',
    icon: 'M6 20h12l-2-12H8zM9 8a3 3 0 0 1 6 0',
    summary: ({ weights }) => {
      const latest = weights[weights.length - 1];
      return latest ? `Senast ${formatKg(latest.weightKg)}` : 'Inget loggat';
    },
    Form: ({ data, reload }) => (
      <WeightLog weights={data.weights} profile={data.profile} onChange={reload} />
    ),
  },
  {
    id: 'midja',
    label: 'Midja',
    title: 'Logga midjemått',
    icon: 'M4 9c4 2 12 2 16 0M4 15c4 2 12 2 16 0M4 9v6M20 9v6',
    feature: 'midja',
    summary: ({ waist }) => {
      const latest = waist[waist.length - 1];
      return latest ? `Senast ${formatCm(latest.waistCm)}` : 'Inget loggat';
    },
    Form: ({ data, reload }) => <WaistLog waist={data.waist} onChange={reload} />,
  },
  {
    id: 'steg',
    label: 'Steg',
    title: 'Logga steg',
    icon: 'M8 4c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5zM16 10c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5z',
    feature: 'steg',
    summary: ({ steps }) => {
      const today = steps.find((s) => s.date === todayIso());
      return today ? `Idag ${formatInt(today.steps)}` : 'Inget idag';
    },
    Form: ({ data, reload }) => <StepsForm steps={data.steps} onChange={reload} />,
  },
];

export function Logga() {
  const { data, reload } = useAppData();
  const features = useFeatures();
  const [openId, setOpenId] = useState<LogTypeId | null>(null);
  const types = features.filter(LOG_TYPES);
  const open = types.find((t) => t.id === openId);

  return (
    <Page title="Logga">
      <ul className="log-grid" aria-label="Vad vill du logga?">
        {types.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className="log-tile"
              aria-haspopup="dialog"
              data-testid={`log-tile-${t.id}`}
              onClick={() => {
                setOpenId(t.id);
              }}
            >
              <svg
                className="log-tile-icon"
                viewBox="0 0 24 24"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d={t.icon} />
              </svg>
              <span className="log-tile-label">{t.label}</span>
              {data && <span className="log-tile-summary">{t.summary(data)}</span>}
            </button>
          </li>
        ))}
      </ul>
      {data && open && (
        <BottomSheet
          title={open.title}
          onClose={() => {
            setOpenId(null);
          }}
        >
          <open.Form data={data} reload={reload} />
        </BottomSheet>
      )}
    </Page>
  );
}
