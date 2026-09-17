import React from "react";
import { render } from "ink";
import { resolve } from "node:path";
import { App } from "./app.tsx";
import { CLI_HELP, CLI_VERSION, QUICKSTART, runDoctorCommand, runUpdateCommand } from "./commands.ts";
import { runSetupCommand } from "./setup.ts";

const args = process.argv.slice(2);
const command = args[0];
if (command === "setup") {
  process.exitCode = await runSetupCommand(args.slice(1));
} else if (command === "doctor") {
  process.exitCode = await runDoctorCommand();
} else if (command === "quickstart") {
  process.stdout.write(QUICKSTART + "\n");
} else if (command === "update") {
  process.exitCode = await runUpdateCommand();
} else if (command === "--help" || command === "-h" || command === "help") {
  process.stdout.write(CLI_HELP + "\n");
} else if (command === "--version" || command === "-v") {
  process.stdout.write(CLI_VERSION + "\n");
} else {
  const continueLatest = args.includes("--continue") || args.includes("-c");
  const pathArgument = args.find((argument) => !argument.startsWith("-"));
  const cwd = resolve(pathArgument ?? process.cwd());

  render(<App cwd={cwd} continueLatest={continueLatest} />, {
    exitOnCtrlC: true,
    patchConsole: true,
  });
}
