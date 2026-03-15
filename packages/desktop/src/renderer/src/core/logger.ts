import debug from "debug";

// Force-enable all neovate debug namespaces so they produce output
// that #pipeConsole in main process can capture and write to log file
debug.enable("neovate:*");

// Flatten args into a single string so Electron's console-message event
// doesn't lose objects as [object Object]
debug.formatArgs = function (this: debug.Debugger, args: unknown[]) {
  const rest = args
    .slice(1)
    .map((a) => (typeof a === "object" && a !== null ? JSON.stringify(a) : a));
  args.length = 1;
  args[0] = rest.length
    ? `${this.namespace} ${args[0]} ${rest.join(" ")}`
    : `${this.namespace} ${args[0]}`;
};
