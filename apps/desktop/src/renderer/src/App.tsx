import { useEffect, useState } from "react";
import { Button } from "./components/ui/button";
import { client } from "./orpc";

export default function App() {
  const [pong, setPong] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    client.ping().then(setPong);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-8 p-8">
      <h1 className="text-3xl font-bold">Neovate Desktop</h1>
      <p className="text-muted-foreground">oRPC ping: {pong ?? "..."}</p>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setCount((c) => c + 1)}>Clicked {count} times</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button size="sm">Small</Button>
        <Button size="default">Default</Button>
        <Button size="lg">Large</Button>
        <Button disabled>Disabled</Button>
      </div>
    </div>
  );
}
