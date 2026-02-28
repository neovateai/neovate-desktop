import { useState, type FormEvent } from "react";
import { Button } from "../../../components/ui/button";

type Props = {
  onSend: (message: string) => void;
  onCancel: () => void;
  streaming: boolean;
  disabled?: boolean;
};

export function MessageInput({ onSend, onCancel, streaming, disabled }: Props) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || streaming) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-4">
      <input
        type="text"
        className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        placeholder="Type a message..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled || streaming}
      />
      {streaming ? (
        <Button type="button" variant="destructive" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      ) : (
        <Button type="submit" size="sm" disabled={disabled || !value.trim()}>
          Send
        </Button>
      )}
    </form>
  );
}
