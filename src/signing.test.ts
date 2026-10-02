import { describe, expect, it } from 'vitest';
import { signToken, verifyToken, verifyWebhookSignature } from './signing.ts';

/** GitHub と同じ方法 (HMAC-SHA256 の 16 進数) で、Webhook の署名を作る */
async function githubSignature(secret: string, body: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
	return `sha256=${Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

describe('verifyWebhookSignature', () => {
	const body = '{"action":"opened"}';

	it('GitHub と同じ方法で作った署名を受け付ける', async () => {
		const header = await githubSignature('webhook-secret', body);
		expect(await verifyWebhookSignature('webhook-secret', body, header)).toBe(true);
	});

	it('秘密が違う、中身が違う、形が違う、署名がないときは受け付けない', async () => {
		const header = await githubSignature('webhook-secret', body);
		expect(await verifyWebhookSignature('other-secret', body, header)).toBe(false);
		expect(await verifyWebhookSignature('webhook-secret', `${body} `, header)).toBe(false);
		expect(await verifyWebhookSignature('webhook-secret', body, 'sha1=abcd')).toBe(false);
		expect(await verifyWebhookSignature('webhook-secret', body, null)).toBe(false);
	});
});

describe('signToken と verifyToken', () => {
	it('署名した値を、期限内なら取り出せる', async () => {
		const token = await signToken('key', { repo: 'a/b' }, 2_000);
		expect(await verifyToken('key', token, 1_000)).toEqual({ repo: 'a/b', exp: 2_000 });
	});

	it('期限を過ぎた、鍵が違う、書き換えられた値は受け付けない', async () => {
		const token = await signToken('key', { repo: 'a/b' }, 2_000);
		expect(await verifyToken('key', token, 2_000)).toBeNull();
		expect(await verifyToken('other', token, 1_000)).toBeNull();
		const [, signature] = token.split('.');
		const forgedBody = btoa(JSON.stringify({ repo: 'evil/x', exp: 9_999 })).replace(/=+$/, '');
		const forged = `${forgedBody}.${signature ?? ''}`;
		expect(await verifyToken('key', forged, 1_000)).toBeNull();
		expect(await verifyToken('key', 'not-a-token', 1_000)).toBeNull();
	});
});
