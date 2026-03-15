import debug from "debug";

// Force-enable all neovate debug namespaces so they produce output
// that #pipeConsole in main process can capture and write to log file
debug.enable("neovate:*");
