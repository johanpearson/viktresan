import { Fragment } from 'react';

/**
 * "6 000 steg · 827 kcal" där varje del hålls ihop (`.nowrap`): texten bryts bara vid "·",
 * aldrig mellan en siffra och dess enhet.
 */
export function Parts({ text, separator = ' · ' }: { text: string; separator?: string }) {
  return (
    <>
      {text.split(separator).map((part, i) => (
        <Fragment key={i}>
          {i > 0 && separator}
          <span className="nowrap">{part}</span>
        </Fragment>
      ))}
    </>
  );
}
