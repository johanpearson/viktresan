import type { ReactNode } from 'react';

export interface ChoiceOption<T extends string> {
  id: T;
  label: string;
  /** Kort förklaring under etiketten. */
  description?: ReactNode;
}

interface ChoiceListProps<T extends string> {
  /** Gruppens rubrik (legend), t.ex. "Aktivitetsnivå". */
  legend: string;
  /** Radioknapparnas `name` – unikt i formuläret. */
  name: string;
  options: readonly ChoiceOption<T>[];
  /** Valt alternativ; `null` = inget valt än. */
  value: T | null;
  onChange: (value: T) => void;
  /** Valet är destruktivt (t.ex. "Ersätt all data"): markeringen i fel-färg. */
  dangerOption?: T;
  testId?: string;
}

/**
 * Valrader: ett val av flera (radioknappar) som rader med etikett och förklaring till vänster
 * och en egen markering till höger – samma form som switcharna. Ersätter webbläsarens
 * standardradioknappar; tangentbord (piltangenter) och skärmläsare fungerar som vanligt.
 */
export function ChoiceList<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  dangerOption,
  testId,
}: ChoiceListProps<T>) {
  return (
    <fieldset className="choice-list" data-testid={testId}>
      <legend className="field-label">{legend}</legend>
      {options.map((option) => (
        <label key={option.id} className="choice-row">
          <span className="choice-text">
            <span className="choice-label">{option.label}</span>
            {option.description && <span className="choice-description">{option.description}</span>}
          </span>
          <input
            type="radio"
            className={
              option.id === dangerOption ? 'choice-radio choice-radio-danger' : 'choice-radio'
            }
            name={name}
            value={option.id}
            checked={value === option.id}
            onChange={() => {
              onChange(option.id);
            }}
          />
        </label>
      ))}
    </fieldset>
  );
}
