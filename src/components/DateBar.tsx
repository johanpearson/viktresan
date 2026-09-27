import { addDays } from '../lib/dates.ts';
import { dayLabel } from '../lib/foodDay.ts';

interface DateBarProps {
  date: string;
  today: string;
  onChange: (date: string) => void;
}

/**
 * Kompakt datumrad: ‹ föregående dag, datumet (tryck = datumväljaren) och nästa ›.
 * Datumfältet ligger osynligt ovanpå texten så att ett tryck öppnar systemets väljare.
 */
export function DateBar({ date, today, onChange }: DateBarProps) {
  return (
    <div className="date-bar" data-testid="date-bar">
      <button
        type="button"
        className="date-bar-step"
        aria-label="Föregående dag"
        onClick={() => {
          onChange(addDays(date, -1));
        }}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <label className="date-bar-label">
        <span className="date-bar-text" data-testid="food-date">
          {dayLabel(date, today)}
        </span>
        <input
          className="date-bar-input"
          type="date"
          aria-label="Välj dag"
          value={date}
          max={today}
          onChange={(e) => {
            if (e.target.value && e.target.value <= today) onChange(e.target.value);
          }}
        />
      </label>
      <button
        type="button"
        className="date-bar-step"
        aria-label="Nästa dag"
        disabled={date >= today}
        onClick={() => {
          onChange(addDays(date, 1));
        }}
      >
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
