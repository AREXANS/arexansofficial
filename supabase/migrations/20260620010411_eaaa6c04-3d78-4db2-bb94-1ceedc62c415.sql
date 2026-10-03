DROP POLICY IF EXISTS "Anyone can read public lua recordings" ON public.lua_recordings;
REVOKE SELECT ON public.lua_recordings FROM anon;
REVOKE SELECT ON public.lua_recordings FROM authenticated;

CREATE POLICY "No direct client read lua recordings"
ON public.lua_recordings
FOR SELECT
TO anon, authenticated
USING (false);