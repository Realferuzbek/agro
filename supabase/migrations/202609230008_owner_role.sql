-- Enum additions must commit before a following migration can use the new value.
alter type public.user_role add value if not exists 'owner';
