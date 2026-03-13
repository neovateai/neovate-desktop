import { cn } from "../../../lib/utils";
import { useQueryStatus } from "../hooks/use-query-status";

// [gerund, pastTense] pairs — full set from Claude Code CLI
export const VERBS: [string, string][] = [
  ["Accomplishing", "Accomplished"],
  ["Actioning", "Actioned"],
  ["Actualizing", "Actualized"],
  ["Architecting", "Architected"],
  ["Baking", "Baked"],
  ["Beaming", "Beamed"],
  ["Beboppin'", "Bebopped"],
  ["Befuddling", "Befuddled"],
  ["Billowing", "Billowed"],
  ["Blanching", "Blanched"],
  ["Bloviating", "Bloviated"],
  ["Boogieing", "Boogied"],
  ["Boondoggling", "Boondoggled"],
  ["Booping", "Booped"],
  ["Bootstrapping", "Bootstrapped"],
  ["Brewing", "Brewed"],
  ["Bunning", "Bunned"],
  ["Burrowing", "Burrowed"],
  ["Calculating", "Calculated"],
  ["Canoodling", "Canoodled"],
  ["Caramelizing", "Caramelized"],
  ["Cascading", "Cascaded"],
  ["Catapulting", "Catapulted"],
  ["Cerebrating", "Cerebrated"],
  ["Channeling", "Channeled"],
  ["Channelling", "Channelled"],
  ["Choreographing", "Choreographed"],
  ["Churning", "Churned"],
  ["Clauding", "Clauded"],
  ["Coalescing", "Coalesced"],
  ["Cogitating", "Cogitated"],
  ["Combobulating", "Combobulated"],
  ["Composing", "Composed"],
  ["Computing", "Computed"],
  ["Concocting", "Concocted"],
  ["Considering", "Considered"],
  ["Contemplating", "Contemplated"],
  ["Cooking", "Cooked"],
  ["Crafting", "Crafted"],
  ["Creating", "Created"],
  ["Crunching", "Crunched"],
  ["Crystallizing", "Crystallized"],
  ["Cultivating", "Cultivated"],
  ["Deciphering", "Deciphered"],
  ["Deliberating", "Deliberated"],
  ["Determining", "Determined"],
  ["Dilly-dallying", "Dilly-dallied"],
  ["Discombobulating", "Discombobulated"],
  ["Doing", "Done"],
  ["Doodling", "Doodled"],
  ["Drizzling", "Drizzled"],
  ["Ebbing", "Ebbed"],
  ["Effecting", "Effected"],
  ["Elucidating", "Elucidated"],
  ["Embellishing", "Embellished"],
  ["Enchanting", "Enchanted"],
  ["Envisioning", "Envisioned"],
  ["Evaporating", "Evaporated"],
  ["Fermenting", "Fermented"],
  ["Fiddle-faddling", "Fiddle-faddled"],
  ["Finagling", "Finagled"],
  ["Flambéing", "Flambéed"],
  ["Flibbertigibbeting", "Flibbertigibbeted"],
  ["Flowing", "Flowed"],
  ["Flummoxing", "Flummoxed"],
  ["Fluttering", "Fluttered"],
  ["Forging", "Forged"],
  ["Forming", "Formed"],
  ["Frolicking", "Frolicked"],
  ["Frosting", "Frosted"],
  ["Gallivanting", "Gallivanted"],
  ["Galloping", "Galloped"],
  ["Garnishing", "Garnished"],
  ["Generating", "Generated"],
  ["Gesticulating", "Gesticulated"],
  ["Germinating", "Germinated"],
  ["Gitifying", "Gitified"],
  ["Grooving", "Grooved"],
  ["Gusting", "Gusted"],
  ["Harmonizing", "Harmonized"],
  ["Hashing", "Hashed"],
  ["Hatching", "Hatched"],
  ["Herding", "Herded"],
  ["Honking", "Honked"],
  ["Hullaballooing", "Hullaballooed"],
  ["Hyperspacing", "Hyperspaced"],
  ["Ideating", "Ideated"],
  ["Imagining", "Imagined"],
  ["Improvising", "Improvised"],
  ["Incubating", "Incubated"],
  ["Inferring", "Inferred"],
  ["Infusing", "Infused"],
  ["Ionizing", "Ionized"],
  ["Jitterbugging", "Jitterbugged"],
  ["Julienning", "Julienned"],
  ["Kneading", "Kneaded"],
  ["Leavening", "Leavened"],
  ["Levitating", "Levitated"],
  ["Lollygagging", "Lollygagged"],
  ["Manifesting", "Manifested"],
  ["Marinating", "Marinated"],
  ["Meandering", "Meandered"],
  ["Metamorphosing", "Metamorphosed"],
  ["Misting", "Misted"],
  ["Moonwalking", "Moonwalked"],
  ["Moseying", "Moseyed"],
  ["Mulling", "Mulled"],
  ["Mustering", "Mustered"],
  ["Musing", "Mused"],
  ["Nebulizing", "Nebulized"],
  ["Nesting", "Nested"],
  ["Newspapering", "Newspapered"],
  ["Noodling", "Noodled"],
  ["Nucleating", "Nucleated"],
  ["Orbiting", "Orbited"],
  ["Orchestrating", "Orchestrated"],
  ["Osmosing", "Osmosed"],
  ["Perambulating", "Perambulated"],
  ["Percolating", "Percolated"],
  ["Perusing", "Perused"],
  ["Philosophising", "Philosophised"],
  ["Photosynthesizing", "Photosynthesized"],
  ["Pollinating", "Pollinated"],
  ["Pondering", "Pondered"],
  ["Pontificating", "Pontificated"],
  ["Pouncing", "Pounced"],
  ["Precipitating", "Precipitated"],
  ["Prestidigitating", "Prestidigitated"],
  ["Processing", "Processed"],
  ["Proofing", "Proofed"],
  ["Propagating", "Propagated"],
  ["Puttering", "Puttered"],
  ["Puzzling", "Puzzled"],
  ["Quantumizing", "Quantumized"],
  ["Razzle-dazzling", "Razzle-dazzled"],
  ["Razzmatazzing", "Razzmatazzed"],
  ["Recombobulating", "Recombobulated"],
  ["Reticulating", "Reticulated"],
  ["Roosting", "Roosted"],
  ["Ruminating", "Ruminated"],
  ["Sautéing", "Sautéed"],
  ["Scampering", "Scampered"],
  ["Schlepping", "Schlepped"],
  ["Scurrying", "Scurried"],
  ["Seasoning", "Seasoned"],
  ["Shenaniganing", "Shenaniganed"],
  ["Shimmying", "Shimmied"],
  ["Simmering", "Simmered"],
  ["Skedaddling", "Skedaddled"],
  ["Sketching", "Sketched"],
  ["Slithering", "Slithered"],
  ["Smooshing", "Smooshed"],
  ["Sock-hopping", "Sock-hopped"],
  ["Spelunking", "Spelunked"],
  ["Spinning", "Spun"],
  ["Sprouting", "Sprouted"],
  ["Stewing", "Stewed"],
  ["Sublimating", "Sublimated"],
  ["Swirling", "Swirled"],
  ["Swooping", "Swooped"],
  ["Symbioting", "Symbioted"],
  ["Synthesizing", "Synthesized"],
  ["Tempering", "Tempered"],
  ["Thinking", "Thought"],
  ["Thundering", "Thundered"],
  ["Tinkering", "Tinkered"],
  ["Tomfoolering", "Tomfoolered"],
  ["Topsy-turvying", "Topsy-turvied"],
  ["Transfiguring", "Transfigured"],
  ["Transmuting", "Transmuted"],
  ["Twisting", "Twisted"],
  ["Undulating", "Undulated"],
  ["Unfurling", "Unfurled"],
  ["Unravelling", "Unravelled"],
  ["Vibing", "Vibed"],
  ["Waddling", "Waddled"],
  ["Wandering", "Wandered"],
  ["Warping", "Warped"],
  ["Whatchamacalliting", "Whatchamacallited"],
  ["Whirlpooling", "Whirlpooled"],
  ["Whirring", "Whirred"],
  ["Whisking", "Whisked"],
  ["Wibbling", "Wibbled"],
  ["Working", "Worked"],
  ["Wrangling", "Wrangled"],
  ["Zesting", "Zested"],
  ["Zigzagging", "Zigzagged"],
];

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ${s % 60}s`;
}

function formatThinkingDuration(ms: number): string {
  return `${Math.max(1, Math.round(ms / 1000))}s`;
}

export function QueryStatus({ sessionId }: { sessionId: string }) {
  const status = useQueryStatus(sessionId);

  if (status.phase === "idle") return null;

  const isCompleting = status.phase === "completing";

  // Build the detail parts inside parentheses
  const details: string[] = [];
  details.push(formatElapsed(status.elapsedMs));
  if (status.isThinking) {
    // will be rendered separately with animation
  } else if (status.thinkingDurationMs !== null && status.thinkingDurationMs > 0) {
    details.push(`thought for ${formatThinkingDuration(status.thinkingDurationMs)}`);
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-3 py-1 text-xs transition-opacity duration-300",
        isCompleting ? "opacity-0" : "opacity-100",
      )}
    >
      <span
        className={cn(
          "font-mono",
          status.isStalled ? "text-destructive/60" : "text-muted-foreground",
        )}
      >
        {status.spinnerFrame}
      </span>
      <span className="text-muted-foreground">
        {isCompleting ? (
          <>
            {status.pastVerb} for {formatElapsed(status.elapsedMs)}
          </>
        ) : (
          <>
            {status.verb}…{" "}
            <span className="text-muted-foreground/70">
              ({details.join(" · ")}
              {status.isThinking && <span className="animate-pulse"> · thinking…</span>})
            </span>
          </>
        )}
      </span>
    </div>
  );
}
