import { useState } from 'react';
import { saveProfile } from '../db/db.ts';
import { decimalInput, formatInt } from '../lib/format.ts';
import { DEFAULT_PROTEIN_FACTOR, PROTEIN_FACTORS, proteinGoalG } from '../lib/protein.ts';
import type { AppData } from '../lib/useAppData.ts';

interface ProteinGoalSettingsProps {
  data: AppData;
  onChange: () => Promise<AppData>;
}

/** Inställningar → Proteinmål: faktor (g per kg målvikt), 1,2–2,0. */
export function ProteinGoalSettings({ data, onChange }: ProteinGoalSettingsProps) {
  const { profile } = data;
  const [status, setStatus] = useState<string | null>(null);
  const factor = profile?.proteinFactor ?? DEFAULT_PROTEIN_FACTOR;

  async function handleChange(value: number) {
    if (!profile) return;
    const next = { ...profile };
    if (value === DEFAULT_PROTEIN_FACTOR) delete next.proteinFactor;
    else next.proteinFactor = value;
    await saveProfile(next);
    await onChange();
    const goal = proteinGoalG(profile.goalWeightKg, value);
    setStatus(goal == null ? null : `Proteinmålet är ${formatInt(goal)} g per dag.`);
  }

  const goal = profile ? proteinGoalG(profile.goalWeightKg, factor) : null;

  return (
    <section className="card form" aria-labelledby="protein-goal-title">
      <h2 className="card-title" id="protein-goal-title">
        Proteinmål
      </h2>
      {!profile ? (
        <p className="form-note">Fyll i profilen först – målet räknas från din målvikt.</p>
      ) : (
        <>
          <p className="form-note" data-testid="protein-goal">
            {decimalInput(factor)} g × {decimalInput(profile.goalWeightKg)} kg målvikt ={' '}
            {goal == null ? '–' : `${formatInt(goal)} g protein per dag`}.
          </p>
          <label className="field">
            <span className="field-label">Gram protein per kg målvikt</span>
            <select
              className="input"
              value={String(factor)}
              onChange={(e) => void handleChange(Number(e.target.value))}
            >
              {PROTEIN_FACTORS.map((f) => (
                <option key={f} value={String(f)}>
                  {decimalInput(f)}
                  {f === DEFAULT_PROTEIN_FACTOR ? ' (standard)' : ''}
                </option>
              ))}
            </select>
          </label>
          <p className="form-ok" role="status">
            {status}
          </p>
        </>
      )}
    </section>
  );
}
