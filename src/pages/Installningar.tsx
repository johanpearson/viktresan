import { useEffect, useState, type ReactNode } from 'react';
import { AboutApp } from '../components/AboutApp.tsx';
import { BottomSheet } from '../components/BottomSheet.tsx';
import { Card } from '../components/Card.tsx';
import { DisplaySettings } from '../components/DisplaySettings.tsx';
import { ExportBackup } from '../components/ExportBackup.tsx';
import { FeatureSettings } from '../components/FeatureSettings.tsx';
import { FoodPreferencesSettings } from '../components/FoodPreferencesSettings.tsx';
import { ImportBackup } from '../components/ImportBackup.tsx';
import { ListRow } from '../components/ListRow.tsx';
import { LockSettings } from '../components/LockSettings.tsx';
import { Page } from '../components/Page.tsx';
import { PhotoSettings } from '../components/PhotoSettings.tsx';
import { ProfileForm } from '../components/ProfileForm.tsx';
import { ProteinGoalSettings } from '../components/ProteinGoalSettings.tsx';
import { StorageSettings } from '../components/StorageSettings.tsx';
import { WaterGoalSettings } from '../components/WaterGoalSettings.tsx';
import { daysSince } from '../lib/backupReminder.ts';
import { FEATURES, useFeatures, type FeatureGated } from '../lib/features.ts';
import { decimalInput, formatInt, formatKg, formatMl } from '../lib/format.ts';
import { useLockStatus } from '../lib/lock.ts';
import { SIDE_LABELS } from '../lib/photoSessions.ts';
import { usePreferences } from '../lib/preferences.ts';
import { DEFAULT_PROTEIN_FACTOR, proteinGoalFor } from '../lib/protein.ts';
import { getStorageStatus, type StorageStatus } from '../lib/storage.ts';
import { useAppData, type AppData } from '../lib/useAppData.ts';
import { useBackupStatus, type BackupStatus } from '../lib/useBackupStatus.ts';
import { useHashRoute } from '../lib/useHashRoute.ts';
import { versionLine } from '../lib/version.ts';
import { waterGoal } from '../lib/water.ts';

type PanelId =
  | 'profil'
  | 'protein'
  | 'dryck'
  | 'matpreferenser'
  | 'funktioner'
  | 'visning'
  | 'bilder'
  | 'las'
  | 'sakerhetskopia'
  | 'lagring'
  | 'om';

/** Det raderna visar till höger och under rubriken – räknas ur datan när sidan ritas. */
interface Summary {
  data: AppData | null;
  backup: BackupStatus | null;
  storage: StorageStatus | null;
  enabledFeatures: number;
  profileSide: string;
  locked: boolean;
}

interface Panel extends FeatureGated {
  id: PanelId;
  /** Radens och panelens rubrik. */
  title: string;
  secondary?: (s: Summary) => ReactNode;
  value?: (s: Summary) => ReactNode;
}

interface Group {
  title: string;
  panels: readonly Panel[];
}

const NO_PROFILE = 'Fyll i profilen först';

function lastExportShort(status: BackupStatus | null): string {
  if (status == null) return '…';
  if (status.lastExportAt == null) return 'Ingen export ännu';
  const days = daysSince(status.lastExportAt, Date.now());
  return days === 0
    ? 'Senast i dag'
    : days === 1
      ? 'Senast i går'
      : `Senast för ${String(days)} dagar sedan`;
}

/** Inställningarna som grupperade listor; varje rad öppnar en panel. Funktionsbrytarna styr raderna. */
const GROUPS: readonly Group[] = [
  {
    title: 'Profil och mål',
    panels: [
      {
        id: 'profil',
        title: 'Profil',
        secondary: ({ data }) =>
          data?.profile
            ? `Start ${formatKg(data.profile.startWeightKg)} · ${formatInt(data.profile.heightCm)} cm`
            : 'Startvikt, längd och mål',
        value: ({ data }) =>
          data?.profile ? `Mål ${formatKg(data.profile.goalWeightKg)}` : 'Fyll i',
      },
      {
        id: 'protein',
        title: 'Proteinmål',
        feature: 'mat',
        secondary: ({ data }) =>
          data?.profile
            ? `${decimalInput(data.profile.proteinFactor ?? DEFAULT_PROTEIN_FACTOR)} g per kg målvikt`
            : NO_PROFILE,
        value: ({ data }) => {
          const goal = proteinGoalFor(data?.profile ?? null);
          return goal == null ? null : `${formatInt(goal)} g`;
        },
      },
      {
        id: 'dryck',
        title: 'Dryckesmål',
        feature: 'vatten',
        secondary: ({ data }) =>
          data?.profile ? (data.profile.waterGoalMl ? 'Eget mål' : 'Standardmål') : NO_PROFILE,
        value: ({ data }) =>
          data?.profile ? formatMl(waterGoal({ profile: data.profile }).ml) : null,
      },
      {
        id: 'matpreferenser',
        title: 'Matpreferenser',
        feature: 'mat',
        secondary: ({ data }) =>
          data?.profile
            ? data.profile.foodPreferences
              ? 'Ifyllda – används i "Fråga AI"'
              : 'För "Fråga AI"'
            : NO_PROFILE,
      },
    ],
  },
  {
    title: 'Appen',
    panels: [
      {
        id: 'funktioner',
        title: 'Funktioner',
        secondary: () => 'Stäng av det du inte använder',
        value: ({ enabledFeatures }) =>
          `${String(enabledFeatures)} av ${String(FEATURES.filter((f) => f.available).length)}`,
      },
      {
        id: 'visning',
        title: 'Visning',
        secondary: () => 'Trendvikt och vibration',
      },
      {
        id: 'bilder',
        title: 'Bilder',
        feature: 'bilder',
        secondary: () => 'Profilbilder tas från',
        value: ({ profileSide }) => profileSide,
      },
      {
        id: 'las',
        title: 'Lås',
        secondary: () => 'Fingeravtryck eller skärmlås',
        value: ({ locked }) => (locked ? 'På' : 'Av'),
      },
    ],
  },
  {
    title: 'Data',
    panels: [
      {
        id: 'sakerhetskopia',
        title: 'Säkerhetskopia',
        secondary: ({ backup }) => lastExportShort(backup),
      },
      {
        id: 'lagring',
        title: 'Lagring',
        secondary: () => 'Allt sparas bara på den här enheten',
        value: ({ storage }) =>
          storage == null ? null : (
            <span data-testid="persistence-summary">
              {storage.persistence === 'persisted' ? 'Beständig' : 'Inte beständig'}
            </span>
          ),
      },
      {
        id: 'om',
        title: 'Om appen',
        secondary: () => 'Version, uppdateringar och källor',
      },
    ],
  },
];

