import { Fragment, type ReactNode } from 'react';
import { fiberText, formatMacroG, type FiberAmount } from '../lib/fiber.ts';
import { formatInt } from '../lib/format.ts';
import type { Nutrients } from '../lib/nutrition.ts';

interface MacrosProps {
  nutrients: Pick<Nutrients, 'proteinG' | 'carbsG' | 'fatG'>;
  /**
   * Fibern: `null` = ingen fiberdata ("–", inte 0), `undefined` = inte känd än (fiberdatan
   * laddas) – då utelämnas fibern.
   */
  fiber?: FiberAmount | null | undefined;
  /** `short`: "P 6 g · K 30 g · F 2 g · Fi 4 g"; `long`: "Protein 6 g · … · Fiber 4 g". */
  variant?: 'short' | 'long';
  /** Hela gram (dagens summa); annars en decimal under 10 g. */
  round?: boolean;
  /** Delar före makrona i samma rad, t.ex. "2 skivor (70 g)". */
  lead?: ReactNode;
}

const LABELS = {
  short: { protein: 'P', carbs: 'K', fat: 'F', fiber: 'Fi' },
  long: { protein: 'Protein', carbs: 'Kolhydrater', fat: 'Fett', fiber: 'Fiber' },
} as const;

/**
 * Makron och fiber på en rad: "P 6 g · K 30 g · F 2 g · Fi 4 g". Varje del hålls ihop och
 * raden bryts bara vid "·". Fibern har fiberns färg (`--macro-fiber`, samma som fiberringen);
 * saknas fiberdata visas "–", och en summa där någon post saknar fiber får en markering (*).
 */
export function Macros({ nutrients, fiber, variant = 'short', round = false, lead }: MacrosProps) {
  const labels = LABELS[variant];
  const grams = (value: number) =>
    round ? `${formatInt(Math.round(value))} g` : formatMacroG(value);
  const parts: ReactNode[] = [
    `${labels.protein} ${grams(nutrients.proteinG)}`,
    `${labels.carbs} ${grams(nutrients.carbsG)}`,
    `${labels.fat} ${grams(nutrients.fatG)}`,
  ];
  if (fiber !== undefined) {
    const { text, partial } = fiberText(fiber, round);
    parts.push(
      <span className="macro-fiber" data-testid="fiber">
        {labels.fiber} {text}
        {fiber === null && <span className="visually-hidden"> (fiberdata saknas)</span>}
        {partial && (
          <span className="fiber-partial" data-testid="fiber-partial">
            <span aria-hidden="true">*</span>
            <span className="visually-hidden"> (kan vara i underkant)</span>
          </span>
        )}
      </span>,
    );
  }
  return (
    <>
      {[...(lead == null ? [] : [lead]), ...parts].map((part, i) => (
        <Fragment key={i}>
          {i > 0 && ' · '}
          <span className="nowrap">{part}</span>
        </Fragment>
      ))}
    </>
  );
}
