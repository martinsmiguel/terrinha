import { useEffect, useRef } from 'react';
import { nextFocusIndex } from '../game/focusTrap';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Mantém Tab/Shift+Tab dentro do diálogo, move o foco para ele ao abrir e o devolve
 * ao gatilho ao fechar. Aplicar `ref`, `tabIndex={-1}` e `role="dialog"` no painel.
 */
export function useDialogFocus<T extends HTMLElement>(active = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return undefined;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    (items()[0] ?? node).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const list = items();
      event.preventDefault();
      if (list.length === 0) { node.focus(); return; }
      const index = nextFocusIndex(list.indexOf(document.activeElement as HTMLElement), list.length, event.shiftKey);
      list[index].focus();
    };
    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [active]);
  return ref;
}
