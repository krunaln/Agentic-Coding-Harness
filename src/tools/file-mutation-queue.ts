/** Serializes filesystem mutations within one tool registry. */
export class FileMutationQueue {
    private pending: Promise<void> = Promise.resolve();

    run<T>(mutation: () => Promise<T>): Promise<T> {
        const result = this.pending.then(mutation, mutation);
        this.pending = result.then(() => undefined, () => undefined);
        return result;
    }
}
