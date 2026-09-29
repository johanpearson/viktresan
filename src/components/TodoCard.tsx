import { useState } from 'react';
import {
  deleteSupplementIntake,
  putSupplementIntake,
  putWorkout,
  type Supplement,
} from '../db/db.ts';
import { BACKUP_REMINDER_DAYS } from '../lib/backupReminder.ts';
import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import { formatShortDate } from '../lib/format.ts';
import { describeDose } from '../lib/glp1.ts';
import { haptic } from '../lib/haptics.ts';
import { intakeFor } from '../lib/supplements.ts';
import { buildTodo, nextDoseText } from '../lib/todo.ts';
import type { AppData } from '../lib/useAppData.ts';
import { useBackupStatus } from '../lib/useBackupStatus.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import { answerWorkout, describeWorkout, type WorkoutItem } from '../lib/workouts.ts';
import { ActionSheet } from './ActionSheet.tsx';
import { Card } from './Card.tsx';
import { CompleteWorkoutSheet } from './CompleteWorkoutSheet.tsx';
import { ListRow } from './ListRow.tsx';
import { ShowMore } from './ShowMore.tsx';
import { Toast } from './Toast.tsx';

interface TodoCardProps {
  data: AppData;
  now: Date;
  onChange: () => Promise<unknown>;
}

/** Så många obesvarade pass visas innan "Visa alla". */
const UNANSWERED_VISIBLE = 3;

/**
 * Översikt → Att göra idag: bara det som väntar idag, som listrader. Tillskott bockas av med ett
 * tryck (Ångra i en toast), dosen öppnar Logga → GLP-1, ett pass öppnar en radmeny med Klar / Hoppa
 * över (inga knappar i listan). När inget
 * återstår ersätts kortet av raden "Allt klart för idag". Nästa dos (när idag inte är dosdag) är
 * en liten rad längst ner.
 */
