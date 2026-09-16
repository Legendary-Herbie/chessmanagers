import { afterEach } from 'vitest';
import { clearQuerySession } from './shared/query/queryClient.js';
afterEach(clearQuerySession);
