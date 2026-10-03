INSERT INTO public.lua_scripts (name, display_name, description, content, script_type, is_active)
SELECT 'library', 'UI Library', 'Library Lua untuk UI komponen', '', 'library', true
WHERE NOT EXISTS (SELECT 1 FROM public.lua_scripts WHERE name = 'library');