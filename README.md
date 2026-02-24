# AgentSkill MCP Server

MCP server for [agentskill.sh](https://agentskill.sh) — search, discover, and install AI agent skills from the largest skills directory (44k+ skills).

## Tools

| Tool | Description |
|------|-------------|
| `search_skills` | Search for skills by keyword, filter by platform |
| `get_skill` | Get full details for a skill including SKILL.md content |
| `install_skill` | Install a skill to the local skills directory |
| `get_trending` | Get hot, trending, or top skills |

## Installation

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agentskill": {
      "command": "npx",
      "args": ["-y", "agentskill-mcp"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agentskill": {
      "command": "npx",
      "args": ["-y", "agentskill-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add agentskill -- npx -y agentskill-mcp
```

### Windsurf / Cline / Other MCP Clients

```json
{
  "mcpServers": {
    "agentskill": {
      "command": "npx",
      "args": ["-y", "agentskill-mcp"]
    }
  }
}
```

## Usage Examples

Once connected, your AI agent can:

- **Search**: "Find skills for SEO optimization"
- **Browse**: "Show me trending skills for Claude Code"
- **Install**: "Install the seo-optimizer skill"
- **Details**: "Get details for the react-best-practices skill"

## Supported Platforms

Skills are available for Claude Code, Cursor, GitHub Copilot, Windsurf, Codex, Gemini CLI, and more.

## License

MIT
