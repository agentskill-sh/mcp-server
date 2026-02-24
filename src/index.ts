#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";

const API_BASE = "https://agentskill.sh/api";

// --- API client ---

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "agentskill-mcp/0.1.0",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// --- Platform detection ---

const PLATFORM_SKILL_DIRS: Record<string, string[]> = {
  "claude-code": [".claude/skills"],
  cursor: [".cursor/skills"],
  copilot: [".github/skills"],
  windsurf: [".windsurf/skills"],
  codex: [".agents/skills"],
  "gemini-cli": [".gemini/skills"],
};

function detectSkillDir(targetDir?: string): string {
  if (targetDir) return targetDir;

  const cwd = process.cwd();

  for (const [, dirs] of Object.entries(PLATFORM_SKILL_DIRS)) {
    for (const dir of dirs) {
      if (existsSync(join(cwd, dir))) {
        return join(cwd, dir);
      }
    }
  }

  return join(cwd, ".claude/skills");
}

// --- MCP Server ---

const server = new McpServer({
  name: "agentskill",
  version: "0.1.0",
});

// Tool: search_skills
server.tool(
  "search_skills",
  "Search for AI agent skills on agentskill.sh. Returns matching skills with name, description, rating, and install count.",
  {
    query: z.string().describe("Search query (e.g. 'seo', 'react', 'testing')"),
    platform: z
      .string()
      .optional()
      .describe("Filter by platform: claude-code, cursor, copilot, windsurf, codex, etc."),
    limit: z
      .number()
      .min(1)
      .max(20)
      .optional()
      .describe("Max results (default: 5, max: 20)"),
  },
  async ({ query, platform, limit }) => {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit ?? 5),
      fields:
        "name,slug,description,owner,platforms,installCount,score,ratingCount,repositoryUrl",
    });
    if (platform) params.set("platform", platform);

    const data = await apiFetch<{
      data: Array<{
        name: string;
        slug: string;
        description: string;
        owner: string;
        platforms: string[];
        installCount: number;
        score: number;
        ratingCount: number;
        repositoryUrl: string;
      }>;
      total: number;
    }>(`/agent/search?${params}`);

    if (!data.data?.length) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No skills found for "${query}". Try a different search term or browse https://agentskill.sh`,
          },
        ],
      };
    }

    const results = data.data.map((s, i) => {
      const rating = s.score
        ? `${s.score.toFixed(1)}/5 (${s.ratingCount} ratings)`
        : "No ratings yet";
      return [
        `${i + 1}. **${s.name}** (\`${s.slug}\`)`,
        `   ${s.description}`,
        `   Owner: ${s.owner} | Installs: ${s.installCount.toLocaleString()} | Rating: ${rating}`,
        `   Platforms: ${s.platforms?.join(", ") || "all"}`,
        `   Install: use the install_skill tool with slug "${s.slug}"`,
      ].join("\n");
    });

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Found ${data.total} skills for "${query}":`,
            "",
            ...results,
            "",
            `Browse all results: https://agentskill.sh/skills?q=${encodeURIComponent(query)}`,
          ].join("\n"),
        },
      ],
    };
  }
);

// Tool: get_skill
server.tool(
  "get_skill",
  "Get full details for a specific skill including its SKILL.md content, security info, and metadata.",
  {
    slug: z
      .string()
      .describe("Skill slug (e.g. 'seo-optimizer', 'react-best-practices')"),
  },
  async ({ slug }) => {
    const data = await apiFetch<{
      data: {
        name: string;
        slug: string;
        description: string;
        owner: string;
        repositoryUrl: string;
        platforms: string[];
        installCount: number;
        score: number;
        ratingCount: number;
        skillMd: string;
        readme: string;
        tags: string[];
        skillTypes: string[];
        isVerified: boolean;
      };
    }>(`/skills/${encodeURIComponent(slug)}`);

    const s = data.data;
    if (!s) {
      return {
        content: [{ type: "text" as const, text: `Skill "${slug}" not found.` }],
      };
    }

    const rating = s.score
      ? `${s.score.toFixed(1)}/5 (${s.ratingCount} ratings)`
      : "No ratings yet";
    const sections = [
      `# ${s.name}`,
      "",
      s.description,
      "",
      "## Metadata",
      `- **Owner**: ${s.owner}`,
      `- **Repository**: ${s.repositoryUrl || "N/A"}`,
      `- **Platforms**: ${s.platforms?.join(", ") || "all"}`,
      `- **Types**: ${s.skillTypes?.join(", ") || "N/A"}`,
      `- **Tags**: ${s.tags?.join(", ") || "N/A"}`,
      `- **Installs**: ${s.installCount.toLocaleString()}`,
      `- **Rating**: ${rating}`,
      `- **Verified**: ${s.isVerified ? "Yes" : "No"}`,
    ];

    if (s.skillMd) {
      sections.push("", "## SKILL.md Content", "", s.skillMd);
    }

    sections.push(
      "",
      `Install: use the install_skill tool with slug "${s.slug}"`,
      `View on web: https://agentskill.sh/skills/${s.slug}`
    );

    return {
      content: [{ type: "text" as const, text: sections.join("\n") }],
    };
  }
);

