import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../server';

describe('health endpoints', () => {
  it('GET /health/live is always ok', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.check).toBe('live');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('GET /health/ready reports database check', async () => {
    const res = await request(app).get('/health/ready');
    expect([200, 503]).toContain(res.status);
    expect(res.body.check).toBe('ready');
    expect(res.body.checks).toHaveProperty('database');
  });

  it('legacy GET /health still works', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });
});
