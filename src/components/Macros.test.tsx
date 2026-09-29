import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Macros } from './Macros.tsx';

const nutrients = { proteinG: 6, carbsG: 30.2, fatG: 2 };

describe('Macros', () => {
  it('visar makron och fiber på en rad', () => {
    const { container, getByTestId } = render(
      <Macros nutrients={nutrients} fiber={{ fiberG: 4, partial: false }} />,
    );
    expect(container.textContent).toBe('P 6,0 g · K 30 g · F 2,0 g · Fi 4,0 g');
    expect(getByTestId('fiber')).toHaveClass('macro-fiber');
  });

  it('saknad fiber visas som "–", inte 0', () => {
    const { getByTestId } = render(<Macros nutrients={nutrients} fiber={null} />);
    expect(getByTestId('fiber').textContent).toBe('Fi – (fiberdata saknas)');
  });

  it('en summa där någon post saknar fiber får en markering', () => {
    const { getByTestId } = render(
      <Macros variant="long" round nutrients={nutrients} fiber={{ fiberG: 9.6, partial: true }} />,
    );
    expect(getByTestId('fiber').textContent).toBe('Fiber 10 g* (kan vara i underkant)');
    expect(getByTestId('fiber-partial')).toBeInTheDocument();
  });

  it('utelämnar fibern medan fiberdatan laddas', () => {
    const { container, queryByTestId } = render(
      <Macros lead="70 g" nutrients={nutrients} fiber={undefined} />,
    );
    expect(queryByTestId('fiber')).toBeNull();
    expect(container.textContent).toBe('70 g · P 6,0 g · K 30 g · F 2,0 g');
  });
});
