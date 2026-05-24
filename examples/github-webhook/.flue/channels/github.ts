import { defineChannel } from '@flue/runtime';
import { Hono } from 'hono';

export interface GitHubEvent {
	deliveryId: string;
	action?: string;
	payload: Record<string, any>;
}

export interface GitHubThread {
	channel: 'github';
	deliveryId: string;
}

interface GitHubEvents {
	issues: GitHubEvent;
	pull_request: GitHubEvent;
}

const app = new Hono();
const github = defineChannel<GitHubEvents, GitHubThread>({ app });

app.post('/events', async (c) => {
	const deliveryId = c.req.header('x-github-delivery');
	const type = c.req.header('x-github-event');
	if (!deliveryId || !type) return c.json({ error: 'Missing required GitHub webhook headers.' }, 400);
	const body = await c.req.text();
	const secret = readSecret(c.env);
	if (secret) {
		const signature = c.req.header('x-hub-signature-256');
		if (!signature || !(await verifySignature(body, secret, signature))) return c.json({ error: 'Invalid GitHub webhook signature.' }, 401);
	}
	let payload: Record<string, any>;
	try {
		const parsed = body ? JSON.parse(body) : {};
		payload = parsed && typeof parsed === 'object' ? parsed as Record<string, any> : {};
	} catch {
		return c.json({ error: 'GitHub webhook body must be valid JSON.' }, 400);
	}
	if (type !== 'issues' && type !== 'pull_request') return c.json({ accepted: true, invoked: 0, errors: [] }, 202);
	const result = await github.emit(type, {
		event: {
			deliveryId,
			action: typeof payload.action === 'string' ? payload.action : undefined,
			payload,
		},
		thread: { channel: 'github', deliveryId },
	});
	return c.json({ accepted: true, ...result }, 202);
});

export default github;

function readSecret(env: unknown): string | undefined {
	const envSecret = env && typeof env === 'object' ? (env as Record<string, unknown>).GITHUB_WEBHOOK_SECRET : undefined;
	if (typeof envSecret === 'string' && envSecret !== '') return envSecret;
	const processLike = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } };
	const processSecret = processLike.process?.env?.GITHUB_WEBHOOK_SECRET;
	return typeof processSecret === 'string' && processSecret !== '' ? processSecret : undefined;
}

async function verifySignature(body: string, secret: string, signature: string): Promise<boolean> {
	if (!signature.startsWith('sha256=')) return false;
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
	const expected = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
	const actual = signature.slice('sha256='.length);
	if (actual.length !== expected.length) return false;
	let mismatch = 0;
	for (let index = 0; index < actual.length; index++) mismatch |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
	return mismatch === 0;
}
