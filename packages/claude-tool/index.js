'use strict';

/**
 * @zoplio/claude-tool — tiny config helper for connecting MCP clients
 * (Claude Code, Claude Desktop, the Anthropic API MCP connector) to the
 * Zoplio hosted MCP server. Docs-first package: see README.md. No runtime
 * dependencies on purpose.
 */

/** Hosted MCP endpoint (Streamable HTTP), same origin + auth as the REST API. */
const DEFAULT_MCP_URL = 'https://api.zoplio.com/mcp';

/**
 * Tools exposed by the Zoplio hosted MCP server. Each maps 1:1 to a Zoplio
 * API v1 REST operation (see the OpenAPI reference in docs).
 */
const TOOLS = [
  'schedule_meeting', // POST   /v1/meetings
  'get_meeting_status', // GET    /v1/meetings/:id
  'list_meetings', // GET    /v1/meetings
  'cancel_meeting', // POST   /v1/meetings/:id/cancel
  'reschedule_meeting', // POST   /v1/meetings/:id/reschedule
  // Webhook management (POST/GET/DELETE /v1/webhooks) is REST/SDK-only —
  // webhooks are an integration concern, not an in-conversation agent action.
];

/**
 * Build the `.mcp.json` / `mcpServers` entry for the Zoplio hosted MCP server.
 *
 * @param {string} apiKey - Zoplio API key (zpl_...).
 * @param {string} [url] - Override the MCP endpoint (e.g. a dev gateway).
 * @returns {{ type: 'http', url: string, headers: { Authorization: string } }}
 */
function mcpServerConfig(apiKey, url = DEFAULT_MCP_URL) {
  if (typeof apiKey !== 'string' || !apiKey.startsWith('zpl_')) {
    throw new Error('mcpServerConfig requires a Zoplio API key (zpl_...)');
  }
  return {
    type: 'http',
    url,
    headers: { Authorization: `Bearer ${apiKey}` },
  };
}

module.exports = { DEFAULT_MCP_URL, TOOLS, mcpServerConfig };
