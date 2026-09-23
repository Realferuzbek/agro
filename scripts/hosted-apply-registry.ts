import { execFileSync } from 'node:child_process';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const project='gunzhtlbpxwpprqwnhfd';
if(process.argv[process.argv.indexOf('--project-ref')+1]!==project)throw new Error(`Pass --project-ref ${project} for the approved target.`);
const version='202609210007',name='parameter_registry';
const sql=readFileSync(resolve(`supabase/migrations/${version}_${name}.sql`),'utf8');
const literal=(value:string)=>`'${value.replaceAll("'","''")}'`;
const transaction=`begin;\nset local lock_timeout='10s';\nset local statement_timeout='60s';\nselect pg_advisory_xact_lock(hashtext('agriflow-initial-deployment'));\ndo $$ begin if (select count(*) from supabase_migrations.schema_migrations where version between '202609210001' and '202609210006')<>6 then raise exception 'Initial AgriFlow migrations must be present'; end if; end $$;\n${sql}\ninsert into supabase_migrations.schema_migrations(version,statements,name) values('${version}',array[${literal(sql)}],'${name}') on conflict(version) do nothing;\ncommit;\nselect count(*) as recorded_migrations from supabase_migrations.schema_migrations where version like '20260921000%';\n`;
mkdirSync(resolve('.local'),{recursive:true});const target=resolve('.local/hosted-parameter-registry.sql');writeFileSync(target,transaction);
try{const result=JSON.parse(execFileSync(process.execPath,[resolve('node_modules/supabase/dist/supabase.js'),'db','query','--linked','--project-ref',project,'--file',target],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120_000}));if(result.rows?.[0]?.recorded_migrations!==7)throw new Error('Unexpected migration ledger');console.log('Hosted parameter registry migration committed; seven migrations recorded. Older parameter versions preserved.');}
catch(error){console.error('Hosted registry migration was not confirmed. Inspect its ledger before retrying.');if(error instanceof Error&&'stderr'in error)console.error(String(error.stderr));process.exitCode=1;}