export function TodoCard({ data, now, onChange }: TodoCardProps) {
  const features = useFeatures();
  const backup = useBackupStatus();
  const toast = useUndoToast();
  const [completing, setCompleting] = useState<WorkoutItem | null>(null);
  // Radmenyn för ett pass: Klar / Hoppa över ("Hoppade över" för ett obesvarat).
  const [menu, setMenu] = useState<{ item: WorkoutItem; prompt: boolean } | null>(null);
  const [allUnanswered, setAllUnanswered] = useState(false);
  const today = todayIso(now);
  const todo = buildTodo(
    {
      ...data,
      enabled: {
        tillskott: features.isEnabled('tillskott'),
        glp1: features.isEnabled('glp1'),
        traning: features.isEnabled('traning'),
      },
      backupDue: backup.status?.due === true,
    },
    now,
  );

  async function take(supplements: readonly Supplement[]) {
    toast.close();
    const added = supplements.map((s) => intakeFor(s, today));
    for (const intake of added) await putSupplementIntake(intake);
    haptic(added.length > 1 ? 'success' : 'light');
    await onChange();
    const first = supplements[0];
    toast.show(
      added.length === 1 && first
        ? `Bockade av ${first.name}.`
        : `Bockade av ${String(added.length)} tillskott.`,
      async () => {
        for (const intake of added) await deleteSupplementIntake(intake.id);
        await onChange();
      },
    );
  }

  async function skip(item: WorkoutItem) {
    await putWorkout(answerWorkout(item, { status: 'hoppad' }));
    await onChange();
  }

  const nextDose = todo.nextDose && (
    <a className="todo-next-dose" href="#/logga/glp1" data-testid="todo-next-dose">
      <span className="calendar-dot dot-glp1" aria-hidden="true" />
      <span>{nextDoseText(todo.nextDose, today)}</span>
    </a>
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
  const menuSheet = menu && (
    <ActionSheet
      title={describeWorkout(menu.item)}
      description={`${menu.prompt ? formatShortDate(menu.item.date) : 'Idag'} ${menu.item.time ?? 'hela dagen'}`}
      actions={[
        {
          label: 'Klar',
          onSelect: () => {
            setCompleting(menu.item);
          },
        },
        {
          label: menu.prompt ? 'Hoppade över' : 'Hoppa över',
          onSelect: () => void skip(menu.item),
        },
      ]}
      onClose={() => {
        setMenu(null);
      }}
    />
  );
  const sheet = completing && (
    <CompleteWorkoutSheet
      item={completing}
      onSaved={onChange}
      onClose={() => {
        setCompleting(null);
      }}
    />
  );

  if (todo.empty) {
    return (
      <div className="todo-done-block" data-testid="todo-done-block">
        <p className="todo-done" data-testid="todo-done">
          <span className="todo-done-icon" aria-hidden="true" />
          Allt klart för idag
        </p>
        {nextDose}
        {toastView}
        {menuSheet}
        {sheet}
      </div>
    );
  }

  const unanswered = allUnanswered ? todo.unanswered : todo.unanswered.slice(0, UNANSWERED_VISIBLE);
  const count =
    todo.supplements.length +
    todo.doses.length +
    todo.workouts.length +
    todo.unanswered.length +
    (todo.backup ? 1 : 0);

  return (
    <Card
      title={
        <>
          Att göra idag <span className="card-title-meta num">{count}</span>
        </>
      }
      action={
        todo.supplements.length > 1 ? (
          <button
            type="button"
            className="button button-secondary button-small"
            data-testid="todo-all-taken"
            onClick={() => void take(todo.supplements)}
          >
            Alla tagna
          </button>
        ) : undefined
      }
      className="todo-card"
      testId="todo-card"
    >
      <ul className="list">
        {todo.doses.map((dose) => (
          <ListRow
            key={`${dose.medicationId}:${dose.date}`}
            testId="todo-dose"
            leading={<span className="calendar-dot dot-glp1" aria-hidden="true" />}
            primary={`Dos idag: ${describeDose(dose)}`}
            secondary={[
              dose.time ? `kl. ${dose.time}` : null,
              todo.site ? `Förslag: ${todo.site.toLowerCase()}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            href="#/logga/glp1"
            chevron
          />
        ))}
        {todo.supplements.map((s) => (
          <ListRow
            key={s.id}
            testId="todo-supplement"
            leading={<span className="todo-check" aria-hidden="true" />}
            primary={s.name}
            secondary="Tryck när du tagit det"
            onClick={() => void take([s])}
          />
        ))}
        {todo.workouts.map((w) => (
          <ListRow
            key={w.id}
            testId="todo-workout"
            leading={<span className="calendar-dot dot-traning" aria-hidden="true" />}
            primary={describeWorkout(w)}
            secondary={
              w.time ? `Idag ${w.time} · Klar eller hoppa över` : 'Idag · Klar eller hoppa över'
            }
            chevron
            onClick={() => {
              setMenu({ item: w, prompt: false });
            }}
          />
        ))}
        {unanswered.map((w) => (
          <ListRow
            key={w.id}
            testId="todo-unanswered"
            leading={
              <span className="calendar-dot dot-traning status-obesvarad" aria-hidden="true" />
            }
            primary={`Blev passet av? ${describeWorkout(w)}`}
            secondary={`${formatShortDate(w.date)}${w.time ? ` ${w.time}` : ''}`}
            chevron
            onClick={() => {
              setMenu({ item: w, prompt: true });
            }}
          />
        ))}
        {todo.backup && (
          <ListRow
            testId="backup-reminder"
            leading={<span className="todo-check todo-check-warning" aria-hidden="true" />}
            primary="Dags att säkerhetskopiera"
            secondary={
              backup.status?.lastExportAt == null
                ? 'Ingen export ännu – datan finns bara här'
                : `Mer än ${String(BACKUP_REMINDER_DAYS)} dagar sedan senaste exporten`
            }
            href="#/installningar/sakerhetskopia"
            chevron
          />
        )}
      </ul>
      <ShowMore
        hidden={todo.unanswered.length - unanswered.length}
        onClick={() => {
          setAllUnanswered(true);
        }}
      >
        Visa alla {todo.unanswered.length} obesvarade
      </ShowMore>
      {nextDose}
      {toastView}
      {menuSheet}
      {sheet}
    </Card>
  );
}
