import dotenv from 'dotenv';
import path from 'path';

// Load backend/.env first. dotenv does not override existing vars, so the
// placeholder must NOT be applied before this or integration will auth as "user".
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/medspace_test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-that-is-long-enough-1234567890';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
