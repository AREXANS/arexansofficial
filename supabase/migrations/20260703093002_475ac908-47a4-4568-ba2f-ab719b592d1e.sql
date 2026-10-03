UPDATE public.lua_scripts
SET content = replace(
  content,
  E'    local success, result = pcall(function()\n        return loadstring(game:HttpGet(scriptUrl))()\n    end)',
  E'    local success, result = pcall(function()\n        local src = game:HttpGet(scriptUrl .. (scriptUrl:find("%?") and "&raw=1" or "?raw=1"))\n        if type(src) ~= "string" or src == "" then error("empty script body from server") end\n        local loader = loadstring or load\n        if type(loader) ~= "function" then error("executor missing loadstring/load") end\n        local fn, compileErr = loader(src, "=ArexansMainScript")\n        if type(fn) ~= "function" then error("compile error: " .. tostring(compileErr)) end\n        return fn()\n    end)'
)
WHERE name = 'keysystem';