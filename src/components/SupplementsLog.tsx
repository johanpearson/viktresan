import { useEffect, useRef, useState } from 'react';
import {
  deleteSupplement,
  findFoodByEan,
  findMealByEan,
  findSupplementByEan,
  putSupplement,
  type Supplement,
} from '../db/db.ts';
import { lookupBarcode } from '../lib/barcodeLookup.ts';
import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import { describeSupplement } from '../lib/supplements.ts';
import type { AppData } from '../lib/useAppData.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import { AiLabelImport } from './AiLabelImport.tsx';
import { BarcodeElsewhere } from './BarcodeElsewhere.tsx';
import { BarcodeNotFound } from './BarcodeNotFound.tsx';
import { BarcodeScanner } from './BarcodeScanner.tsx';
import { Card } from './Card.tsx';
import { ListRow } from './ListRow.tsx';
import { SupplementForm, type SupplementPrefill } from './SupplementForm.tsx';
import { SupplementsToday } from './SupplementsToday.tsx';
import { Toast } from './Toast.tsx';

interface SupplementsLogProps {
  data: AppData;
  onChange: () => Promise<AppData>;
  /** Slå upp streckkoden direkt (`#/logga/tillskott/ean/<ean>`, från Mat). */
  initialEan?: string | undefined;
}

type View =
  | { kind: 'list' }
  | {
      kind: 'form';
      supplement: Supplement | null;
      prefill?: SupplementPrefill;
      note?: string;
    }
  | { kind: 'ai'; ean?: string };

type Lookup =
  | { kind: 'idle' }
  | { kind: 'busy'; ean: string }
  | { kind: 'not-found'; ean: string }
  | { kind: 'elsewhere'; ean: string; name: string }
  | { kind: 'error'; message: string };

/**
 * Logga → Tillskott: dagens avbockning, egna tillskott (tryck = redigera, svep = ta bort
 * med Ångra) och tre sätt att lägga till: skanna, AI från etikett eller manuellt.
 */
