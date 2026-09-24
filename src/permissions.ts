export type PermissionMode = 'ask' | 'full-access';

export type ApprovalRequest = {
    callId: string;
    toolName: string;
    toolLabel: string;
    args: unknown;
};

export function parsePermissionMode(args: string[]): PermissionMode {
    if (args.includes('--full-access')) return 'full-access';
    const index = args.indexOf('--permission-mode');
    if (index === -1) return 'ask';
    const value = args[index + 1];
    if (value === 'ask' || value === 'full-access') return value;
    throw new Error('--permission-mode must be "ask" or "full-access".');
}
