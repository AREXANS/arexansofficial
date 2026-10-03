
-- Create lua_scripts table for script management
CREATE TABLE public.lua_scripts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    content TEXT NOT NULL DEFAULT '',
    script_type TEXT NOT NULL DEFAULT 'main',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lua_scripts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admin can manage lua scripts" ON public.lua_scripts FOR ALL USING (true);
CREATE POLICY "Anyone can read active lua scripts" ON public.lua_scripts FOR SELECT USING (is_active = true);

-- Insert default scripts
INSERT INTO public.lua_scripts (name, display_name, description, content, script_type, is_active) VALUES
('keysystem', 'Key System Loader', 'Script keysystem yang berisi UI input key dan validasi API', '-- Key System Loader\n-- Edit script ini dari dashboard admin', 'loader', true),
('main', 'Main Script', 'Script utama yang dijalankan setelah validasi key berhasil', '-- Main Script\n-- Edit script ini dari dashboard admin', 'main', true);
