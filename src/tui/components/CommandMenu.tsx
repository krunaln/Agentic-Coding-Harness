import { Box, Text } from 'ink';
import type { SlashCommand } from '../../commands/types.js';

export function CommandMenu({ commands, selected }: { commands: SlashCommand[]; selected: number }) {
    if (!commands.length) return null;
    return (
        <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1} marginTop={1}>
            {commands.map((command, index) => (
                <Text key={command.name} color={index === selected ? 'cyan' : undefined}>
                    {index === selected ? '❯ ' : '  '}<Text bold>/{command.name}</Text>
                    {command.usage ? <Text dimColor> {command.usage}</Text> : null}
                    <Text dimColor> — {command.description}</Text>
                </Text>
            ))}
        </Box>
    );
}
