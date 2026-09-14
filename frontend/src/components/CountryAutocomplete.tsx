import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COUNTRIES } from '../countries';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
}

export function CountryAutocomplete({ value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = value.trim().toLowerCase();
  const suggestions = query
    ? COUNTRIES.filter((c) => c.toLowerCase().includes(query)).slice(0, 8)
    : COUNTRIES.slice(0, 8);

  function updateRect() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 2, left: r.left, width: r.width });
  }

  useEffect(() => {
    if (!open) return;
    updateRect();
    const handle = () => updateRect();
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [open]);

  function selectValue(v: string) {
    onChange(v);
    setOpen(false);
  }

  function commitOrClear() {
    setOpen(false);
    const exact = COUNTRIES.find((c) => c.toLowerCase() === value.trim().toLowerCase());
    if (exact) {
      if (exact !== value) onChange(exact);
    } else if (value.trim() !== '') {
      onChange('');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && suggestions.length > 0) {
        selectValue(suggestions[highlighted]);
      } else {
        commitOrClear();
      }
      return;
    }
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="autocomplete">
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder ?? 'Start typing...'}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setHighlighted(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(commitOrClear, 150)}
        onKeyDown={handleKeyDown}
      />
      {open &&
        suggestions.length > 0 &&
        rect &&
        createPortal(
          <ul
            className="autocomplete-suggestions"
            style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          >
            {suggestions.map((c, i) => (
              <li key={c}>
                <button
                  type="button"
                  className={i === highlighted ? 'highlighted' : ''}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => selectValue(c)}
                >
                  {c}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
