interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

/** Interrupteur clair/sombre-safe (checkbox stylée), avec son libellé. */
export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch__track">
        <span className="switch__thumb" />
      </span>
      <span className="switch__label">{label}</span>
    </label>
  );
}
