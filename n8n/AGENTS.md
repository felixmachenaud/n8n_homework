This project uses n8n.

**MCP (Cursor):** When working with workflows, nodes, expressions, or the n8n MCP
tools, always start by loading the `using-n8n-skills-official` meta-skill and follow
its routing into the matching capability skill before acting.

**CLI (`@n8n/cli`):** For terminal and Public API operations, follow the project
`.cursorrules` (n8n CLI skill). Instance URL is configured in `~/.n8n-cli/config.json`;
never commit API keys or paste them into chat.
