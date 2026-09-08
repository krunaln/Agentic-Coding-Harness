import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export type Workspace = {
    root: string;
};

export function createWorkspace(root = process.cwd()): Workspace {
    return { root: path.resolve(root) };
}

function isWithin(root: string, target: string) {
    const relative = path.relative(root, target);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function resolveWorkspacePath(input: string, root: string) {
    const absoluteRoot = path.resolve(root);
    const target = path.resolve(absoluteRoot, input);
    if (!isWithin(absoluteRoot, target)) throw new Error('Path must stay inside the workspace.');
    const [realRoot, realTarget] = await Promise.all([realpath(absoluteRoot), realpath(target)]);
    if (!isWithin(realRoot, realTarget)) throw new Error('Path resolves outside the workspace.');
    return realTarget;
}

/** Resolve a possibly new path after verifying its nearest existing ancestor. */
export async function resolveWorkspacePathForWrite(input: string, root: string) {
    const absoluteRoot = path.resolve(root);
    const target = path.resolve(absoluteRoot, input);
    if (!isWithin(absoluteRoot, target)) throw new Error('Path must stay inside the workspace.');
    const realRoot = await realpath(absoluteRoot);
    let ancestor = target;
    while (ancestor !== absoluteRoot) {
        try {
            await stat(ancestor);
            break;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            ancestor = path.dirname(ancestor);
        }
    }
    const realAncestor = await realpath(ancestor);
    if (!isWithin(realRoot, realAncestor)) throw new Error('Path resolves outside the workspace.');
    return target;
}
