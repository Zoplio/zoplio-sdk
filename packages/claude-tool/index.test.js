'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_MCP_URL, TOOLS, mcpServerConfig } = require('./index');

describe('mcpServerConfig', () => {
  it('builds an .mcp.json http server entry with bearer auth', () => {
    assert.deepEqual(mcpServerConfig('zpl_abc123'), {
      type: 'http',
      url: DEFAULT_MCP_URL,
      headers: { Authorization: 'Bearer zpl_abc123' },
    });
  });

  it('accepts a URL override (another gateway)', () => {
    const cfg = mcpServerConfig('zpl_abc123', 'http://localhost:3022/mcp');
    assert.equal(cfg.url, 'http://localhost:3022/mcp');
  });

  it('rejects non-zpl keys', () => {
    assert.throws(() => mcpServerConfig('sk-whatever'), /zpl_/);
    assert.throws(() => mcpServerConfig(undefined), /zpl_/);
  });
});

describe('TOOLS', () => {
  it('lists the five hosted MCP tools (webhooks are REST/SDK-only)', () => {
    assert.equal(TOOLS.length, 5);
    assert.ok(TOOLS.includes('schedule_meeting'));
    assert.ok(TOOLS.includes('get_meeting_status'));
    assert.ok(!TOOLS.includes('delete_webhook'));
  });
});
