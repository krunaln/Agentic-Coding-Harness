export type SessionCliOptions = { continue: boolean; resume?: string; persistent: boolean };

export function parseSessionOptions(args: string[]): SessionCliOptions {
    const shouldContinue = args.includes('--continue') || args.includes('-c');
    const noSession = args.includes('--no-session');
    const index = args.indexOf('--resume');
    const resume = index >= 0 ? args[index + 1] : undefined;
    if (index >= 0 && (!resume || resume.startsWith('-'))) throw new Error('--resume requires a session id or file path.');
    if (shouldContinue && resume) throw new Error('Use either --continue or --resume, not both.');
    if (noSession && (shouldContinue || resume)) throw new Error('--no-session cannot be combined with --continue or --resume.');
    return { continue: shouldContinue, resume, persistent: !noSession };
}
