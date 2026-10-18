import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { AboutApp } from '../components/AboutApp.tsx';
import { BottomSheet } from '../components/BottomSheet.tsx';
import { Card } from '../components/Card.tsx';
import { DisplaySettings } from '../components/DisplaySettings.tsx';
import { ExportBackup } from '../components/ExportBackup.tsx';
import { BACKUP_MODE_LABEL, backupMode } from '../lib/backupFile.ts';
import { FeatureSettings } from '../components/FeatureSettings.tsx';
import { FiberGoalSettings } from '../components/FiberGoalSettings.tsx';
import { FoodPreferencesSettings } from '../components/FoodPreferencesSettings.tsx';
import { FoodSearchSettings } from '../components/FoodSearchSettings.tsx';
import { MealSettings } from '../components/MealSettings.tsx';
import { ImportBackup } from '../components/ImportBackup.tsx';
import { ListRow } from '../components/ListRow.tsx';
import { LockSettings } from '../components/LockSettings.tsx';
import { Page } from '../components/Page.tsx';
import { OverviewSettings } from '../components/OverviewSettings.tsx';
import { PhotoSettings } from '../components/PhotoSettings.tsx';
import { ProfileForm } from '../components/ProfileForm.tsx';
import { ProteinGoalSettings } from '../components/ProteinGoalSettings.tsx';
import { StorageSettings } from '../components/StorageSettings.tsx';
import { WaterGoalSettings } from '../components/WaterGoalSettings.tsx';
import { FEATURES, useFeatures, type FeatureGated } from '../lib/features.ts';
import { decimalInput, formatInt, formatKg, formatMl } from '../lib/format.ts';
import { useLockStatus } from '../lib/lock.ts';
import { OVERVIEW_ITEMS } from '../lib/overviewItems.ts';
import { SIDE_LABELS } from '../lib/photoSessions.ts';
import { usePreferences } from '../lib/preferences.ts';
import { fiberGoalVisible, fiberReferenceG } from '../lib/fiber.ts';
import { DEFAULT_PROTEIN_FACTOR, proteinGoalFor } from '../lib/protein.ts';
import { getStorageStatus, type StorageStatus } from '../lib/storage.ts';
import { useAppData, type AppData } from '../lib/useAppData.ts';
import { useBackupStatus, type BackupStatus } from '../lib/useBackupStatus.ts';
import { consumeSubPath } from '../lib/navigation.ts';
import { useHashRoute } from '../lib/useHashRoute.ts';
import { normalize } from '../lib/foodSearch.ts';
import { versionLine } from '../lib/version.ts';
import { waterGoal } from '../lib/water.ts';

type PanelId =
  | 'profil'
  | 'protein'
  | 'fiber'
  | 'dryck'
  | 'matpreferenser'
  | 'maltider'
  | 'matsokning'
  | 'funktioner'
  | 'visning'
  | 'oversikt'
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
  /** GLP-1 är på (fibermål och dryckestillägg). */
  glp1: boolean;
  /** Dolda ringar och kort på Översikt (bland påslagna funktioner). */
  overviewHidden: number;
}

interface Panel extends FeatureGated {
  id: PanelId;
  /** Radens och panelens rubrik. */
  title: string;
  /** Fler ord som sökfältet hittar panelen på. */
  keywords: string;
  secondary?: (s: Summary) => ReactNode;
  value?: (s: Summary) => ReactNode;
}

interface Group {
  title: string;
  panels: readonly Panel[];
}

const NO_PROFILE = 'Fyll i profilen först';

const shortDate = new Intl.DateTimeFormat('sv-SE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function lastExportShort(status: BackupStatus | null): string {
  if (status == null) return '…';
  if (status.lastExportAt == null) return 'Senaste backup: ingen ännu';
  return `Senaste backup: ${shortDate.format(status.lastExportAt)}`;
}

