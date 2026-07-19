'use client';

// Single canonical web toggle — matches the weather "Activar alertas" switch.
// 44×24 track, 16px knob inset 4px, moved via an inline transform (Tailwind
// translate-x utilities rendered inconsistently across the settings forms).

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

export function Toggle({ checked, onChange, disabled, ...rest }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${
        checked ? 'bg-primary' : 'bg-border'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      {...rest}
    >
      <span
        className="absolute top-1 left-1 w-4 h-4 rounded-full bg-card transition-transform"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  );
}
