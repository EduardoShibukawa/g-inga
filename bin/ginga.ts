#!/usr/bin/env bun
import { run } from "../src/cli.ts";

process.exit(run(process.argv.slice(2)));
