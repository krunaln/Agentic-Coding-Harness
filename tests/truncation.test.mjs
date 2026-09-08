import test from 'node:test';
import assert from 'node:assert/strict';
import {
    boundedToolText,
    DEFAULT_TOOL_OUTPUT_LIMITS,
    truncateItemsHead,
    truncateTextHead,
} from '../dist/tools/truncation.js';

test('truncateTextHead respects UTF-8 byte and line limits', () => {
    const bytes = truncateTextHead('🙂🙂🙂', { maxBytes: 9, maxLines: 10 });
    assert.equal(bytes.content, '🙂🙂');
    assert.equal(Buffer.byteLength(bytes.content), 8);
    assert.equal(bytes.details.truncated, true);

    const lines = truncateTextHead('one\ntwo\nthree', { maxBytes: 100, maxLines: 2 });
    assert.equal(lines.content, 'one\ntwo');
    assert.equal(lines.details.output_lines, 2);
    assert.equal(lines.details.total_lines, 3);
});

test('truncateItemsHead keeps complete items and reports omitted output', () => {
    const result = truncateItemsHead(['one', 'two', 'three'], JSON.stringify, {
        maxBytes: Buffer.byteLength(JSON.stringify('one')) + Buffer.byteLength(JSON.stringify('two')),
        maxLines: 10,
    });
    assert.deepEqual(result.items, ['one', 'two']);
    assert.equal(result.details.truncated, true);
    assert.equal(result.details.output_lines, 2);
    assert.equal(result.details.total_lines, 3);
});

test('boundedToolText includes a notice without exceeding the shared byte limit', () => {
    const output = boundedToolText('x'.repeat(DEFAULT_TOOL_OUTPUT_LIMITS.maxBytes + 1000));
    assert.match(output, /Output truncated/);
    assert.ok(Buffer.byteLength(output) <= DEFAULT_TOOL_OUTPUT_LIMITS.maxBytes);
});
