-- Update user-facing strings embedded in the two already-deployed functions
-- that emit the previous product name.
do $$
declare
  function_oid oid;
  function_definition text;
begin
  -- NEXUS appears only as the legacy text being replaced in already-deployed
  -- function bodies. New deployments and all resulting messages use STARLADDER.
  foreach function_oid in array array[
    'public.run_small_matchmaker()'::regprocedure::oid,
    'public.enforce_not_banned()'::regprocedure::oid
  ]
  loop
    function_definition := pg_get_functiondef(function_oid);
    if function_definition like '%NEXUS%' then
      execute replace(function_definition, 'NEXUS', 'STARLADDER');
    end if;
  end loop;
end
$$;
