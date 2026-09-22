import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { assertLocalBackend, loadLocalEnvironment } from './env';

loadLocalEnvironment();assertLocalBackend();
const result=spawnSync(process.execPath,[resolve(process.cwd(),'node_modules/vitest/vitest.mjs'),'run','tests/integration'],{env:{...process.env,AGRIFLOW_INTEGRATION_TESTS:'1'},stdio:'inherit'});
process.exitCode=result.status??1;
