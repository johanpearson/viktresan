import {
  foodLabelPrompt,
  parseFoodLabel,
  parseSupplementLabel,
  supplementLabelPrompt,
  type FoodLabel,
  type SupplementLabel,
} from '../lib/aiLabel.ts';
import { formatGrams, formatKcal, formatNutrient } from '../lib/format.ts';
import { nutrientInfo } from '../lib/nutrientUnits.ts';
import { formatDoseAmount } from '../lib/supplements.ts';
import { AiJsonImport } from './AiJsonImport.tsx';
import { ListRow } from './ListRow.tsx';

type AiLabelImportProps = {
  /** Streckkoden (efter en skanning utan träff) – nämns i prompten och sparas. */
  ean?: string | undefined;
  onCancel: () => void;
} & (
  | { kind: 'tillskott'; onUse: (value: SupplementLabel) => void }
  | { kind: 'livsmedel'; onUse: (value: FoodLabel) => void }
);

const STEPS = (what: string) => [
  'Kopiera eller dela prompten till en AI-tjänst (t.ex. ChatGPT eller Claude).',
  `Bifoga en bild av ${what} näringsdeklaration.`,
  'Klistra in svaret nedan och granska värdena.',
];

const COMMON = {
  title: 'Lägg in med AI från etikett',
  previewNote: 'Kontrollera mot etiketten – du kan rätta i nästa steg.',
  useLabel: 'Använd värdena',
  testId: 'ai-label',
};

/**
 * "Lägg in med AI från etikett": kopiera eller dela prompten, fota näringsdeklarationen
 * i en AI-tjänst och klistra in svaret. Svaret valideras mot schemat och visas innan
 * värdena förs över till formuläret, där de kan rättas före sparning. Appen gör inga
 * anrop själv.
 */
export function AiLabelImport(props: AiLabelImportProps) {
  const { ean, onCancel } = props;
  if (props.kind === 'tillskott') {
    return (
      <AiJsonImport
        {...COMMON}
        steps={STEPS('tillskottets')}
        prompt={supplementLabelPrompt(ean)}
        parse={parseSupplementLabel}
        preview={(value) => <SupplementPreview value={value} />}
        onUse={props.onUse}
        onCancel={onCancel}
      />
    );
  }
  return (
    <AiJsonImport
      {...COMMON}
      steps={STEPS('förpackningens')}
      prompt={foodLabelPrompt(ean)}
      parse={parseFoodLabel}
      preview={(value) => <FoodPreview value={value} />}
      onUse={props.onUse}
      onCancel={onCancel}
    />
  );
}

function SupplementPreview({ value }: { value: SupplementLabel }) {
  return (
    <>
      <ListRow primary="Namn" value={value.name} wrapValue />
      <ListRow primary="Per dos" value={formatDoseAmount(value.form, value.amountPerDose)} />
      {value.nutrients.length === 0 ? (
        <ListRow primary="Näringsämnen" value="Inga" />
      ) : (
        value.nutrients.map((n) => (
          <ListRow
            key={n.key}
            primary={nutrientInfo(n.key).label}
            value={formatNutrient(n.amount, n.unit)}
          />
        ))
      )}
    </>
  );
}

function FoodPreview({ value }: { value: FoodLabel }) {
  return (
    <>
      <ListRow primary="Namn" value={value.name} wrapValue />
      <ListRow primary="Energi" secondary="Per 100 g" value={formatKcal(value.kcal)} />
      <ListRow primary="Protein" value={formatGrams(value.proteinG)} />
      <ListRow primary="Kolhydrater" value={formatGrams(value.carbsG)} />
      <ListRow primary="Fett" value={formatGrams(value.fatG)} />
      <ListRow
        primary="Fiber"
        value={value.fiberG === undefined ? 'saknas' : formatGrams(value.fiberG)}
      />
      <ListRow
        primary="Socker"
        value={value.sugarG === undefined ? 'saknas' : formatGrams(value.sugarG)}
      />
      {value.portionG !== undefined && (
        <ListRow primary="Portion" value={formatGrams(value.portionG)} />
      )}
    </>
  );
}
