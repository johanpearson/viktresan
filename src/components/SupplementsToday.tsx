import {
  deleteSupplementIntake,
  putSupplementIntake,
  type Supplement,
  type SupplementIntake,
} from '../db/db.ts';
import { haptic } from '../lib/haptics.ts';
import { intakeFor, supplementsOn, untaken } from '../lib/supplements.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import { Card } from './Card.tsx';
import { ChipGroup } from './ChipGroup.tsx';
import { Toast } from './Toast.tsx';

interface SupplementsTodayProps {
  supplements: readonly Supplement[];
  log: readonly SupplementIntake[];
  date: string;
  onChange: () => Promise<unknown>;
  /** `card` = eget kort (Översikt), `inline` = i en panel (Logga → Tillskott). */
  variant?: 'card' | 'inline';
}

/**
 * "Tillskott idag": ett chip per tillskott (tryck = tagen/inte tagen) och "Alla tagna" som
 * bockar av alla planerade med ett tryck (med Ångra). Vid behov-tillskott visas sist och
 * räknas inte in i "Alla tagna".
 */
export function SupplementsToday({
  supplements,
  log,
  date,
  onChange,
  variant = 'card',
}: SupplementsTodayProps) {
  const toast = useUndoToast();
  const items = supplementsOn(supplements, log, date);
  if (items.length === 0) return null;
  const planned = items.filter((i) => i.planned);
  const takenPlanned = planned.filter((i) => i.intake !== null).length;
  const remaining = untaken(items);

  async function toggle(id: string) {
    const item = items.find((i) => i.supplement.id === id);
    if (!item) return;
    toast.close();
    if (item.intake) {
      await deleteSupplementIntake(item.intake.id);
    } else {
      await putSupplementIntake(intakeFor(item.supplement, date));
      haptic('light');
    }
    await onChange();
  }

  async function takeAll() {
    const added = remaining.map((s) => intakeFor(s, date));
    for (const intake of added) await putSupplementIntake(intake);
    haptic('success');
    await onChange();
    toast.show(
      added.length === 1
        ? 'Bockade av 1 tillskott.'
        : `Bockade av ${String(added.length)} tillskott.`,
      async () => {
        for (const intake of added) await deleteSupplementIntake(intake.id);
        await onChange();
      },
    );
  }

  const status = planned.length > 0 ? `${String(takenPlanned)} av ${String(planned.length)}` : null;
  const allButton = (
    <button
      type="button"
      className="button button-secondary button-small"
      disabled={remaining.length === 0}
      onClick={() => void takeAll()}
    >
      Alla tagna
    </button>
  );
  const chips = (
    <ChipGroup
      label="Tillskott idag"
      hideLabel
      options={items.map((i) => ({
        id: i.supplement.id,
        label: i.supplement.name,
        ...(i.planned ? {} : { hint: 'vid behov' }),
      }))}
      selected={items.filter((i) => i.intake !== null).map((i) => i.supplement.id)}
      onToggle={(id) => void toggle(id)}
    />
  );
  const toastView = toast.toast && (
    <Toast
      label="Tillskott"
      testId="supplement-toast"
      message={toast.toast.message}
      onUndo={toast.onUndo}
      onClose={toast.close}
    />
  );

  if (variant === 'inline') {
    return (
      <div className="supplements-today" data-testid="supplements-today">
        {chips}
        <div className="supplements-today-footer">
          {status && <span className="muted-inline num">{status} tagna</span>}
          {planned.length > 0 && allButton}
        </div>
        {toastView}
      </div>
    );
  }

  return (
    <Card
      title={<>Tillskott idag {status && <span className="card-title-meta num">{status}</span>}</>}
      action={planned.length > 0 ? allButton : undefined}
      testId="supplements-today"
    >
      {chips}
      {toastView}
    </Card>
  );
}
