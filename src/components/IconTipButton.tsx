import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Hur länge ett tryck ska hållas för att visa namnet i stället för att öppna. */
const LONG_PRESS_MS = 500;
/** Hur länge namnet visas (försvinner tidigare vid tryck eller scroll). */
const TIP_MS = 4000;

interface IconTipButtonProps {
  /** Knappens namn – även texten i tooltipen. */
  label: string;
  icon: ReactNode;
  className?: string;
  testId?: string;
  /** Visa namnet direkt (första gången knappen visas). */
  showTip?: boolean;
  /** Anropas när namnet visats första gången (spara att det är sett). */
  onTipShown?: () => void;
  onClick: () => void;
}

/**
 * Ikonknapp (minst 44 px) med en kort tooltip med namnet: vid långtryck (öppnar inte) och, med
 * `showTip`, första gången. Tooltipen är bara visuell – namnet finns redan i `aria-label`.
 */
export function IconTipButton({
  label,
  icon,
  className = '',
  testId,
  showTip = false,
  onTipShown,
  onClick,
}: IconTipButtonProps) {
  const [tip, setTip] = useState(showTip);
  // `showTip` blir sant när inställningarna lästs: visa namnet då (härlett tillstånd, inte effekt).
  const [prevShowTip, setPrevShowTip] = useState(showTip);
  if (showTip !== prevShowTip) {
    setPrevShowTip(showTip);
    if (showTip) setTip(true);
  }
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  useEffect(() => {
    if (showTip) onTipShown?.();
  }, [showTip, onTipShown]);

  useEffect(() => {
    if (!tip) return;
    const hide = () => {
      setTip(false);
    };
    const timer = window.setTimeout(hide, TIP_MS);
    // Nästa tryck eller scroll döljer namnet (efter långtrycket som visade det).
    const listen = window.setTimeout(() => {
      document.addEventListener('pointerdown', hide, true);
      window.addEventListener('scroll', hide, { capture: true, passive: true });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(listen);
      document.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('scroll', hide, { capture: true });
    };
  }, [tip]);

  useEffect(
    () => () => {
      if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    },
    [],
  );

  function cancelPress() {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  return (
    <span className="icon-tip-anchor">
      <button
        type="button"
        className={`icon-button ${className}`.trim()}
        aria-label={label}
        aria-haspopup="dialog"
        data-testid={testId}
        onPointerDown={() => {
          longPressed.current = false;
          cancelPress();
          pressTimer.current = window.setTimeout(() => {
            longPressed.current = true;
            setTip(true);
          }, LONG_PRESS_MS);
        }}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => {
          e.preventDefault();
        }}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          setTip(false);
          onClick();
        }}
      >
        {icon}
      </button>
      {tip && (
        <span
          className="icon-tip"
          aria-hidden="true"
          data-testid={testId ? `${testId}-tip` : undefined}
        >
          {label}
        </span>
      )}
    </span>
  );
}
