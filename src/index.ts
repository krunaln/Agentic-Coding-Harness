#!/usr/bin/env node
import { parsePermissionMode } from './permissions.js';
import { parseSessionOptions } from './sessions/options.js';
import { SessionStore } from './sessions/store.js';
import { startApp } from './tui/App.js';
import { SettingsStore } from './providers/settings.js';
import { createWorkspace } from './tools/workspace.js';
import { parseProviderOptions } from './providers/options.js';

try {
    const args = process.argv.slice(2);
    const sessionOptions = parseSessionOptions(args);
    const session = await SessionStore.open({ cwd: process.cwd(), ...sessionOptions });
    const settings = await SettingsStore.open(createWorkspace().root);
    startApp({ permissionMode: parsePermissionMode(args), session, settings, ...parseProviderOptions(args) });
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
