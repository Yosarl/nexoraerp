/**
 * Global Dialog Keyboard Navigation & Auto-Focus Utility
 *
 * Automatically focuses the action button in any dialog box that appears
 * across the entire app and enables arrow button navigation (Left, Right, Up, Down)
 * between the buttons.
 */

function isVisible(el: HTMLElement): boolean {
  if (!el || !el.isConnected) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
}

export function getTopmostActiveDialog(): HTMLElement | null {
  // If active element is inside a dialog, that dialog is active
  if (document.activeElement && document.activeElement !== document.body) {
    const dialogParent = document.activeElement.closest<HTMLElement>('.MuiDialog-paper, [role="dialog"]');
    if (dialogParent && isVisible(dialogParent)) {
      return dialogParent;
    }
  }

  // Find all open dialog roots in DOM
  const dialogRoots = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.MuiDialog-root:not([aria-hidden="true"]), [role="dialog"]:not([aria-hidden="true"]), dialog[open]'
    )
  );

  for (let i = dialogRoots.length - 1; i >= 0; i--) {
    const root = dialogRoots[i];
    if (isVisible(root)) {
      if (root.matches('[role="dialog"], .MuiDialog-paper')) {
        return root;
      }
      const paper = root.querySelector<HTMLElement>('[role="dialog"], .MuiDialog-paper');
      if (paper && isVisible(paper)) {
        return paper;
      }
      return root;
    }
  }

  return null;
}

export function getDialogNavButtons(dialogEl: HTMLElement): HTMLButtonElement[] {
  if (!dialogEl) return [];

  // 1. Check for DialogActions first
  const actionsEl = dialogEl.querySelector('.MuiDialogActions-root, [class*="DialogActions"]');
  if (actionsEl && isVisible(actionsEl as HTMLElement)) {
    const actionBtns = Array.from(actionsEl.querySelectorAll<HTMLButtonElement>('button')).filter(
      (btn) => !btn.disabled && isVisible(btn) && btn.getAttribute('tabindex') !== '-1'
    );
    if (actionBtns.length > 0) {
      return actionBtns;
    }
  }

  // 2. Fallback: all buttons in the dialog
  const allBtns = Array.from(dialogEl.querySelectorAll<HTMLButtonElement>('button')).filter(
    (btn) => !btn.disabled && isVisible(btn) && btn.getAttribute('tabindex') !== '-1'
  );

  if (allBtns.length <= 1) {
    return allBtns;
  }

  // Filter out top-right close buttons if other buttons exist
  const nonCloseBtns = allBtns.filter((btn) => {
    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
    if (ariaLabel === 'close') return false;
    if (btn.closest('.MuiDialogTitle-root, [class*="DialogTitle"]')) {
      if (btn.classList.contains('MuiIconButton-root') || btn.querySelector('svg')) {
        return false;
      }
    }
    return true;
  });

  return nonCloseBtns.length > 0 ? nonCloseBtns : allBtns;
}

export function getPreferredButton(buttons: HTMLButtonElement[]): HTMLButtonElement | null {
  if (!buttons || buttons.length === 0) return null;
  if (buttons.length === 1) return buttons[0];

  // 1. Explicit autoFocus or data-confirm-btn or data-autofocus
  const autoFocusBtn = buttons.find(
    (b) =>
      b.hasAttribute('autofocus') ||
      b.hasAttribute('data-confirm-btn') ||
      b.hasAttribute('data-autofocus')
  );
  if (autoFocusBtn) return autoFocusBtn;

  // 2. Contained / Primary / Submit button
  const containedBtn = buttons.find(
    (b) =>
      b.classList.contains('MuiButton-contained') ||
      b.getAttribute('type') === 'submit' ||
      b.getAttribute('data-variant') === 'contained'
  );
  if (containedBtn) return containedBtn;

  // 3. Button with text suggesting affirmative action
  const confirmRegex = /^(ok|confirm|yes|save|delete|proceed|submit|agree|done)$/i;
  const matchTextBtn = buttons.find((b) => confirmRegex.test((b.textContent || '').trim()));
  if (matchTextBtn) return matchTextBtn;

  // 4. If 2 buttons and first is Cancel/Close/No/Discard, focus the second (action button)
  if (buttons.length === 2) {
    const firstText = (buttons[0].textContent || '').trim();
    if (/^(cancel|close|no|discard|back)$/i.test(firstText)) {
      return buttons[1];
    }
  }

  // 5. Default to the last button (standard in DialogActions)
  return buttons[buttons.length - 1];
}

let focusTimeoutIds: number[] = [];

function clearScheduledFocus() {
  focusTimeoutIds.forEach((id) => clearTimeout(id));
  focusTimeoutIds = [];
}

