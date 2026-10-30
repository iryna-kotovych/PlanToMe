-- Refuses to create an account for anyone but the owner ("Before User Created"
-- auth hook, enabled in supabase/config.toml). The app also checks the email
-- on the server, and Row Level Security checks it on every query.
create function private.before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if exists (
    select 1
    from private.allowed_emails
    where email = lower(coalesce(event -> 'user' ->> 'email', ''))
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error',
    jsonb_build_object('http_code', 403, 'message', 'This PlanToMe is private.')
  );
end;
$$;

grant usage on schema private to supabase_auth_admin;
grant execute on function private.before_user_created(jsonb) to supabase_auth_admin;
grant select on private.allowed_emails to supabase_auth_admin;
create policy "Auth reads the allowed emails" on private.allowed_emails
  for select to supabase_auth_admin
  using (true);

revoke execute on function private.before_user_created(jsonb)
  from public, anon, authenticated;
