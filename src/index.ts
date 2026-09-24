#!/usr/bin/env node
import { parsePermissionMode } from './permissions.js';
import { parseSessionOptions } from './sessions/options.js';
import { SessionStore } from './sessions/store.js';
import { startApp } from './tui/App.js';

try {
    const args = process.argv.slice(2);
    const sessionOptions = parseSessionOptions(args);
    const session = await SessionStore.open({ cwd: process.cwd(), ...sessionOptions });
    startApp({ permissionMode: parsePermissionMode(args), session });
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
