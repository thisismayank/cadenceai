import React from "react";
import { render } from "ink";
import { resolve } from "node:path";
import { App } from "./app.tsx";

const args = process.argv.slice(2);
const continueLatest = args.includes("--continue") || args.includes("-c");
const pathArgument = args.find((argument) => !argument.startsWith("-"));
const cwd = resolve(pathArgument ?? process.cwd());

render(<App cwd={cwd} continueLatest={continueLatest} />, {
  exitOnCtrlC: true,
  patchConsole: true,
});
