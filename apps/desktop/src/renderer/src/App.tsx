import { AgentChat } from "./features/acp";

export default function App() {
  return (
    <div data-testid="app-root" className="flex h-screen flex-col">
      <header className="flex items-center border-b border-border px-4 py-2">
        <h1 data-testid="app-title" className="text-sm font-semibold">
          Neovate Desktop
        </h1>
      </header>
      <main className="flex-1 overflow-hidden">
        <AgentChat />
      </main>
    </div>
  );
}
