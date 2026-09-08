export type MessageEntry = {
    id: number;
    kind: 'message';
    role: 'user' | 'assistant' | 'error' | 'notice';
    text: string;
};

export type ToolEntry = {
    id: number;
    kind: 'tool';
    callId: string;
    name: string;
    label: string;
    args: unknown;
    status: 'running' | 'repairing' | 'completed' | 'failed';
    content?: string;
    details?: unknown;
    durationMs?: number;
    error?: string;
};

export type TranscriptEntry = MessageEntry | ToolEntry;
