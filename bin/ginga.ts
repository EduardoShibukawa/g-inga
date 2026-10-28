#!/usr/bin/env bun
import { run } from "../src/cli.ts";

process.exitCode = await run(process.argv.slice(2));
