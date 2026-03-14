import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      return this.props.fallback ? (
        this.props.fallback(error, this.reset)
      ) : (
        <DefaultFallback error={error} reset={this.reset} />
      );
    }
    return this.props.children;
  }
}

function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium text-destructive">{t("error.somethingWentWrong")}</p>
      <pre className="max-w-md overflow-auto rounded-md bg-muted px-4 py-3 text-left text-xs text-muted-foreground">
        {error.message}
      </pre>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
      >
        {t("error.tryAgain")}
      </button>
    </div>
  );
}
