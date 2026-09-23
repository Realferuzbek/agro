import { execFileSync } from 'node:child_process';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const project='gunzhtlbpxwpprqwnhfd';
if(process.argv[process.argv.indexOf('--project-ref')+1]!==project)throw new Error(`Pass --project-ref ${project} for the approved target.`);
const query=(args:string[])=>JSON.parse(execFileSync(process.execPath,[resolve('node_modules/supabase/dist/supabase.js'),'db','query','--linked','--project-ref',project,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120_000}));
const literal=(value:string)=>`'${value.replaceAll("'","''")}'`;
try{
  const recorded=query(['SELECT version FROM supabase_migrations.schema_migrations ORDER BY version']);
  // Management API JSON can decode numeric-looking migration versions as numbers.
  const versions=new Set<string>(recorded.rows.map((row:{version:string|number})=>String(row.version)));
  if(!versions.has('202609210007'))throw new Error('The approved initial seven migrations must be installed first.');
  mkdirSync(resolve('.local'),{recursive:true});
  // The enum addition must commit before any statements reference its new value.
  for(const [version,name] of [['202609230008','owner_role'],['202609230009','access_management']]){
    if(versions.has(version))continue;
    const sql=readFileSync(resolve(`supabase/migrations/${version}_${name}.sql`),'utf8');
    const transaction=`begin;\nset local lock_timeout='10s';\nset local statement_timeout='60s';\nselect pg_advisory_xact_lock(hashtext('agriflow-initial-deployment'));\n${sql}\ninsert into supabase_migrations.schema_migrations(version,statements,name) values('${version}',array[${literal(sql)}],'${name}');\ncommit;\nSELECT version FROM supabase_migrations.schema_migrations WHERE version=${literal(version)};`;
    const target=resolve(`.local/hosted-${version}.sql`);writeFileSync(target,transaction);const result=query(['--file',target]);if(String(result.rows?.[0]?.version)!==version)throw new Error('Migration confirmation was missing.');
    console.log(`Hosted migration ${version} committed.`);
  }
  console.log('Owner/access schema is ready. No Auth identity or owner was created by this migration script.');
}catch{console.error('Hosted access migration was not confirmed. Inspect its ledger before retrying.');process.exitCode=1;}
