import { useState } from 'react';
import { FIBER_REFERENCE_G, FIBER_REFERENCE_SOURCE } from '../data/fiberReference.ts';
import { saveProfile } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import {
  FIBER_RAMP_DEFAULT_START_G,
  FIBER_RAMP_STEP_G,
  fiberGoalText,
  fiberRampEnabled,
  fiberReferenceG,
} from '../lib/fiber.ts';
import { formatInt } from '../lib/format.ts';
import type { AppData } from '../lib/useAppData.ts';
import { useFiber } from '../lib/useFiber.ts';

interface FiberGoalSettingsProps {
  data: AppData;
  onChange: () => Promise<AppData>;
}

/**
 * Inställningar → Fibermål: visa målet även utan GLP-1 och gradvis upptrappning
 * (på som standard). Valen sparas direkt i profilen.
 */
export function FiberGoalSettings({ data, onChange }: FiberGoalSettingsProps) {
  const { profile } = data;
  const glp1 = useFeatures().isEnabled('glp1');
  const { goal } = useFiber(profile, data.foodLog, todayIso());
  // Switcharna visar valet direkt; profilen sparas i bakgrunden.
  const [show, setShow] = useState(profile?.showFiberGoal === true);
  const [ramp, setRamp] = useState(fiberRampEnabled(profile));

  if (!profile) {
    return <p className="form-note">Fyll i profilen först – målet beror på kön.</p>;
  }
  const current = profile;
  const referenceG = fiberReferenceG(current.sex);

  async function update(change: (next: typeof current) => void) {
    const next = { ...current };
    change(next);
    await saveProfile(next);
    await onChange();
  }

  return (
    <div className="form">
      <p className="form-note" data-testid="fiber-goal-status">
        {goal
          ? `${fiberGoalText(goal)}.`
          : `Fibermålet är av. Referensvärdet för dig är ${formatInt(referenceG)} g per dag.`}
      </p>
      <label className="switch-row">
        <span className="switch-text">
          <span className="switch-label">Visa fibermål</span>
          <span className="switch-description" id="fiber-show-desc">
            {glp1
              ? 'Visas automatiskt när GLP-1 är på – fiber och dryck motverkar förstoppning, en vanlig biverkning.'
              : 'Fiberring på Översikt och i Mat, fiber i historik, veckosummering och rapport. Visas automatiskt när GLP-1 är på.'}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={glp1 || show}
          disabled={glp1}
          aria-describedby="fiber-show-desc"
          data-testid="fiber-show"
          onChange={(e) => {
            const on = e.target.checked;
            setShow(on);
            void update((next) => {
              if (on) next.showFiberGoal = true;
              else delete next.showFiberGoal;
            });
          }}
        />
      </label>
      <label className="switch-row">
        <span className="switch-text">
          <span className="switch-label">Gradvis upptrappning</span>
          <span className="switch-description" id="fiber-ramp-desc">
            Börjar på ditt snitt de senaste 7 loggade dagarna (
            {formatInt(FIBER_RAMP_DEFAULT_START_G)} g utan data) och höjs med{' '}
            {formatInt(FIBER_RAMP_STEP_G)} g per vecka tills {formatInt(referenceG)} g nås – magen
            hinner vänja sig. Av = direkt på {formatInt(referenceG)} g. Slå av och på för att börja
            om.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={ramp}
          aria-describedby="fiber-ramp-desc"
          data-testid="fiber-ramp"
          onChange={(e) => {
            const on = e.target.checked;
            setRamp(on);
            void update((next) => {
              // Ny upptrappning börjar om från dagens snitt (sparas när målet visas).
              delete next.fiberRampStart;
              if (on) delete next.fiberRamp;
              else next.fiberRamp = false;
            });
          }}
        />
      </label>
      <p className="form-note muted">
        Referensvärde enligt {FIBER_REFERENCE_SOURCE}: minst {formatInt(FIBER_REFERENCE_G.man)} g
        per dag för män och {formatInt(FIBER_REFERENCE_G.kvinna)} g för kvinnor
        {current.sex ? '' : ' – ange kön i profilen, utan kön används 30 g'}. Fiber räknas för
        livsmedel med fiberdata (Livsmedelsverket, Open Food Facts när värdet finns, egna livsmedel
        där du fyllt i det) – snabbloggar räknas inte.
      </p>
    </div>
  );
}
