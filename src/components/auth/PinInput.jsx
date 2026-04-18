// OTP-style 4-box PIN input.
// Behaviors mirrored from the mockup wirePinBoxes() helper:
//   - Auto-advance to next box on digit
//   - Backspace clears current; if already empty, jump back & clear
//   - ArrowLeft / ArrowRight move between boxes
//   - Enter submits via onSubmit
//   - Paste of 4 digits fills all boxes at once

import { useEffect, useRef } from 'react';

export function PinInput({
  value,
  onChange,
  onSubmit,
  length = 4,
  autoFocus = true,
  hasError = false,
  ariaLabel = 'PIN',
  disabled = false,
}) {
  const inputs = useRef([]);

  // Pad / clamp incoming value so it always matches `length`.
  const digits = String(value || '').slice(0, length).padEnd(length, '');

  useEffect(() => {
    if (!autoFocus) return;
    inputs.current[0]?.focus();
  }, [autoFocus]);

  function setDigit(i, d) {
    const arr = digits.split('');
    arr[i] = d;
    onChange(arr.join('').replace(/\s/g, '').slice(0, length));
  }

  function focusBox(i) {
    const el = inputs.current[Math.max(0, Math.min(length - 1, i))];
    if (el) {
      el.focus();
      el.select?.();
    }
  }

  function handleKeyDown(i, e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit?.();
      return;
    }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); focusBox(i - 1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); focusBox(i + 1); return; }
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[i] && digits[i] !== '') {
        setDigit(i, '');
      } else if (i > 0) {
        setDigit(i - 1, '');
        focusBox(i - 1);
      }
      return;
    }
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      setDigit(i, e.key);
      focusBox(i + 1);
    }
  }

  function handlePaste(e) {
    const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted.padEnd(length, '').slice(0, length).trimEnd());
    focusBox(Math.min(pasted.length, length - 1));
  }

  return (
    <div
      className="flex gap-3 justify-center"
      role="group"
      aria-label={ariaLabel}
    >
      {Array.from({ length }).map((_, i) => {
        const ch = digits[i] === ' ' ? '' : digits[i];
        return (
          <input
            key={i}
            ref={(el) => { inputs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            disabled={disabled}
            aria-label={`${ariaLabel} digit ${i + 1}`}
            value={ch || ''}
            onChange={() => { /* handled in keyDown */ }}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            className={[
              'pin-box',
              ch ? 'filled' : '',
              hasError ? 'error' : '',
            ].filter(Boolean).join(' ')}
          />
        );
      })}
    </div>
  );
}
