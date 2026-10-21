-- Query A (read-only): grants, RLS and policies for every object in public,
-- SECURITY DEFINER / search_path / EXECUTE grants for every function, and the
-- default privileges new objects get. Changes nothing.
-- Paste into Supabase Dashboard -> SQL Editor -> Run. One result table.
-- Columns anon / authenticated / service_role / public_role list the
-- privileges each role holds (empty = none).
with objs as (
  select '1 table/view/sequence'::text as section,
         case c.relkind when 'r' then 'table' when 'p' then 'partitioned table'
                        when 'v' then 'view' when 'm' then 'materialized view'
                        when 'f' then 'foreign table' else 'sequence' end as kind,
         c.relname::text as name,
         pg_get_userbyid(c.relowner) as owner,
         coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 's'::"char" else 'r'::"char" end, c.relowner)) as acl,
         c.relrowsecurity as rls_enabled,
         c.relforcerowsecurity as rls_forced,
         null::boolean as security_definer,
         case when c.relkind = 'v' then coalesce(array_to_string(c.reloptions, ', '), 'no security_invoker: runs as owner') end as settings
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
  union all
  select '2 function',
         case p.prokind when 'p' then 'procedure' else 'function' end,
         p.oid::regprocedure::text,
         pg_get_userbyid(p.proowner),
         coalesce(p.proacl, acldefault('f'::"char", p.proowner)),
         null, null,
         p.prosecdef,
         coalesce(array_to_string(p.proconfig, ', '), 'NO fixed search_path')
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and not exists (select 1 from pg_depend d
                    where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  union all
  select '3 default privileges for new objects',
         case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences'
                              when 'f' then 'functions' when 'T' then 'types' else 'schemas' end,
         case when d.defaclnamespace = 0 then 'all schemas' else 'schema public' end,
         'created by ' || pg_get_userbyid(d.defaclrole),
         d.defaclacl, null, null, null, null
  from pg_default_acl d
  where d.defaclnamespace in (0, 'public'::regnamespace)
)
select o.section, o.kind, o.name, o.owner,
       o.rls_enabled, o.rls_forced, o.security_definer, o.settings,
       (select string_agg(a.privilege_type, ',' order by a.privilege_type) from aclexplode(o.acl) a where a.grantee = 'anon'::regrole) as anon,
       (select string_agg(a.privilege_type, ',' order by a.privilege_type) from aclexplode(o.acl) a where a.grantee = 'authenticated'::regrole) as authenticated,
       (select string_agg(a.privilege_type, ',' order by a.privilege_type) from aclexplode(o.acl) a where a.grantee = 'service_role'::regrole) as service_role,
       (select string_agg(a.privilege_type, ',' order by a.privilege_type) from aclexplode(o.acl) a where a.grantee = 0) as public_role,
       (select string_agg(distinct a.grantee::regrole::text, ', ') from aclexplode(o.acl) a
         where a.grantee <> 0 and a.grantee not in ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)) as other_grantees,
       (select string_agg(format('%s (%s %s to %s) using: %s | check: %s', pol.policyname, pol.permissive, pol.cmd,
                                 array_to_string(pol.roles, ','), coalesce(pol.qual, '-'), coalesce(pol.with_check, '-')),
                          E'\n' order by pol.policyname)
          from pg_policies pol
         where o.section like '1%' and pol.schemaname = 'public' and pol.tablename = o.name) as policies
from objs o
order by o.section, o.name;

-- Query B (read-only, run on its own): migrations recorded in the live
-- database that have no file in this repository.
-- select version, name from supabase_migrations.schema_migrations order by version;