/** Inställningarna som grupperade listor; varje rad öppnar en panel. Funktionsbrytarna styr raderna. */
const GROUPS: readonly Group[] = [
  {
    title: 'Profil och mål',
    panels: [
      {
        id: 'profil',
        keywords:
          'startvikt längd målvikt mål kön födelseår ålder aktivitetsnivå takt kalorimål startdatum',
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
        keywords: 'protein faktor gram',
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
        id: 'fiber',
        keywords: 'fiber nnr upptrappning',
        title: 'Fibermål',
        feature: 'mat',
        secondary: ({ data, glp1 }) =>
          data?.profile
            ? glp1
              ? 'Visas med GLP-1'
              : data.profile.showFiberGoal
                ? 'Visas'
                : 'NNR 2023'
            : NO_PROFILE,
        value: ({ data, glp1 }) =>
          data?.profile
            ? fiberGoalVisible(data.profile, glp1)
              ? `${formatInt(fiberReferenceG(data.profile.sex))} g`
              : 'Av'
            : null,
      },
      {
        id: 'dryck',
        keywords: 'vatten dryck vätska ml träning glp-1',
        title: 'Dryckesmål',
        feature: 'vatten',
        secondary: ({ data, glp1 }) =>
          data?.profile
            ? `${data.profile.waterGoalMl ? 'Eget mål' : 'Standardmål'}${
                waterGoal({ profile: data.profile, glp1 }).glp1BonusMl > 0 ? ' + GLP-1' : ''
              }`
            : NO_PROFILE,
        value: ({ data, glp1 }) =>
          data?.profile ? formatMl(waterGoal({ profile: data.profile, glp1 }).ml) : null,
      },
      {
        id: 'matpreferenser',
        keywords: 'allergi vegetarisk kost fråga ai',
        title: 'Matpreferenser',
        feature: 'mat',
        secondary: ({ data }) =>
          data?.profile
            ? data.profile.foodPreferences
              ? 'Ifyllda – används i "Fråga AI"'
              : 'För "Fråga AI"'
            : NO_PROFILE,
      },
      {
        id: 'maltider',
        keywords: 'frukost lunch middag mellanmål kvällsmål tider ordning',
        title: 'Måltider',
        feature: 'mat',
        secondary: () => 'Namn, tid och ordning',
      },
      {
        id: 'matsokning',
        keywords: 'sök källor kategorier dolda livsmedel fineli livsmedelsverket open food facts',
        title: 'Matsökning',
        feature: 'mat',
        secondary: () => 'Källor, kategorier och dolda livsmedel',
      },
    ],
  },
  {
    title: 'Appen',
    panels: [
      {
        id: 'funktioner',
        keywords: 'steg midja mat dryck träning glp-1 tillskott bilder stäng av slå på',
        title: 'Funktioner',
        secondary: () => 'Stäng av det du inte använder',
        value: ({ enabledFeatures }) =>
          `${String(enabledFeatures)} av ${String(FEATURES.filter((f) => f.available).length)}`,
      },
      {
        id: 'visning',
        keywords: 'trendvikt vibration näringsetiketter',
        title: 'Visning',
        secondary: () => 'Trendvikt och vibration',
      },
      {
        id: 'oversikt',
        keywords: 'ringar kort dölj',
        title: 'Översikt',
        secondary: () => 'Ringar och kort',
        value: ({ overviewHidden }) =>
          overviewHidden === 0 ? 'Allt visas' : `${String(overviewHidden)} dolda`,
      },
      {
        id: 'bilder',
        keywords: 'profilsida spökbild foto kamera',
        title: 'Bilder',
        feature: 'bilder',
        secondary: () => 'Profilbilder tas från',
        value: ({ profileSide }) => profileSide,
      },
      {
        id: 'las',
        keywords: 'lås passkey ansiktsigenkänning fingeravtryck',
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
        keywords: 'backup export import zip lösenord kryptering återställ',
        title: 'Säkerhetskopia',
        secondary: ({ backup }) => (
          <span data-testid="backup-summary">{lastExportShort(backup)}</span>
        ),
        value: () => BACKUP_MODE_LABEL[backupMode()],
      },
      {
        id: 'lagring',
        keywords: 'beständig lagring utrymme',
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
        keywords: 'version uppdatering källor licens',
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
    glp1: features.isEnabled('glp1'),
    overviewHidden: features
      .filter(OVERVIEW_ITEMS)
      .filter((i) => prefs.overviewHidden.includes(i.id)).length,
  };
  const groups = GROUPS.map((g) => ({ ...g, panels: features.filter(g.panels) }));
  const open = groups.flatMap((g) => g.panels).find((p) => p.id === openId);
  // Delsökvägen öppnade panelen: sidans post blir "#/installningar", panelens post behåller den.
  const opensPanel = open !== undefined && open.id === sub;
  useLayoutEffect(() => {
    if (opensPanel) consumeSubPath('#/installningar');
  }, [opensPanel]);

  function close() {
    setOpenId(null);
  }

  // Sökfältet: paneler där varje ord finns i rubriken, gruppen eller nyckelorden.
  const [query, setQuery] = useState('');
  const words = normalize(query).split(' ').filter(Boolean);
  const matches = groups.flatMap((g) =>
    g.panels.filter((p) => {
      const text = normalize(`${p.title} ${g.title} ${p.keywords}`);
      return words.every((w) => text.includes(w));
    }),
  );

  function row(panel: Panel) {
    return (
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
    );
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
      case 'fiber':
        return data && <FiberGoalSettings key={imports} data={data} onChange={reload} />;
      case 'dryck':
        return data && <WaterGoalSettings key={imports} data={data} onChange={reload} />;
      case 'matpreferenser':
        return data && <FoodPreferencesSettings key={imports} data={data} onChange={reload} />;
      case 'maltider':
        return <MealSettings key={imports} />;
      case 'matsokning':
        return <FoodSearchSettings key={imports} />;
      case 'funktioner':
        return <FeatureSettings />;
      case 'visning':
        return <DisplaySettings />;
      case 'oversikt':
        return <OverviewSettings />;
      case 'bilder':
        return <PhotoSettings />;
      case 'las':
        return <LockSettings />;
      case 'sakerhetskopia':
        return (
          <>
            <p className="form-note">
              Allt – profil, mätningar, matlogg och bilder – sparas i en enda zip-fil. Datan lämnar
              bara enheten när du själv väljer det.
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
      <label className="search-field settings-search">
        <span className="visually-hidden">Sök i inställningar</span>
        <span aria-hidden="true" className="search-icon" />
        <input
          className="input"
          type="search"
          placeholder="Sök i inställningar"
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          data-testid="settings-search"
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
      </label>
      {words.length > 0 ? (
        <Card title="Sökträffar">
          {matches.length > 0 ? (
            <ul className="list">{matches.map(row)}</ul>
          ) : (
            <p className="muted" role="status">
              Inga inställningar matchar ”{query.trim()}”.
            </p>
          )}
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.title} title={group.title}>
            <ul className="list">{group.panels.map(row)}</ul>
          </Card>
        ))
      )}
      <footer className="app-footer" data-testid="app-footer">
        {versionLine()}
      </footer>
      {open && (
        <BottomSheet key={open.id} title={open.title} onClose={close}>
          {content(open.id)}
        </BottomSheet>
      )}
    </Page>
  );
}
