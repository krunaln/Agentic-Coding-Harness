import { realpath } from 'node:fs/promises';
import path from 'node:path';

export const workspaceRoot = process.cwd();

function isWithin(root: string, target: string) {
    const relative = path.relative(root, target);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function resolveWorkspacePath(input: string, root = workspaceRoot) {
    const absoluteRoot = path.resolve(root);
    const target = path.resolve(absoluteRoot, input);
    if (!isWithin(absoluteRoot, target)) throw new Error('Path must stay inside the workspace.');
    const [realRoot, realTarget] = await Promise.all([realpath(absoluteRoot), realpath(target)]);
    if (!isWithin(realRoot, realTarget)) throw new Error('Path resolves outside the workspace.');
    return realTarget;
}
