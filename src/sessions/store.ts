import { appendFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { mapStoredMessagesToChatMessages, type BaseMessage, type StoredMessage } from '@langchain/core/messages';

export type SessionHeader = {
    type: 'session'; id: string; cwd: string; createdAt: string;
};
type TurnRecord = { type: 'turn'; createdAt: string; messages: StoredMessage[] };

function projectKey(cwd: string) {
    return createHash('sha256').update(path.resolve(cwd).toLowerCase()).digest('hex').slice(0, 16);
}

export class SessionStore {
    private constructor(
        readonly header: SessionHeader,
        readonly filePath: string,
        readonly history: BaseMessage[],
        readonly persistent: boolean,
    ) {}

    static async open(options: {
        cwd: string; continue?: boolean; resume?: string; persistent?: boolean; baseDir?: string;
    }) {
        const persistent = options.persistent ?? true;
        const baseDir = options.baseDir ?? path.join(homedir(), '.myai', 'sessions');
        const directory = path.join(baseDir, projectKey(options.cwd));
        if (!persistent) {
            return new SessionStore({ type: 'session', id: randomUUID(), cwd: path.resolve(options.cwd), createdAt: new Date().toISOString() }, '', [], false);
        }
        await mkdir(directory, { recursive: true });
        let existing: string | undefined;
        if (options.resume) {
            const candidate = path.resolve(options.resume);
            try { if ((await stat(candidate)).isFile()) existing = candidate; } catch { /* treat as id */ }
            if (!existing) {
                const files = await readdir(directory);
                const matches = files.filter(file => file.endsWith('.jsonl') && file.includes(options.resume!));
                if (matches.length !== 1) throw new Error(matches.length ? `Session id is ambiguous: ${options.resume}` : `Session not found: ${options.resume}`);
                existing = path.join(directory, matches[0]!);
            }
        } else if (options.continue) {
            const files = (await readdir(directory)).filter(file => file.endsWith('.jsonl'));
            const dated = await Promise.all(files.map(async file => ({ file, time: (await stat(path.join(directory, file))).mtimeMs })));
            existing = dated.sort((a, b) => b.time - a.time)[0]?.file;
            if (existing) existing = path.join(directory, existing);
        }
        if (existing) return this.load(existing, options.cwd);
        const header: SessionHeader = { type: 'session', id: randomUUID(), cwd: path.resolve(options.cwd), createdAt: new Date().toISOString() };
        const filePath = path.join(directory, `${header.createdAt.replace(/[:.]/g, '-')}_${header.id}.jsonl`);
        await appendFile(filePath, `${JSON.stringify(header)}\n`, 'utf8');
        return new SessionStore(header, filePath, [], true);
    }

    private static async load(filePath: string, expectedCwd: string) {
        const lines = (await readFile(filePath, 'utf8')).split(/\r?\n/).filter(Boolean);
        const records = lines.map(line => JSON.parse(line) as SessionHeader | TurnRecord);
        const header = records[0];
        if (!header || header.type !== 'session') throw new Error('Invalid session file: missing header.');
        if (path.resolve(header.cwd) !== path.resolve(expectedCwd)) throw new Error(`Session belongs to a different workspace: ${header.cwd}`);
        const stored = records.slice(1).flatMap(record => record.type === 'turn' ? record.messages : []);
        return new SessionStore(header, filePath, mapStoredMessagesToChatMessages(stored), true);
    }

    async appendTurn(messages: BaseMessage[]) {
        if (messages.length === 0) return;
        if (this.persistent) {
            const record: TurnRecord = { type: 'turn', createdAt: new Date().toISOString(), messages: messages.map(message => message.toDict()) };
            await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
        }
        this.history.push(...messages);
    }
}
