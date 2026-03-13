import { EditorStatus } from "./type";

export function LoadingState({ status }: { status: EditorStatus }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground bg-background w-full h-full">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">{status === "starting" ? "Starting editor..." : "Loading..."}</p>
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground bg-background w-full h-full">
      <p className="text-sm text-red-500">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 text-sm rounded-md bg-card text-foreground border border-border"
      >
        Retry
      </button>
    </div>
  );
}
