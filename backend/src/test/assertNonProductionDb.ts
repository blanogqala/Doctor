/**
 * Abort integration runs against production-looking databases.
 * Call when RUN_INTEGRATION=1 — must THROW (fail the suite), never silently skip.
 */
export function assertNonProductionDatabaseUrl(databaseUrl = process.env.DATABASE_URL || ''): void {
  if (!databaseUrl.trim()) {
    throw new Error('Refusing RUN_INTEGRATION: DATABASE_URL is empty.');
  }

  const url = databaseUrl.toLowerCase();
  const forbidden = [
    'prod',
    'production',
    'neon.tech',
    'supabase.co',
    'rds.amazonaws.com',
    'amazonaws.com',
    'azure.com',
    'digitalocean.com',
    'render.com',
    'onrender.com',
    'railway.app',
    'planetscale',
  ];
  for (const token of forbidden) {
    if (url.includes(token)) {
      throw new Error(
        `Refusing RUN_INTEGRATION against a production-looking DATABASE_URL (matched "${token}"). Use local/test PostgreSQL only.`
      );
    }
  }
  if (!url.includes('localhost') && !url.includes('127.0.0.1') && !url.includes('medspace_test')) {
    throw new Error(
      'Refusing RUN_INTEGRATION: DATABASE_URL must target localhost/127.0.0.1 or a medspace_test database.'
    );
  }
}
