import { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { ReportDocument, type ReportPhoto } from '../components/ReportDocument.tsx';
import { ReportSettingsForm } from '../components/ReportSettingsForm.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import type { ExtraNutrients } from '../data/nutrients.ts';
import { listFoodOverrides, listFoods, listMeals } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import type { FiberGoal } from '../lib/fiber.ts';
import { overlayExtras } from '../lib/foodNutrition.ts';
import { loadLivsmedel } from '../lib/livsmedel.ts';
import { setPreference, usePreferences } from '../lib/preferences.ts';
import {
  REPORT_SECTIONS,
  buildReport,
  reportPhotoSessions,
  reportRange,
  type FiberSource,
  type Report,
  type ReportSectionId,
} from '../lib/report.ts';
import type { AppData } from '../lib/useAppData.ts';
import { useAppData } from '../lib/useAppData.ts';
import { useFiber } from '../lib/useFiber.ts';
import { useHashRoute } from '../lib/useHashRoute.ts';
import { usePhotos } from '../lib/usePhotos.ts';

const NO_LOG: readonly never[] = [];

/**
 * Framsteg → Rapport: val av period och sektioner (`#/framsteg/rapport`) och själva
 * rapporten (`#/framsteg/rapport/visa`) med "Spara som PDF" (webbläsarens utskrift).
 */
export function Rapport() {
  const { sub } = useHashRoute();
  const { data } = useAppData();
  const { prefs } = usePreferences();
  const today = todayIso();
  const fiber = useFiber(data?.profile ?? null, data?.foodLog ?? NO_LOG, today);
  if (data === null) return <Skeleton cards={2} lines={6} />;
  if (data.profile === null && data.weights.length === 0) {
    return (
      <EmptyState
        title="Inget att rapportera ännu"
        action={{ label: 'Fyll i profilen', href: '#/installningar/profil' }}
      >
        Rapporten sammanställer vikt, mått och loggar för en period – till exempel inför ett besök i
        vården.
      </EmptyState>
    );
  }
  const range = reportRange(prefs.report, data, today);
  if (sub === 'rapport/visa' && range) {
    return <ReportView data={data} today={today} fiberGoalOn={fiber.goalOn} />;
  }
  return <ReportSettingsForm range={range} today={today} />;
}

/** Livsmedelsverkets fiberdata för kosten; `null` medan den laddas. */
function useFiberSource(enabled: boolean): FiberSource | null | 'loading' {
  const [source, setSource] = useState<FiberSource | null | 'loading'>(enabled ? 'loading' : null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    Promise.all([loadLivsmedel(), listMeals(), listFoods(), listFoodOverrides()])
      .then(([livsmedel, meals, foods, overrides]) => {
        const extra = new Map<string, ExtraNutrients | null>(
          livsmedel.foods.map((f) => [f.id, f.extra ?? null]),
        );
        // Egna livsmedel och Open Food Facts-produkter med fiber, sedan egna näringsvärden.
        for (const f of foods) if (f.fiberG !== undefined) extra.set(f.id, { fiberG: f.fiberG });
        overlayExtras(extra, overrides);
        if (active) setSource({ meals, lookup: (id) => extra.get(id) });
      })
      .catch(() => {
        // Utan databasen blir fibern okänd – resten av rapporten fungerar.
        if (active) setSource(null);
      });
    return () => {
      active = false;
    };
  }, [enabled]);
  return enabled ? source : null;
}

function ReportView({
  data,
  today,
  fiberGoalOn,
}: {
  data: AppData;
  today: string;
  /** Fibermålet ett datum, `null` när fibermålet är av. */
  fiberGoalOn: (date: string) => FiberGoal | null;
}) {
  const { prefs } = usePreferences();
  const features = useFeatures();
  const [hint, setHint] = useState(false);
  const range = reportRange(prefs.report, data, today);
  const sections: ReportSectionId[] = features
    .filter(REPORT_SECTIONS)
    .filter((s) => prefs.report.sections[s.id])
    .map((s) => s.id);
  const fiber = useFiberSource(sections.includes('kost'));
  const from = range?.from;
  const to = range?.to;
  const report = useMemo(
    () =>
      from !== undefined && to !== undefined && fiber !== 'loading'
        ? buildReport(data, { from, to }, today, fiber, fiberGoalOn(to)?.goalG ?? null)
        : null,
    [data, from, to, today, fiber, fiberGoalOn],
  );

  function print() {
    if (!report) return;
    // Titeln blir filnamnet i "Spara som PDF".
    const title = document.title;
    document.title = `Viktresan rapport ${report.from} – ${report.to}`;
    window.addEventListener(
      'afterprint',
      () => {
        document.title = title;
      },
      { once: true },
    );
    window.print();
  }

  if (!report) return <Skeleton cards={3} lines={4} />;
  return (
    <>
      <div className="report-toolbar no-print">
        <a className="button button-secondary" href="#/framsteg/rapport">
          Ändra urval
        </a>
        <button
          type="button"
          className="button"
          onClick={() => {
            if (prefs.reportPrintHintSeen) print();
            else setHint(true);
          }}
        >
          Spara som PDF
        </button>
      </div>
      {sections.includes('bilder') ? (
        <ReportWithPhotos report={report} sections={sections} today={today} />
      ) : (
        <ReportDocument report={report} sections={sections} createdOn={today} />
      )}
      {hint && (
        <BottomSheet
          title="Spara som PDF"
          onClose={() => {
            setHint(false);
          }}
        >
          <div className="form" data-testid="print-hint">
            <p>
              Utskriftsdialogen öppnas. Välj <strong>Spara som PDF</strong> som skrivare (på Android
              i listan överst) och tryck på PDF-knappen.
            </p>
            <p className="form-note muted">
              Rapporten blir A4 med ljus bakgrund och en sektion per sida. Filen sparas bara på din
              telefon – du väljer själv vem du delar den med.
            </p>
            <button
              type="button"
              className="button"
              onClick={() => {
                void setPreference('reportPrintHintSeen', true);
                setHint(false);
                print();
              }}
            >
              Fortsätt
            </button>
          </div>
        </BottomSheet>
      )}
    </>
  );
}

/** Bilderna läses (object URLs) bara när sektionen är vald. */
function ReportWithPhotos({
  report,
  sections,
  today,
}: {
  report: Report;
  sections: readonly ReportSectionId[];
  today: string;
}) {
  const { sessions, photos } = usePhotos();
  if (sessions === null || photos === null) return <Skeleton cards={3} lines={4} />;
  const items: ReportPhoto[] = reportPhotoSessions(sessions, report).map((session) => {
    const own = photos.filter((p) => p.sessionId === session.id);
    return { session, photo: own.find((p) => p.angle === 'fram') ?? own[0] ?? null };
  });
  return <ReportDocument report={report} sections={sections} createdOn={today} photos={items} />;
}
