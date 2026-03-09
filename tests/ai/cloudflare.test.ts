import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally for all tests
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Dynamic import to pick up mocked fetch
const { CloudflareProvider } = await import('../../src/ai/providers/cloudflare.js');

function okResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => content,
  };
}

function errorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    json: async () => ({ error: body }),
    text: async () => body,
  };
}

describe('CloudflareProvider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account-123';
    process.env.CLOUDFLARE_API_TOKEN = 'test-token-abc';
  });

  afterEach(() => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
  });

  it('throws if accountId is missing', () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    expect(() => new CloudflareProvider({ apiToken: 'tok' })).toThrow('account ID required');
  });

  it('throws if apiToken is missing', () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    expect(() => new CloudflareProvider({ accountId: 'acc' })).toThrow('API token required');
  });

  it('reads credentials from env vars', () => {
    const provider = new CloudflareProvider();
    expect(provider).toBeDefined();
  });

  it('sends chat request to correct Workers AI URL', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('Hello from CF!'));

    const provider = new CloudflareProvider({ accountId: 'acc123', apiToken: 'tok456' });
    const result = await provider.chat([{ role: 'user', content: 'Hi' }]);

    expect(result).toBe('Hello from CF!');
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc123/ai/v1/chat/completions');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer tok456');

    const body = JSON.parse(opts.body);
    expect(body.model).toBe('@cf/meta/llama-3.1-8b-instruct');
    expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
    expect(body.max_tokens).toBe(4096);
  });

  it('uses custom model', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('response'));

    const provider = new CloudflareProvider({
      accountId: 'acc',
      apiToken: 'tok',
      model: '@cf/openai/gpt-oss-120b',
    });
    await provider.chat([{ role: 'user', content: 'test' }]);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('@cf/openai/gpt-oss-120b');
  });

  it('uses AI Gateway URL when gateway is configured', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('gw response'));

    const provider = new CloudflareProvider({
      accountId: 'acc123',
      apiToken: 'tok',
      gateway: 'my-gateway',
    });
    await provider.chat([{ role: 'user', content: 'test' }]);

    const url = mockFetch.mock.calls[0][0];
    expect(url).toBe('https://gateway.ai.cloudflare.com/v1/acc123/my-gateway/chat/completions');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(400, 'Bad request'));

    const provider = new CloudflareProvider({ accountId: 'acc', apiToken: 'tok' });
    await expect(provider.chat([{ role: 'user', content: 'test' }])).rejects.toThrow('Cloudflare Workers AI error: 400');
  });

  it('retries on transient 429 error', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(429, 'Rate limited'))
      .mockResolvedValueOnce(okResponse('retry success'));

    const provider = new CloudflareProvider({ accountId: 'acc', apiToken: 'tok' });
    const result = await provider.chat([{ role: 'user', content: 'test' }]);

    expect(result).toBe('retry success');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on transient 500 error', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(500, 'Server error'))
      .mockResolvedValueOnce(okResponse('recovered'));

    const provider = new CloudflareProvider({ accountId: 'acc', apiToken: 'tok' });
    const result = await provider.chat([{ role: 'user', content: 'test' }]);

    expect(result).toBe('recovered');
  });

  it('respects custom maxTokens', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('ok'));

    const provider = new CloudflareProvider({
      accountId: 'acc',
      apiToken: 'tok',
      maxTokens: 1024,
    });
    await provider.chat([{ role: 'user', content: 'test' }]);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(1024);
  });
});
