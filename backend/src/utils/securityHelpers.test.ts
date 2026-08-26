import { describe, expect, it } from 'vitest';
import { detectAudioMimeFromBuffer, detectImageMimeFromBuffer } from '../utils/fileSignature';
import { redactAuditPayload } from '../services/auditService';

describe('detectAudioMimeFromBuffer', () => {
  it('detects OGG', () => {
    const buf = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectAudioMimeFromBuffer(buf)).toBe('audio/ogg');
  });

  it('detects WAVE', () => {
    const buf = Buffer.alloc(12);
    buf.write('RIFF', 0);
    buf.write('WAVE', 8);
    expect(detectAudioMimeFromBuffer(buf)).toBe('audio/wav');
  });

  it('rejects unknown / executable-like content', () => {
    const buf = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
    expect(detectAudioMimeFromBuffer(buf)).toBeNull();
  });
});

describe('redactAuditPayload', () => {
  it('redacts clinical fields and keeps metadata', () => {
    const out = redactAuditPayload({
      is_draft: false,
      assessment: 'secret diagnosis text',
      vital_signs: { hr: 72 },
      prescriptions: [{ drug_name: 'X' }],
    });
    expect(out).toMatchObject({
      is_draft: false,
      assessment: '[redacted]',
      vital_signs: '[redacted]',
      prescriptions: '[1 items]',
    });
    expect(out?._keys).toContain('assessment');
  });
});

describe('detectImageMimeFromBuffer', () => {
  it('detects PNG and JPEG', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectImageMimeFromBuffer(png)).toBe('image/png');
    expect(detectImageMimeFromBuffer(jpeg)).toBe('image/jpeg');
  });

  it('detects GIF and WebP', () => {
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
    const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectImageMimeFromBuffer(gif)).toBe('image/gif');
    expect(detectImageMimeFromBuffer(webp)).toBe('image/webp');
  });

  it('rejects executable-like content', () => {
    const mz = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
    expect(detectImageMimeFromBuffer(mz)).toBeNull();
  });
});
