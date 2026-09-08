import assert from 'node:assert/strict';
import test from 'node:test';
import { formatToolArgs, summarizeToolResult } from '../dist/tui/tool-formatters.js';

test('formats tool arguments as a compact single line', () => {
    assert.equal(formatToolArgs({ path: 'src/tools', recursive: true }), 'path=src/tools  recursive=true');
});

test('summarizes search details without exposing the full result', () => {
    assert.equal(summarizeToolResult('search_code', {
        matchCount: 14, searchedFiles: 7, skippedFiles: 2, truncated: true,
        truncation: { output_bytes: 2000 },
    }, 'large model-facing content'), '14 matches · 7 files searched · 2 skipped · truncated');
});

test('summarizes the range returned by read_file', () => {
    assert.equal(summarizeToolResult('read_file', {
        path: 'src/index.ts', startLine: 1, endLine: 200, totalLines: 350,
        hasMoreLines: true, truncated: false,
    }), 'src/index.ts · lines 1–200 of 350 · more available');
});
