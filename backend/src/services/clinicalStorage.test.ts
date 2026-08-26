import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createClinicalStorage,
  resetClinicalStorageForTests,
  resolveClinicalStorageRoot,
} from './clinicalStorage';
import { FilesystemClinicalStorage } from './clinicalStorage/filesystemStorage';
import {
  assertSafeStorageKey,
  buildClinicalObjectKey,
  isLegacyConsultationKey,
} from './clinicalStorage/types';
import { redactAuditPayload } from './auditService';
import { extensionForMime, writeConsultationAudio } from './consultationAudioStorage';

describe('clinical storage keys', () => {
  it('builds tenant-qualified non-enumerable keys', () => {
    const key = buildClinicalObjectKey({
      practiceId: 'prac-1',
      recordId: 'rec-1',
      extension: 'webm',
    });
    expect(key).toMatch(/^practice\/prac-1\/records\/rec-1\/[A-Za-z0-9_-]+\.webm$/);
    expect(key).not.toMatch(/@/);
    expect(key.toLowerCase()).not.toContain('patient');
  });

  it('rejects path traversal keys', () => {
    expect(() => assertSafeStorageKey('../etc/passwd')).toThrow(/Invalid/);
    expect(() => assertSafeStorageKey('/absolute')).toThrow(/Invalid/);
  });

  it('detects legacy consultation keys', () => {
    expect(isLegacyConsultationKey('consultations/abc.webm')).toBe(true);
    expect(isLegacyConsultationKey('practice/x/records/y/z.webm')).toBe(false);
  });
});

describe('FilesystemClinicalStorage (local adapter)', () => {
  let root = '';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'medspace-clinical-'));
    resetClinicalStorageForTests();
  });

  afterEach(() => {
    resetClinicalStorageForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('puts, reads, and deletes objects', async () => {
    const storage = createClinicalStorage({ driver: 'local', root });
    const key = 'practice/p1/records/r1/file.webm';
    await storage.put(key, Buffer.from('audio-bytes'));
    expect(await storage.exists(key)).toBe(true);
    const stream = await storage.openReadStream(key);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (c) => chunks.push(Buffer.from(c)));
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });
    expect(Buffer.concat(chunks).toString()).toBe('audio-bytes');
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
  });

  it('blocks path escape', () => {
    const storage = new FilesystemClinicalStorage('local', root);
    expect(() => storage.absolutePath('../outside.bin')).toThrow();
  });

  it('render-disk default root resolves under /var/data/clinical when unset', () => {
    expect(resolveClinicalStorageRoot('render-disk', null).replace(/\\/g, '/')).toContain(
      'var/data/clinical'
    );
  });

  it('assertWritable fails when root is a file (render-disk readiness)', async () => {
    const fileAsRoot = path.join(root, 'not-a-dir');
    fs.writeFileSync(fileAsRoot, 'x');
    const storage = new FilesystemClinicalStorage('render-disk', fileAsRoot);
    await expect(storage.assertWritable()).rejects.toThrow();
  });
});

describe('consultationAudioStorage write key shape', () => {
  let root = '';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'medspace-consult-'));
  });

  afterEach(() => {
    resetClinicalStorageForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes under practice/records key and maps mime extensions', async () => {
    expect(extensionForMime('audio/webm')).toBe('webm');
    const storage = createClinicalStorage({ driver: 'local', root });
    resetClinicalStorageForTests(storage);
    const key = await writeConsultationAudio({
      practiceId: '11111111-1111-1111-1111-111111111111',
      recordId: '22222222-2222-2222-2222-222222222222',
      buffer: Buffer.from('x'),
      mimeType: 'audio/webm',
    });
    expect(key).toMatch(
      /^practice\/11111111-1111-1111-1111-111111111111\/records\/22222222-2222-2222-2222-222222222222\/[A-Za-z0-9_-]+\.webm$/
    );
    expect(fs.existsSync(path.join(root, key))).toBe(true);
  });
});

describe('audit redaction (centralized)', () => {
  it('redacts SOAP, transcript, and secrets', () => {
    const out = redactAuditPayload({
      assessment: 'PHI diagnosis text',
      transcript: 'full transcript',
      password: 'secret',
      token: 'raw-token',
      audioBytes: 12,
      action: 'ok',
    });
    expect(out?.assessment).toBe('[redacted]');
    expect(out?.transcript).toBe('[redacted]');
    expect(out?.password).toBe('[redacted]');
    expect(out?.token).toBe('[redacted]');
    expect(out?.audioBytes).toBe(12);
    expect(out?.action).toBe('ok');
  });
});

describe('server clinical exposure contract', () => {
  it('does not mount express.static for /clinical', () => {
    const serverSource = fs.readFileSync(path.join(__dirname, '../server.ts'), 'utf8');
    expect(serverSource).not.toMatch(/express\.static\(\s*['"`]\/clinical/);
    expect(serverSource).not.toMatch(/app\.use\(\s*['"`]\/clinical['"`]/);
  });
});
