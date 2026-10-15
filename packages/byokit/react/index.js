import { createElement, useEffect, useRef } from 'react';
import { mountByok } from '../dom/index.js';
/** Memoize options to preserve drafts across parent renders. Changing options remounts. */
export function ByokSettings({ options, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const ui = mountByok(ref.current, options);
    return () => ui.destroy();
  }, [options]);
  return createElement('div', { ref, className });
}
