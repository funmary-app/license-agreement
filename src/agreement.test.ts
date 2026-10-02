import { describe, expect, it } from 'vitest';
import {
	MARKER,
	confirmedComment,
	defaultAgreementText,
	isExempt,
	isRepositoryName,
	requestComment,
} from './agreement.ts';

describe('isExempt', () => {
	it('Bot には同意を求めない', () => {
		expect(isExempt({ type: 'Bot' })).toBe(true);
	});

	it('Bot でなければ、リポジトリの持ち主やメンバーにも同意を求める', () => {
		expect(isExempt({ type: 'User' })).toBe(false);
	});
});

describe('defaultAgreementText', () => {
	it('文面のファイルがないときは、GitHub が判定したライセンスを示し、版はライセンスのファイルの SHA にする', () => {
		const text = defaultAgreementText('funmary-app/example', {
			name: 'MIT License',
			url: 'https://github.com/funmary-app/example/blob/main/LICENSE',
			sha: 'abc123',
		});
		expect(text.body).toContain('MIT License');
		expect(text.body).toContain('https://github.com/funmary-app/example/blob/main/LICENSE');
		expect(text.version).toBe('license:abc123');
	});

	it('ライセンスもなければ、管理者が定める条件への同意にし、版は none にする', () => {
		expect(defaultAgreementText('funmary-app/example', null).version).toBe('none');
	});
});

describe('コメントの文面', () => {
	it('案内と確認のコメントには、見分けるための印と、作者へのメンションと、リポジトリの名前を入れる', () => {
		const url = 'https://license.example.workers.dev/agree?repo=funmary-app%2Ffunmary';
		const request = requestComment('student', 'funmary-app/funmary', url);
		expect(request).toContain(MARKER);
		expect(request).toContain('@student');
		expect(request).toContain('funmary-app/funmary では');
		expect(request).toContain(url);
		expect(confirmedComment('student')).toContain(MARKER);
	});
});

describe('isRepositoryName', () => {
	it('owner/repo の形だけを受け付ける', () => {
		expect(isRepositoryName('funmary-app/funmary')).toBe(true);
		expect(isRepositoryName('funmary-app/funmary/issues')).toBe(false);
		expect(isRepositoryName('../etc')).toBe(false);
		expect(isRepositoryName('a b/c')).toBe(false);
	});
});
