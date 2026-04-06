#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
const API_BASE = "https://agentskill.sh/api";
// --- API client ---
async function apiFetch(path, options) {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "agentskill-mcp/0.2.0",
            ...options?.headers,
        },
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${body || res.statusText}`);
    }
    return res.json();
}
// --- Platform detection ---
const PLATFORM_SKILL_DIRS = {
    "claude-code": ".claude/skills",
    claude: ".claude/skills",
    "claude-cowork": ".claude/skills",
    "claude-desktop": ".claude/skills",
    cursor: ".cursor/skills",
    copilot: ".github/copilot/skills",
    "github-copilot": ".github/copilot/skills",
    codex: ".codex/skills",
    chatgpt: ".chatgpt/skills",
    windsurf: ".windsurf/skills",
    cline: ".cline/skills",
    vscode: ".vscode/skills",
    opencode: ".opencode/skills",
    aider: ".aider/skills",
    "gemini-cli": ".gemini/skills",
    amp: ".amp/skills",
    goose: ".goose/skills",
    "roo-code": ".roo-code/skills",
    trae: ".trae/skills",
    hermes: ".hermes/skills",
};
function detectSkillDir(targetDir) {
    if (targetDir)
        return targetDir;
    const cwd = process.cwd();
    const seen = new Set();
    for (const dir of Object.values(PLATFORM_SKILL_DIRS)) {
        if (seen.has(dir))
            continue;
        seen.add(dir);
        if (existsSync(join(cwd, dir))) {
            return join(cwd, dir);
        }
    }
    return join(cwd, ".claude/skills");
}
// --- Formatting helpers ---
function formatScore(label, score) {
    if (score == null)
        return "";
    return `${label}: ${score}/100`;
}
function formatRating(score, count) {
    if (!score)
        return "No ratings yet";
    return `${score.toFixed(1)}/5 (${count ?? 0} ratings)`;
}
// --- MCP Server ---
const server = new McpServer({
    name: "agentskill",
    version: "0.2.0",
});
// Tool: search_skills
server.tool("search_skills", "Search for AI agent skills on agentskill.sh. Returns matching skills with name, description, rating, security and quality scores.", {
    query: z
        .string()
        .describe("Search query (e.g. 'seo', 'react', 'testing')"),
    platform: z
        .string()
        .optional()
        .describe("Filter by platform: claude-code, cursor, copilot, windsurf, codex, gemini-cli, hermes, chatgpt, cline, vscode, opencode, amp, goose, roo-code, trae, aider"),
    category: z
        .string()
        .optional()
        .describe("Filter by category: marketing, development, design, finance-accounting, data-science, devops, etc."),
    minSecurityScore: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe("Minimum security score (0-100). Recommended: 70+"),
    limit: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe("Max results (default: 5, max: 20)"),
}, async ({ query, platform, category, minSecurityScore, limit }) => {
    const params = new URLSearchParams({
        q: query,
        limit: String(limit ?? 5),
    });
    if (platform)
        params.set("platform", platform);
    if (category)
        params.set("category", category);
    if (minSecurityScore != null)
        params.set("minSecurityScore", String(minSecurityScore));
    const data = await apiFetch(`/agent/search?${params}`);
    if (!data.results?.length) {
        return {
            content: [
                {
                    type: "text",
                    text: `No skills found for "${query}". Try a different search term or browse https://agentskill.sh`,
                },
            ],
        };
    }
    const results = data.results.map((s, i) => {
        const lines = [
            `${i + 1}. **${s.name}** (\`${s.slug}\`)`,
            `   ${s.description}`,
            `   Owner: ${s.owner} | Installs: ${s.installCount.toLocaleString()} | Rating: ${formatRating(s.score, s.ratingCount)}`,
        ];
        const scores = [
            formatScore("Security", s.securityScore),
            formatScore("Quality", s.contentQualityScore),
        ]
            .filter(Boolean)
            .join(" | ");
        if (scores)
            lines.push(`   ${scores}`);
        lines.push(`   Platforms: ${s.platforms?.join(", ") || "all"}`, `   Install: use install_skill with slug "${s.slug}"`);
        return lines.join("\n");
    });
    return {
        content: [
            {
                type: "text",
                text: [
                    `Found ${data.total} skills for "${query}":`,
                    "",
                    ...results,
                    "",
                    `Browse all: https://agentskill.sh/skills?q=${encodeURIComponent(query)}`,
                ].join("\n"),
            },
        ],
    };
});
// Tool: get_skill
server.tool("get_skill", "Get full details for a specific skill including SKILL.md content, security analysis, quality review, and metadata.", {
    slug: z
        .string()
        .describe("Skill slug in owner/name format (e.g. 'compound-engineering/frontend-design')"),
}, async ({ slug }) => {
    const data = await apiFetch(`/skills/${encodeURIComponent(slug)}`);
    const s = data.data;
    if (!s) {
        return {
            content: [
                { type: "text", text: `Skill "${slug}" not found.` },
            ],
        };
    }
    const sections = [
        `# ${s.name}`,
        "",
        s.description,
        "",
        "## Metadata",
        `- **Slug**: ${s.slug}`,
        `- **Owner**: ${s.owner}${s.claimed ? " (claimed)" : ""}`,
        `- **Repository**: ${s.repositoryUrl || "N/A"}`,
        `- **Platforms**: ${s.platforms?.join(", ") || "all"}`,
        `- **Types**: ${s.skillTypes?.join(", ") || "N/A"}`,
        `- **Tags**: ${s.tags?.join(", ") || "N/A"}`,
        `- **Installs**: ${s.installCount.toLocaleString()}`,
        `- **Rating**: ${formatRating(s.score, s.ratingCount)}`,
        `- **Verified**: ${s.isVerified ? "Yes" : "No"}`,
        `- **Updated**: ${s.updatedAt || "N/A"}`,
    ];
    if (s.originalAuthor && s.originalAuthor !== s.owner) {
        sections.push(`- **Original author**: ${s.originalAuthor}`);
    }
    if (s.jobCategories?.length) {
        sections.push(`- **Categories**: ${s.jobCategories.join(", ")}`);
    }
    // Security section
    sections.push("", "## Security");
    if (s.securityScore != null) {
        sections.push(`- **Score**: ${s.securityScore}/100`);
    }
    if (s.securityIssues?.length) {
        sections.push("- **Issues**:");
        for (const issue of s.securityIssues.slice(0, 5)) {
            sections.push(`  - [${issue.severity}] ${issue.category}: ${issue.description}`);
        }
        if (s.securityIssues.length > 5) {
            sections.push(`  - ... and ${s.securityIssues.length - 5} more issues`);
        }
    }
    else {
        sections.push("- No security issues found");
    }
    // Quality section
    if (s.contentQualityScore != null) {
        sections.push("", "## Quality", `- **Score**: ${s.contentQualityScore}/100`);
    }
    if (s.skillMd) {
        sections.push("", "## SKILL.md Content", "", s.skillMd);
    }
    sections.push("", `Install: use install_skill with slug "${s.slug}"`, `View on web: https://agentskill.sh/skills/${s.slug}`);
    return {
        content: [{ type: "text", text: sections.join("\n") }],
    };
});
// Tool: install_skill
server.tool("install_skill", "Install a skill from agentskill.sh to the local skills directory. Downloads the SKILL.md file. Refuses to install skills flagged as malicious.", {
    slug: z
        .string()
        .describe("Skill slug in owner/name format (e.g. 'compound-engineering/frontend-design')"),
    targetDir: z
        .string()
        .optional()
        .describe("Target directory (auto-detected from platform if not provided)"),
}, async ({ slug, targetDir }) => {
    let data;
    try {
        const slashIdx = slug.indexOf("/");
        const path = slashIdx > 0
            ? `/agent/skills/${encodeURIComponent(slug.slice(0, slashIdx))}/${encodeURIComponent(slug.slice(slashIdx + 1))}/install`
            : `/agent/skills/${encodeURIComponent(slug)}/install`;
        data = await apiFetch(path);
    }
    catch (err) {
        if (err.message?.includes("409")) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Multiple skills found for "${slug}". Please use the full owner/name format (e.g. "owner/${slug}"). ${err.message}`,
                    },
                ],
            };
        }
        throw err;
    }
    if (!data.skillMd) {
        return {
            content: [
                {
                    type: "text",
                    text: `Skill "${slug}" has no SKILL.md content. Visit https://agentskill.sh/skills/${encodeURIComponent(slug)} to see details.`,
                },
            ],
        };
    }
    const dirName = data.slug.includes("/")
        ? data.slug.split("/").pop()
        : data.slug;
    const baseDir = detectSkillDir(targetDir);
    const skillDir = join(baseDir, dirName);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), data.skillMd, "utf-8");
    // Track installation (fire and forget)
    apiFetch(`/skills/${encodeURIComponent(data.slug)}/install`, {
        method: "POST",
        body: JSON.stringify({
            platform: "mcp",
            agentName: "agentskill-mcp",
        }),
    }).catch(() => { });
    const lines = [
        `Installed "${data.name}" to ${skillDir}`,
        "",
        "Files written:",
        "  - SKILL.md",
    ];
    const scores = [
        formatScore("Security", data.securityScore),
        formatScore("Quality", data.contentQualityScore),
    ]
        .filter(Boolean)
        .join(" | ");
    if (scores)
        lines.push("", scores);
    lines.push("", "The skill is now available. Restart your agent or reload skills to use it.");
    return {
        content: [{ type: "text", text: lines.join("\n") }],
    };
});
// Tool: get_trending
server.tool("get_trending", "Get trending, hot, top, or latest skills on agentskill.sh.", {
    period: z
        .enum(["hot", "trending", "top", "latest"])
        .optional()
        .describe("'hot' for 24h, 'trending' for 7 days, 'top' for all time, 'latest' for newest (default: trending)"),
    platform: z
        .string()
        .optional()
        .describe("Filter by platform: claude-code, cursor, copilot, windsurf, codex, gemini-cli, hermes, etc."),
    limit: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe("Max results (default: 10)"),
}, async ({ period, platform, limit }) => {
    const section = period ?? "trending";
    const params = new URLSearchParams({
        section,
        limit: String(limit ?? 10),
    });
    if (platform)
        params.set("platform", platform);
    const data = await apiFetch(`/skills?${params}`);
    if (!data.data?.length) {
        return {
            content: [
                {
                    type: "text",
                    text: "No skills found for this period.",
                },
            ],
        };
    }
    const labels = {
        hot: "Hot (24h)",
        trending: "Trending (7 days)",
        top: "Top (all time)",
        latest: "Latest",
    };
    const results = data.data.map((s, i) => {
        const desc = s.description?.slice(0, 100) || "";
        const ellipsis = (s.description?.length ?? 0) > 100 ? "..." : "";
        const scores = [
            formatScore("Sec", s.securityScore),
            formatScore("Qual", s.contentQualityScore),
        ]
            .filter(Boolean)
            .join(" | ");
        const scoreSuffix = scores ? ` | ${scores}` : "";
        return `${i + 1}. **${s.name}** (\`${s.slug}\`) - ${desc}${ellipsis} [${s.installCount.toLocaleString()} installs${scoreSuffix}]`;
    });
    return {
        content: [
            {
                type: "text",
                text: [
                    `${labels[section]} skills:`,
                    "",
                    ...results,
                    "",
                    "Browse more: https://agentskill.sh",
                ].join("\n"),
            },
        ],
    };
});
// Tool: browse_skillsets
server.tool("browse_skillsets", "Browse curated skill collections (skillsets) on agentskill.sh. Skillsets bundle related skills for a specific workflow or role.", {
    limit: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe("Max results (default: 10)"),
}, async ({ limit }) => {
    const params = new URLSearchParams({
        limit: String(limit ?? 10),
    });
    const data = await apiFetch(`/skillsets?${params}`);
    if (!data.data?.length) {
        return {
            content: [{ type: "text", text: "No skillsets found." }],
        };
    }
    const results = data.data.map((ss, i) => {
        const authorName = ss.author?.username || ss.author?.name || "unknown";
        const avgSecurity = ss.skillDetails?.length
            ? Math.round(ss.skillDetails.reduce((sum, s) => sum + (s.securityScore || 0), 0) / ss.skillDetails.length)
            : null;
        const lines = [
            `${i + 1}. **${ss.name}** (\`${ss.slug}\`)`,
            `   ${ss.description || "No description"}`,
            `   Author: ${authorName} | Skills: ${ss.skills.length} | Installs: ${ss.installCount.toLocaleString()}`,
        ];
        if (avgSecurity != null) {
            lines.push(`   Avg Security: ${avgSecurity}/100`);
        }
        lines.push(`   Install all: use install_skillset with slug "${ss.slug}"`);
        return lines.join("\n");
    });
    return {
        content: [
            {
                type: "text",
                text: [
                    "Curated skillsets:",
                    "",
                    ...results,
                    "",
                    "Browse more: https://agentskill.sh/skillsets",
                ].join("\n"),
            },
        ],
    };
});
// Tool: install_skillset
server.tool("install_skillset", "Install all skills from a curated skillset. Each skill is installed to its own subdirectory.", {
    slug: z
        .string()
        .describe("Skillset slug (from browse_skillsets results)"),
    targetDir: z
        .string()
        .optional()
        .describe("Target directory (auto-detected from platform if not provided)"),
}, async ({ slug, targetDir }) => {
    const listData = await apiFetch(`/skillsets`);
    const skillset = listData.data?.find((ss) => ss.slug === slug);
    if (!skillset) {
        return {
            content: [
                {
                    type: "text",
                    text: `Skillset "${slug}" not found. Use browse_skillsets to see available skillsets.`,
                },
            ],
        };
    }
    const baseDir = detectSkillDir(targetDir);
    const installed = [];
    const failed = [];
    for (const skillSlug of skillset.skills) {
        try {
            const parts = skillSlug.split("/");
            const path = parts.length === 2
                ? `/agent/skills/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/install`
                : `/agent/skills/${encodeURIComponent(skillSlug)}/install`;
            const skillData = await apiFetch(path);
            if (!skillData.skillMd) {
                failed.push(`${skillSlug} (no SKILL.md)`);
                continue;
            }
            const dirName = skillData.slug.includes("/")
                ? skillData.slug.split("/").pop()
                : skillData.slug;
            const skillDir = join(baseDir, dirName);
            await mkdir(skillDir, { recursive: true });
            await writeFile(join(skillDir, "SKILL.md"), skillData.skillMd, "utf-8");
            installed.push(skillData.name || skillSlug);
        }
        catch {
            failed.push(skillSlug);
        }
    }
    // Track skillset installation (fire and forget)
    apiFetch(`/skillsets/${encodeURIComponent(slug)}/install`, {
        method: "POST",
        body: JSON.stringify({
            platform: "mcp",
            agentName: "agentskill-mcp",
        }),
    }).catch(() => { });
    const lines = [
        `Installed skillset "${skillset.name}" to ${baseDir}`,
        "",
        `Skills installed (${installed.length}/${skillset.skills.length}):`,
        ...installed.map((s) => `  - ${s}`),
    ];
    if (failed.length) {
        lines.push("", "Failed to install:", ...failed.map((s) => `  - ${s}`));
    }
    lines.push("", "Skills are now available. Restart your agent or reload skills to use them.");
    return {
        content: [{ type: "text", text: lines.join("\n") }],
    };
});
// Tool: rate_skill
server.tool("rate_skill", "Rate a skill on agentskill.sh. Helps other agents and users discover the best skills.", {
    slug: z.string().describe("Skill slug in owner/name format"),
    rating: z
        .number()
        .min(1)
        .max(5)
        .describe("Rating from 1 (poor) to 5 (excellent)"),
    comment: z.string().optional().describe("Optional feedback comment"),
}, async ({ slug, rating, comment }) => {
    await apiFetch(`/skills/${encodeURIComponent(slug)}/agent-feedback`, {
        method: "POST",
        body: JSON.stringify({
            rating,
            comment,
            agentName: "agentskill-mcp",
        }),
    });
    return {
        content: [
            {
                type: "text",
                text: `Rated "${slug}" ${rating}/5.${comment ? ` Comment: "${comment}"` : ""} Thanks for the feedback!`,
            },
        ],
    };
});
// Tool: check_updates
server.tool("check_updates", "Check if skills have newer versions available on agentskill.sh. Returns remote contentSha and updatedAt for comparison with local files.", {
    slugs: z
        .array(z.string())
        .min(1)
        .max(50)
        .describe("Array of skill slugs in owner/name format to check for updates"),
}, async ({ slugs }) => {
    const data = await apiFetch(`/agent/skills/version?slugs=${slugs.join(",")}`);
    if (!data.versions || Object.keys(data.versions).length === 0) {
        return {
            content: [
                {
                    type: "text",
                    text: `No version info found. Make sure slugs use owner/name format (e.g. "compound-engineering/frontend-design").`,
                },
            ],
        };
    }
    const lines = ["Skill versions:", ""];
    for (const [slug, info] of Object.entries(data.versions)) {
        lines.push(`- **${slug}**: sha=${info.contentSha.slice(0, 8)} | updated=${info.updatedAt}`);
    }
    const missing = slugs.filter((s) => !data.versions[s]);
    if (missing.length) {
        lines.push("", "Not found:", ...missing.map((s) => `  - ${s}`));
    }
    lines.push("", "Compare these contentSha values with your local SKILL.md files to determine which need updating.");
    return {
        content: [{ type: "text", text: lines.join("\n") }],
    };
});
// --- Start ---
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
