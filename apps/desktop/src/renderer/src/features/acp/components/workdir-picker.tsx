type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function WorkdirPicker({ value, onChange, disabled }: Props) {
  return (
    <input
      type="text"
      className="h-8 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
      placeholder="Working directory (optional)"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  );
}
