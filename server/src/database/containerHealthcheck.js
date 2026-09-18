// Container readiness includes PostgreSQL; /health alone checks only HTTP availability.
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
try {
    const response = await fetch(`http://127.0.0.1:${process.env.PORT || 5000}/health`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error('HTTP health check failed');
    await client.connect();
    await client.query('SELECT 1');
} catch {
    process.exitCode = 1;
} finally {
    await client.end();
}
