// HMAC-SHA256 の署名。GitHub の Webhook の検証と、画面の間で受け渡す値 (OAuth の state、同意のフォーム) の改ざん防止に使う。
// 比べるときは crypto.subtle.verify を使う (文字列の比較は、かかる時間から値を推測される)
const encoder = new TextEncoder();

const importHmacKey = (secret: string) =>
	crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign',
		'verify',
	]);

const toBase64Url = (bytes: ArrayBuffer | Uint8Array) =>
	btoa(String.fromCharCode(...new Uint8Array(bytes)))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '');

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
	const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function fromHex(value: string): Uint8Array<ArrayBuffer> | null {
	if (!/^(?:[0-9a-f]{2})+$/.test(value)) return null;
	return Uint8Array.from(value.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

/** GitHub の Webhook の X-Hub-Signature-256 (sha256=<16 進数>) を確かめる */
export async function verifyWebhookSignature(
	secret: string,
	body: string,
	header: string | null,
): Promise<boolean> {
	const signature = header?.startsWith('sha256=') ? fromHex(header.slice(7)) : null;
	if (!signature) return false;
	return crypto.subtle.verify('HMAC', await importHmacKey(secret), signature, encoder.encode(body));
}

/** 値を JSON にして署名する。期限 (UNIX 秒) を付け、過ぎたら verifyToken が受け付けない */
export async function signToken(
	secret: string,
	payload: object,
	expiresAt: number,
): Promise<string> {
	const body = toBase64Url(encoder.encode(JSON.stringify({ ...payload, exp: expiresAt })));
	const signature = await crypto.subtle.sign(
		'HMAC',
		await importHmacKey(secret),
		encoder.encode(body),
	);
	return `${body}.${toBase64Url(signature)}`;
}

/** 署名を確かめ、期限内なら値を返す。壊れている、書き換えられている、期限切れなら null */
export async function verifyToken(
	secret: string,
	token: string,
	now: number,
): Promise<Record<string, unknown> | null> {
	const [body, signaturePart, ...rest] = token.split('.');
	if (!body || !signaturePart || rest.length > 0) return null;
	const signature = fromBase64Url(signaturePart);
	if (!signature) return null;
	const valid = await crypto.subtle.verify(
		'HMAC',
		await importHmacKey(secret),
		signature,
		encoder.encode(body),
	);
	if (!valid) return null;
	const bytes = fromBase64Url(body);
	if (!bytes) return null;
	const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
	if (typeof payload !== 'object' || payload === null) return null;
	const record = payload as Record<string, unknown>;
	return typeof record['exp'] === 'number' && record['exp'] > now ? record : null;
}