const PANEL_IDS = new Set<string>(GROUPS.flatMap((g) => g.panels.map((p) => p.id)));

function isPanelId(value: string): value is PanelId {
  return PANEL_IDS.has(value);
}

export function Installningar() {
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const { data, reload } = useAppData();
  const backup = useBackupStatus();
  const features = useFeatures();
  const { prefs } = usePreferences();
  const lock = useLockStatus();
  const [imports, setImports] = useState(0);
  const { sub } = useHashRoute();
  // "#/installningar/profil" öppnar panelen direkt (t.ex. från Översikts tomma läge).
  const [openId, setOpenId] = useState<PanelId | null>(() => (isPanelId(sub) ? sub : null));

  // Byts adressen medan sidan är öppen (länk till en annan panel) öppnas den panelen.
  const [prevSub, setPrevSub] = useState(sub);
  if (sub !== prevSub) {
    setPrevSub(sub);
    if (isPanelId(sub)) setOpenId(sub);
  }

  useEffect(() => {
    let active = true;
    void getStorageStatus().then((result) => {
      if (active) setStorage(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const summary: Summary = {
    data,
    backup: backup.status,
    storage,
    enabledFeatures: FEATURES.filter((f) => features.flags[f.id]).length,
    profileSide: SIDE_LABELS[prefs.profileSide],
    locked: lock === 'locked' || lock === 'unlocked',
  };
  const groups = GROUPS.map((g) => ({ ...g, panels: features.filter(g.panels) }));
  const open = groups.flatMap((g) => g.panels).find((p) => p.id === openId);

  function close() {
    setOpenId(null);
    if (sub) window.history.replaceState(null, '', '#/installningar');
  }

  function content(id: PanelId): ReactNode {
    switch (id) {
      case 'profil':
        return (
          data && (
            <ProfileForm
              // Ny nyckel efter import så att formuläret fylls i med den importerade profilen.
              key={imports}
              profile={data.profile}
              onSaved={() => {
                void reload();
              }}
            />
          )
        );
      case 'protein':
        return data && <ProteinGoalSettings key={imports} data={data} onChange={reload} />;
      case 'dryck':
        return data && <WaterGoalSettings key={imports} data={data} onChange={reload} />;
      case 'matpreferenser':
        return data && <FoodPreferencesSettings key={imports} data={data} onChange={reload} />;
      case 'funktioner':
        return <FeatureSettings />;
      case 'visning':
        return <DisplaySettings />;
      case 'bilder':
        return <PhotoSettings />;
      case 'las':
        return <LockSettings />;
      case 'sakerhetskopia':
        return (
          <>
            <p className="form-note">
              Allt – profil, mätningar, matlogg och bilder – sparas i en zip-fil som du kan dela
              till t.ex. molnlagring eller e-post. Datan lämnar bara enheten när du själv väljer
              det.
            </p>
            <ExportBackup status={backup.status} onExported={backup.markExported} />
            <ImportBackup
              onImported={async () => {
                await Promise.all([reload(), backup.reload()]);
                setImports((n) => n + 1);
                setStorage(await getStorageStatus());
              }}
            />
          </>
        );
      case 'lagring':
        return <StorageSettings status={storage} onChange={setStorage} />;
      case 'om':
        return <AboutApp />;
    }
  }

  return (
    <Page title="Inställningar">
      {groups.map((group) => (
        <Card key={group.title} title={group.title}>
          <ul className="list">
            {group.panels.map((panel) => (
              <ListRow
                key={panel.id}
                testId={`settings-${panel.id}`}
                primary={panel.title}
                secondary={panel.secondary?.(summary)}
                value={panel.value?.(summary)}
                chevron
                onClick={() => {
                  setOpenId(panel.id);
                }}
              />
            ))}
          </ul>
        </Card>
      ))}
      <footer className="app-footer" data-testid="app-footer">
        {versionLine()}
      </footer>
      {open && (
        <BottomSheet title={open.title} onClose={close}>
          {content(open.id)}
        </BottomSheet>
      )}
    </Page>
  );
}
