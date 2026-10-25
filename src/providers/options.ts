export type ProviderOptions = { provider?: string; model?: string };

export function parseProviderOptions(args: string[]): ProviderOptions {
    const read = (flag: string) => {
        const index = args.indexOf(flag);
        if (index >= 0 && !args[index + 1]) throw new Error(`${flag} needs a ${flag.slice(2)} name.`);
        return index >= 0 ? args[index + 1] : undefined;
    };
    const provider = read('--provider');
    const model = read('--model');
    if (provider && provider.startsWith('--')) throw new Error('--provider needs a provider name.');
    if (model && model.startsWith('--')) throw new Error('--model needs a model name.');
    return { provider, model };
}
