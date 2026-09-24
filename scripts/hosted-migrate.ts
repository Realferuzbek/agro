import { execFileSync } from 'node:child_process';
import { mkdirSync,readFileSync,readdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// This exact existing target was selected by the user. Do not silently infer another project.
const approvedProject='gunzhtlbpxwpprqwnhfd';
const index=process.argv.indexOf('--project-ref');
const project=index>=0?process.argv[index+1]:undefined;
if(project!==approvedProject)throw new Error(`Pass --project-ref ${approvedProject} to select the explicitly approved target.`);
const sqlString=(value:string)=>`'${value.replaceAll("'","''")}'`;
const directory=resolve('supabase/migrations');
const migrations=readdirSync(directory).filter(name=>/^20260921000[1-6]_.+\.sql$/.test(name)).sort();
if(migrations.length!==6)throw new Error('Expected the six reviewed initial Baraka Agro migrations.');
const statements=[
  'begin;',
  "set local lock_timeout = '10s';",
  "set local statement_timeout = '120s';",
  "select pg_advisory_xact_lock(hashtext('agriflow-initial-deployment'));",
  "do $$ begin if exists(select 1 from pg_tables where schemaname in ('public','private')) then raise exception 'Target has application tables; inspect existing migrations before continuing'; end if; end $$;",
  "create temporary table agriflow_platform_baseline on commit drop as select md5(pg_get_functiondef(p.oid)) as definition_hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='rls_auto_enable';",
  'create schema if not exists supabase_migrations;',
  'create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);',
];
for(const file of migrations){
  const sql=readFileSync(resolve(directory,file),'utf8');const [version,...nameParts]=file.replace(/\.sql$/,'').split('_');
  statements.push(sql,`insert into supabase_migrations.schema_migrations(version,statements,name) values(${sqlString(version)},array[${sqlString(sql)}],${sqlString(nameParts.join('_'))});`);
}
statements.push(readFileSync(resolve('supabase/seed.sql'),'utf8'));
statements.push("do $$ begin if exists(select definition_hash from agriflow_platform_baseline except select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='rls_auto_enable') then raise exception 'Platform RLS function changed unexpectedly'; end if; if not exists(select 1 from pg_event_trigger where evtname='ensure_rls') then raise exception 'Platform RLS event trigger is missing'; end if; end $$;",'commit;',"select count(*) as recorded_migrations from supabase_migrations.schema_migrations where version like '20260921000%';");
mkdirSync(resolve('.local'),{recursive:true});const path=resolve('.local/hosted-initial-migration.sql');writeFileSync(path,statements.join('\n\n'));
try {
  const result=execFileSync(process.execPath,[resolve('node_modules/supabase/dist/supabase.js'),'db','query','--linked','--project-ref',project,'--file',path],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180_000});
  const parsed=JSON.parse(result) as {rows?:Array<{recorded_migrations?:number}>};
  if(parsed.rows?.[0]?.recorded_migrations!==6)throw new Error('Migration command returned an unexpected ledger. Inspect the target before retrying.');
  console.log('Hosted transaction committed: six migrations and static seed; platform auto-RLS objects preserved.');
}catch(error){
  console.error('Hosted migration command did not confirm completion. Inspect the migration ledger before retrying.');
  if(error instanceof Error&&'stderr' in error)console.error(String(error.stderr));
  process.exitCode=1;
}
