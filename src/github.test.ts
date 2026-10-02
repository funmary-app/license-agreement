import { describe, expect, it } from 'vitest';
import { createAppJwt, createGitHubClient } from './github.ts';

/** テスト用の RSA の鍵を作り、秘密鍵を PKCS#8 の PEM にする */
async function generateKeyPair() {
	const pair = await crypto.subtle.generateKey(
		{
			name: 'RSASSA-PKCS1-v1_5',
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: 'SHA-256',
		},
		true,
		['sign', 'verify'],
	);
	if (!('privateKey' in pair)) throw new Error('鍵の組を作れませんでした');
	const exported = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
	if (!(exported instanceof ArrayBuffer)) throw new Error('PKCS#8 で書き出せませんでした');
	const der = new Uint8Array(exported);
	const base64 = btoa(String.fromCharCode(...der));
	const pem = `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)?.join('\n') ?? ''}\n-----END PRIVATE KEY-----\n`;
	return { pem, publicKey: pair.publicKey };
}

const decode = (part: string) =>
	JSON.parse(atob(part.replaceAll('-', '+').replaceAll('_', '/'))) as Record<string, unknown>;

describe('createAppJwt', () => {
	it('App の ID と、時計のずれを見込んだ発行と期限の時刻を入れ、RS256 で署名する', async () => {
		const { pem, publicKey } = await generateKeyPair();
		const jwt = await createAppJwt('12345', pem, 1_000_000);
		const [header = '', payload = '', signature = ''] = jwt.split('.');
		expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
		expect(decode(payload)).toEqual({ iat: 999_940, exp: 1_000_540, iss: '12345' });

		const bytes = Uint8Array.from(atob(signature.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
			c.charCodeAt(0),
		);
		const valid = await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			publicKey,
			bytes,
			new TextEncoder().encode(`${header}.${payload}`),
		);
		expect(valid).toBe(true);
	});
});

describe('agreementText', () => {
	it('GitHub が改行を入れて返す Base64 から、UTF-8 の文面を読む', async () => {
		const text = '# 同意\n\nこのリポジトリに送る変更を、BSD 3-Clause License で出します。';
		const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
		// 実際の応答と同じく 60 文字ごとに改行する。文字 s を含む Base64 で確かめる
		const content = `${base64.match(/.{1,60}/g)?.join('\n') ?? ''}\n`;
		expect(base64).toContain('s');
		const client = createGitHubClient(
			{ appId: '1', privateKey: '', clientId: '', clientSecret: '' },
			() => Promise.resolve(Response.json({ content, sha: 'abc123' })),
		);
		await expect(client.agreementText('token', 'funmary-app/funmary')).resolves.toEqual({
			body: text,
			version: 'abc123',
		});
	});
});