export function scheduleFocusTopmostDialogButton() {
  clearScheduledFocus();

  const delays = [0, 40, 100, 220, 380];
  delays.forEach((delay) => {
    const id = window.setTimeout(() => {
      const dialog = getTopmostActiveDialog();
      if (!dialog || !dialog.isConnected) return;

      const activeEl = document.activeElement as HTMLElement | null;

      // 1. If active element is already an editable input inside this dialog, NEVER steal focus!
      if (activeEl && dialog.contains(activeEl)) {
        const tagName = activeEl.tagName.toLowerCase();
        if (
          (tagName === 'input' &&
            !['button', 'submit', 'reset', 'checkbox', 'radio'].includes(
              (activeEl as HTMLInputElement).type
            )) ||
          tagName === 'textarea' ||
          tagName === 'select' ||
          activeEl.isContentEditable ||
          activeEl.getAttribute('role') === 'textbox' ||
          activeEl.getAttribute('role') === 'combobox'
        ) {
          return;
        }
      }

      // 2. Check if the dialog contains any visible, enabled editable text inputs or form fields
      const editableInputs = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled])'
        )
      ).filter(isVisible);

      if (editableInputs.length > 0) {
        // If focus is already somewhere inside the dialog, do not disturb it
        if (activeEl && dialog.contains(activeEl)) {
          return;
        }

        // Auto-focus the preferred input (autofocus, data-autofocus, or first input)
        const autoFocusInput = editableInputs.find(
          (el) =>
            el.hasAttribute('autofocus') ||
            el.getAttribute('data-autofocus') === 'true' ||
            el.hasAttribute('data-autofocus')
        );
        const targetInput = autoFocusInput || editableInputs[0];
        if (targetInput) {
          targetInput.focus();
          if ('select' in targetInput && typeof (targetInput as HTMLInputElement).select === 'function') {
            (targetInput as HTMLInputElement).select();
          }
        }
        return;
      }

      // 3. For confirmation/alert dialogs with no form inputs: focus action button
      const buttons = getDialogNavButtons(dialog);
      if (!buttons.length) return;

      // If focus is already on one of the dialog's buttons, do not overwrite (respect user navigation)
      if (buttons.includes(document.activeElement as HTMLButtonElement)) {
        return;
      }

      const preferred = getPreferredButton(buttons);
      if (preferred) {
        preferred.focus();
      }
    }, delay);
    focusTimeoutIds.push(id);
  });
}

function handleGlobalDialogKeyDown(e: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    return;
  }

  const activeEl = document.activeElement as HTMLElement | null;

  // Do not intercept if user is typing in a text field, textarea, select, or combobox
  if (activeEl) {
    const tagName = activeEl.tagName.toLowerCase();
    if (
      (tagName === 'input' &&
        !['button', 'submit', 'reset', 'checkbox', 'radio'].includes(
          (activeEl as HTMLInputElement).type
        )) ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      activeEl.isContentEditable ||
      activeEl.getAttribute('role') === 'combobox' ||
      activeEl.getAttribute('role') === 'textbox'
    ) {
      return;
    }
  }

  // Check if there is an active dialog
  const dialog = getTopmostActiveDialog();
  if (!dialog) return;

  // Ensure active element is inside this dialog or focus is on body/window
  if (activeEl && !dialog.contains(activeEl) && activeEl !== document.body) {
    return;
  }

  const buttons = getDialogNavButtons(dialog);
  if (!buttons.length) return;

  e.preventDefault();
  e.stopPropagation();

  const currentIndex = buttons.indexOf(activeEl as HTMLButtonElement);

  if (currentIndex === -1) {
    // Focus was on the paper or title, not on a button yet
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      buttons[0].focus();
    } else {
      const preferred = getPreferredButton(buttons);
      if (preferred) preferred.focus();
      else buttons[0].focus();
    }
    return;
  }

  let nextIndex: number;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    nextIndex = (currentIndex + 1) % buttons.length;
  } else {
    nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
  }

  buttons[nextIndex].focus();
}

let isInitialized = false;

export function initGlobalDialogKeyboardNav(): () => void {
  if (typeof window === 'undefined' || isInitialized) {
    return () => {};
  }
  isInitialized = true;

  // 1. Keyboard navigation listener (capture phase)
  window.addEventListener('keydown', handleGlobalDialogKeyDown, true);

  // 2. MutationObserver to detect dialogs appearing/opening
  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node instanceof HTMLElement) {
            if (
              node.matches('.MuiDialog-root, [role="dialog"], dialog') ||
              node.querySelector('.MuiDialog-root, [role="dialog"], dialog')
            ) {
              shouldCheck = true;
              break;
            }
          }
        }
      } else if (mutation.type === 'attributes') {
        const target = mutation.target as HTMLElement;
        if (
          target &&
          (target.matches?.('.MuiDialog-root, [role="dialog"], dialog') ||
            target.getAttribute?.('role') === 'dialog')
        ) {
          shouldCheck = true;
        }
      }
      if (shouldCheck) break;
    }

    if (shouldCheck) {
      scheduleFocusTopmostDialogButton();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'aria-hidden', 'open'],
  });

  // Initial check if any dialog is already open
  scheduleFocusTopmostDialogButton();

  return () => {
    window.removeEventListener('keydown', handleGlobalDialogKeyDown, true);
    observer.disconnect();
    clearScheduledFocus();
    isInitialized = false;
  };
}
