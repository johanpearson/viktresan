import { useId } from 'react';
import { formatDate } from '../lib/format.ts';
import { useFeatures } from '../lib/features.ts';
import { setPreference, usePreferences } from '../lib/preferences.ts';
import {
  REPORT_PERIODS,
  REPORT_SECTIONS,
  type ReportRange,
  type ReportSectionId,
  type ReportSettings,
} from '../lib/report.ts';
import { Card } from './Card.tsx';
import { ChipGroup } from './ChipGroup.tsx';

interface ReportSettingsFormProps {
  /** Perioden som valen ger, `null` = egen period utan giltiga datum. */
  range: ReportRange | null;
  today: string;
}

/**
 * Framsteg → Rapport: period (chips, egen = två datumfält) och vilka sektioner som ska
 * med (switchar). Valen sparas på enheten direkt. "Visa rapport" öppnar rapportvyn.
 */
export function ReportSettingsForm({ range, today }: ReportSettingsFormProps) {
  const { prefs } = usePreferences();
  const features = useFeatures();
  const idPrefix = useId();
  const settings = prefs.report;
  const sections = features.filter(REPORT_SECTIONS);

  function update(next: Partial<ReportSettings>) {
    void setPreference('report', { ...settings, ...next });
  }

  function toggleSection(id: ReportSectionId, value: boolean) {
    update({ sections: { ...settings.sections, [id]: value } });
  }

  const anySection = sections.some((s) => settings.sections[s.id]);

  return (
    <Card title="Rapport till vården" testId="report-settings">
      <div className="form">
        <p className="form-note muted">
          En sammanställning att visa eller skriva ut. Allt räknas här på telefonen – inget skickas
          någonstans.
        </p>
        <ChipGroup
          label="Period"
          columns={2}
          options={REPORT_PERIODS}
          selected={[settings.period]}
          onToggle={(period) => {
            if (period !== 'egen' || settings.customFrom !== null) {
              update({ period });
              return;
            }
            // Egen period börjar med de senaste 12 veckorna som förslag.
            update({ period, customFrom: range?.from ?? today, customTo: today });
          }}
        />
        {settings.period === 'egen' && (
          <div className="field-row">
            <label className="field">
              <span className="field-label">Från</span>
              <input
                className="input"
                type="date"
                max={today}
                value={settings.customFrom ?? ''}
                onChange={(e) => {
                  update({ customFrom: e.target.value || null });
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">Till</span>
              <input
                className="input"
                type="date"
                max={today}
                value={settings.customTo ?? ''}
                onChange={(e) => {
                  update({ customTo: e.target.value || null });
                }}
              />
            </label>
          </div>
        )}
        <p className="form-note muted" data-testid="report-range" aria-live="polite">
          {range
            ? `${formatDate(range.from)} – ${formatDate(range.to)}`
            : 'Välj ett från-datum som ligger före till-datumet.'}
        </p>
        <fieldset className="switch-group">
          <legend className="field-label">Ta med</legend>
          <ul className="switch-list">
            {sections.map((s) => {
              const id = `${idPrefix}-${s.id}`;
              return (
                <li key={s.id}>
                  <label className="switch-row">
                    <span className="switch-text">
                      <span className="switch-label" id={`${id}-label`}>
                        {s.label}
                      </span>
                      <span className="switch-description" id={`${id}-hint`}>
                        {s.description}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      className="switch"
                      checked={settings.sections[s.id]}
                      aria-labelledby={`${id}-label`}
                      aria-describedby={`${id}-hint`}
                      onChange={(e) => {
                        toggleSection(s.id, e.target.checked);
                      }}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        {range && anySection ? (
          <a className="button" href="#/framsteg/rapport/visa">
            Visa rapport
          </a>
        ) : (
          <button type="button" className="button" disabled>
            Visa rapport
          </button>
        )}
      </div>
    </Card>
  );
}