export function SupplementsLog({ data, onChange, initialEan }: SupplementsLogProps) {
  const features = useFeatures();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [scanning, setScanning] = useState(false);
  const [lookup, setLookup] = useState<Lookup>({ kind: 'idle' });
  const toast = useUndoToast();
  const today = todayIso();

  async function handleEan(ean: string) {
    setScanning(false);
    setLookup({ kind: 'busy', ean });
    const result = await lookupBarcode(ean, {
      context: 'tillskott',
      local: { food: findFoodByEan, meal: findMealByEan, supplement: findSupplementByEan },
      supplementsEnabled: true,
      foodEnabled: features.isEnabled('mat'),
    });
    setLookup({ kind: 'idle' });
    switch (result.kind) {
      case 'supplement':
        setView({
          kind: 'form',
          supplement: result.supplement,
          note: 'Finns redan bland dina tillskott.',
        });
        return;
      case 'off-supplement': {
        const { prefill } = result;
        setView({
          kind: 'form',
          supplement: null,
          prefill: { name: prefill.name, nutrients: prefill.nutrients, ean },
          note:
            prefill.nutrients.length > 0
              ? 'Förifyllt från Open Food Facts (per portion) – kontrollera mot etiketten.'
              : 'Namnet kommer från Open Food Facts, som saknar näringsvärden per portion. Fyll i dem från etiketten.',
        });
        return;
      }
      case 'elsewhere':
        setLookup({ kind: 'elsewhere', ean, name: result.name });
        return;
      case 'error':
        setLookup({ kind: 'error', message: result.message });
        return;
      case 'not-found':
      case 'food':
      case 'meal':
      case 'off-food':
        setLookup({ kind: 'not-found', ean });
    }
  }

  const lookedUp = useRef(false);
  useEffect(() => {
    if (!initialEan || lookedUp.current) return;
    lookedUp.current = true;
    void handleEan(initialEan);
  });

  async function remove(supplement: Supplement) {
    await deleteSupplement(supplement.id);
    setView({ kind: 'list' });
    await onChange();
    toast.show(`Tog bort ${supplement.name}.`, async () => {
      await putSupplement(supplement);
      await onChange();
    });
  }

  const toastView = toast.toast && (
    <Toast
      label="Tillskott"
      testId="supplement-toast"
      message={toast.toast.message}
      onUndo={toast.onUndo}
      onClose={toast.close}
    />
  );

  if (view.kind === 'form') {
    const { supplement } = view;
    return (
      <>
        <SupplementForm
          key={supplement?.id ?? 'ny'}
          supplement={supplement}
          prefill={view.prefill}
          note={view.note}
          onSaved={(saved) => {
            setView({ kind: 'list' });
            void onChange().then(() => {
              toast.show(`Sparade ${saved.name}.`);
            });
          }}
          onCancel={() => {
            setView({ kind: 'list' });
          }}
          {...(supplement ? { onDelete: () => void remove(supplement) } : {})}
        />
        {toastView}
      </>
    );
  }

  if (view.kind === 'ai') {
    const { ean } = view;
    return (
      <AiLabelImport
        kind="tillskott"
        ean={ean}
        onUse={(label) => {
          setView({
            kind: 'form',
            supplement: null,
            prefill: { ...label, ...(ean ? { ean } : {}) },
            note: 'Från AI-tjänstens svar – kontrollera mot etiketten innan du sparar.',
          });
        }}
        onCancel={() => {
          setView({ kind: 'list' });
          if (ean) setLookup({ kind: 'not-found', ean });
        }}
      />
    );
  }

  return (
    <>
      {lookup.kind === 'busy' && (
        <p className="form-note" role="status">
          Slår upp <span className="num">{lookup.ean}</span> …
        </p>
      )}
      {lookup.kind === 'error' && (
        <p className="form-error" role="alert">
          {lookup.message}
        </p>
      )}
      {lookup.kind === 'not-found' && (
        <BarcodeNotFound
          ean={lookup.ean}
          kind="tillskott"
          onAi={() => {
            setView({ kind: 'ai', ean: lookup.ean });
            setLookup({ kind: 'idle' });
          }}
          onManual={() => {
            setView({ kind: 'form', supplement: null, prefill: { ean: lookup.ean } });
            setLookup({ kind: 'idle' });
          }}
        />
      )}
      {lookup.kind === 'elsewhere' && (
        <BarcodeElsewhere
          ean={lookup.ean}
          target="mat"
          name={lookup.name}
          href={`#/mat/ean/${lookup.ean}`}
        />
      )}

      {data.supplements.length > 0 && (
        <Card title="Idag">
          <SupplementsToday
            variant="inline"
            supplements={data.supplements}
            log={data.supplementLog}
            date={today}
            onChange={onChange}
          />
        </Card>
      )}

      <Card title="Lägg till">
        <ul className="list">
          <ListRow
            primary="Skanna streckkod"
            secondary="Söker bland dina tillskott, sedan i Open Food Facts"
            chevron
            onClick={() => {
              setLookup({ kind: 'idle' });
              setScanning(true);
            }}
          />
          <ListRow
            primary="Lägg in med AI från etikett"
            chevron
            onClick={() => {
              setView({ kind: 'ai' });
            }}
          />
          <ListRow
            primary="Lägg in manuellt"
            chevron
            onClick={() => {
              setView({ kind: 'form', supplement: null });
            }}
          />
        </ul>
      </Card>

      <Card title="Mina tillskott">
        {data.supplements.length === 0 ? (
          <p className="form-note muted">
            Inga tillskott ännu. De du lägger till bockas av under Översikt och räknas in i
            näringssummeringen.
          </p>
        ) : (
          <ul className="list" data-testid="supplement-list">
            {data.supplements.map((s) => (
              <ListRow
                key={s.id}
                testId="supplement"
                primary={s.name}
                secondary={describeSupplement(s)}
                chevron
                onClick={() => {
                  setView({ kind: 'form', supplement: s });
                }}
                swipeLeft={{ label: 'Ta bort', onSwipe: () => void remove(s) }}
              />
            ))}
          </ul>
        )}
        {features.isEnabled('mat') && (
          <ul className="list">
            <ListRow
              primary="Näring idag"
              secondary="Vitaminer och mineraler från mat och tillskott"
              chevron
              href="#/mat/naring"
            />
          </ul>
        )}
      </Card>

      {scanning && (
        <BarcodeScanner
          onEan={(ean) => void handleEan(ean)}
          onClose={() => {
            setScanning(false);
          }}
        />
      )}
      {toastView}
    </>
  );
}
