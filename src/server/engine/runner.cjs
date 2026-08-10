/**
 * Stockfish WASM runner. Spawned as a child process by the Next.js server
 * so engine search never blocks the app's event loop. Bridges newline-
 * delimited UCI commands on stdin to the engine, and engine output lines
 * to stdout.
 */
const path = require("path");

// Resolve the stockfish package relative to the project root (this file is
// executed directly by node, outside any bundler).
const initEngine = require(path.join(__dirname, "..", "..", "..", "node_modules", "stockfish"));

initEngine("lite-single")
  .then((engine) => {
    engine.listener = (line) => {
      process.stdout.write(line + "\n");
    };

    let buffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const cmd = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (cmd === "__quit__") process.exit(0);
        if (cmd) engine.sendCommand(cmd);
      }
    });
    process.stdin.on("end", () => process.exit(0));

    process.stdout.write("__engine_ready__\n");
  })
  .catch((err) => {
    process.stderr.write("Failed to initialize Stockfish: " + err + "\n");
    process.exit(1);
  });
