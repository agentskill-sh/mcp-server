# agentskill-mcp

MCP server for [agentskill.sh](https://agentskill.sh) -- search, discover, and install AI agent skills from the largest skills directory (110k+ skills).

## Tools

| Tool | Description |
|------|-------------|
| `search_skills` | Search skills by keyword with platform, category, and security score filters |
| `get_skill` | Get full details including SKILL.md, security analysis, and quality review |
| `install_skill` | Install a skill to the local skills directory with security checks |
| `get_trending` | Get hot (24h), trending (7d), top (all time), or latest skills |
| `browse_skillsets` | Browse curated skill collections bundled by workflow or role |
| `install_skillset` | Install all skills from a skillset at once |
| `rate_skill` | Rate a skill 1-5 to help others discover the best skills |
| `check_updates` | Check if installed skills have newer versions available |

## Installation

### Claude Code

```bash
claude mcp add agentskill -- npx -y agentskill-mcp
```

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

### Cursor / Windsurf / Cline / Other MCP Clients

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
- **Filter**: "Search for marketing skills with security score above 80"
- **Browse**: "Show me trending skills for Claude Code"
- **Skillsets**: "Browse curated skillsets for frontend development"
- **Install**: "Install the compound-engineering/frontend-design skill"
- **Install collection**: "Install the seo-starter skillset"
- **Rate**: "Rate compound-engineering/frontend-design 5/5"
- **Updates**: "Check for updates on my installed skills"

## Supported Platforms

Skills are available for 20+ platforms: Claude Code, Cursor, GitHub Copilot, Windsurf, Codex, Gemini CLI, Hermes, ChatGPT, Cline, VS Code, OpenCode, Aider, AMP, Goose, Roo Code, Trae, and more.

## License

MIT