// Tool: install_skill
server.tool(
  "install_skill",
  "Install a skill from agentskill.sh to the local skills directory. Downloads the SKILL.md file and any associated files.",
  {
    slug: z.string().describe("Skill slug to install"),
    targetDir: z
      .string()
      .optional()
      .describe("Target directory (auto-detected if not provided)"),
  },
  async ({ slug, targetDir }) => {
    const data = await apiFetch<{
      data: {
        name: string;
        slug: string;
        skillMd: string;
        skillFiles?: Array<{ path: string; content: string }>;
        owner: string;
      };
    }>(`/skills/${encodeURIComponent(slug)}`);

    const s = data.data;
    if (!s) {
      return {
        content: [{ type: "text" as const, text: `Skill "${slug}" not found.` }],
      };
    }

    if (!s.skillMd) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Skill "${slug}" has no SKILL.md content. Visit ${s.owner ? `https://github.com/${s.owner}` : "the repository"} to install manually.`,
          },
        ],
      };
    }

    const baseDir = detectSkillDir(targetDir);
    const skillDir = join(baseDir, slug);

    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), s.skillMd, "utf-8");

    const filesWritten = ["SKILL.md"];
    if (s.skillFiles?.length) {
      for (const file of s.skillFiles) {
        if (file.path && file.content) {
          const filePath = join(skillDir, file.path);
          await mkdir(dirname(filePath), { recursive: true });
          await writeFile(filePath, file.content, "utf-8");
          filesWritten.push(file.path);
        }
      }
    }

    // Track installation (fire and forget)
    apiFetch(`/skills/${encodeURIComponent(slug)}/install`, {
      method: "POST",
      body: JSON.stringify({
        platform: "mcp",
        agentName: "agentskill-mcp",
        sessionId: `mcp-${Date.now()}`,
      }),
    }).catch(() => {});

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Installed "${s.name}" to ${skillDir}`,
            "",
            `Files written:`,
            ...filesWritten.map((f) => `  - ${f}`),
            "",
            `The skill is now available. Restart your agent or reload skills to use it.`,
          ].join("\n"),
        },
      ],
    };
  }
);

// Tool: get_trending
server.tool(
  "get_trending",
  "Get trending and popular skills on agentskill.sh.",
  {
    period: z
      .enum(["hot", "trending", "top"])
      .optional()
      .describe(
        "'hot' for 24h, 'trending' for 7 days, 'top' for all time (default: trending)"
      ),
    platform: z
      .string()
      .optional()
      .describe("Filter by platform: claude-code, cursor, copilot, windsurf, etc."),
    limit: z
      .number()
      .min(1)
      .max(20)
      .optional()
      .describe("Max results (default: 10)"),
  },
  async ({ period, platform, limit }) => {
    const section = period ?? "trending";
    const params = new URLSearchParams({
      section,
      limit: String(limit ?? 10),
      fields: "name,slug,description,owner,platforms,installCount,score",
    });
    if (platform) params.set("platform", platform);

    const data = await apiFetch<{
      data: Array<{
        name: string;
        slug: string;
        description: string;
        owner: string;
        platforms: string[];
        installCount: number;
        score: number;
      }>;
    }>(`/skills?${params}`);

    if (!data.data?.length) {
      return {
        content: [
          { type: "text" as const, text: "No trending skills found." },
        ],
      };
    }

    const label =
      section === "hot"
        ? "Hot (24h)"
        : section === "top"
          ? "Top (all time)"
          : "Trending (7 days)";
    const results = data.data.map((s, i) => {
      const desc = s.description?.slice(0, 100) || "";
      const ellipsis = (s.description?.length ?? 0) > 100 ? "..." : "";
      return `${i + 1}. **${s.name}** (\`${s.slug}\`) — ${desc}${ellipsis} [${s.installCount.toLocaleString()} installs]`;
    });

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `${label} skills:`,
            "",
            ...results,
            "",
            `Browse more: https://agentskill.sh`,
          ].join("\n"),
        },
      ],
    };
  }
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
