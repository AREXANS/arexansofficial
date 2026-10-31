local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")

local UI_LIBRARY_URL = "https://caecqqzbikmwroevvyrd.supabase.co/functions/v1/get-script?name=library&raw=1"
local DEBUG_UI_LOADER = false

local function validateUI(candidate)
    if type(candidate) ~= "table" then
        return false, "bukan table, melainkan: " .. tostring(typeof(candidate))
    end

    local requiredMethods = {
        "Icons",
        "RegisterButtonEffect",
        "MakeDraggable",
        "registerThemeElement",
        "createButton",
        "createToggle",
        "createTextBox",
        "createSlider",
        "createIconButton",
        "showNotification",
        "promptInput",
        "showConfirmationPrompt",
    }

    for _, key in ipairs(requiredMethods) do
        local value = candidate[key]
        if key == "Icons" then
            if type(value) ~= "table" then
                return false, "UI.Icons tidak ada / bukan table"
            end
        elseif type(value) ~= "function" then
            return false, "UI." .. key .. " tidak ditemukan / bukan function"
        end
    end

    candidate.ThemeableElements = candidate.ThemeableElements or {}
    return true
end

local function resetUIRuntimeState(ui)
    -- Bersihkan daftar instance lama saat script dieksekusi ulang supaya tidak menumpuk dan tidak bikin lag.
    if type(ui) == "table" then
        ui.ThemeableElements = {}
        ui._AutoThemeElements = {}
    end
    return ui
end

local function runUILibrarySource(source)
    local chunk, compileErr = loadstring(source)
    if type(chunk) ~= "function" then
        return nil, "source UI bukan Lua valid: " .. tostring(compileErr)
    end

    local okRun, result = pcall(chunk)
    if okRun then
        local okUI, reason = validateUI(result)
        if okUI then
            return result
        end

        -- Jika endpoint berisi `local UI = { ... }` tetapi tidak melakukan `return UI`,
        -- compile ulang source dengan `return UI` pada chunk yang sama.
        if result == nil then
            local retryChunk, retryCompileErr = loadstring(source .. "\nreturn UI")
            if type(retryChunk) == "function" then
                local okRetry, retryResult = pcall(retryChunk)
                if okRetry then
                    local okRetryUI, retryReason = validateUI(retryResult)
                    if okRetryUI then
                        return retryResult
                    end
                    return nil, "endpoint return nil; retry `return UI` juga gagal validasi: " .. tostring(retryReason)
                end
                return nil, "endpoint return nil; retry `return UI` error: " .. tostring(retryResult)
            end
            return nil, "endpoint return nil; retry compile gagal: " .. tostring(retryCompileErr)
        end

        return nil, "UI dari endpoint tidak valid: " .. tostring(reason)
    end

    return nil, "error saat menjalankan UI library: " .. tostring(result)
end

local function fetchRemoteUISource()
    local okHttp, sourceOrErr = pcall(function()
        -- Satu kali request langsung ke raw script. Parameter kedua dibuat true agar executor tidak memakai cache lama jika mendukung.
        return game:HttpGet(UI_LIBRARY_URL, true)
    end)

    if not okHttp then
        return nil, tostring(sourceOrErr)
    end

    if type(sourceOrErr) ~= "string" or sourceOrErr == "" then
        return nil, "response kosong / bukan string"
    end

    return sourceOrErr
end

local function loadUI()
    -- Cache UI di session yang sama supaya execute ulang tidak download/compile ulang dan tidak terasa freeze/lag di awal.
    if _G.Arexans_RemoteUI_Cache then
        local okCachedUI = validateUI(_G.Arexans_RemoteUI_Cache)
        if okCachedUI then
            return resetUIRuntimeState(_G.Arexans_RemoteUI_Cache)
        end
        _G.Arexans_RemoteUI_Cache = nil
    end

    local source, fetchErr = fetchRemoteUISource()
    if not source then
        error("[ArexansTools] UI remote gagal dimuat dari raw script: " .. tostring(fetchErr), 2)
    end

    local remoteUI, remoteErr = runUILibrarySource(source)
    if not remoteUI then
        error("[ArexansTools] UI remote tidak valid: " .. tostring(remoteErr), 2)
    end

    _G.Arexans_RemoteUI_Cache = resetUIRuntimeState(remoteUI)
    if DEBUG_UI_LOADER then
        warn("[ArexansTools] UI remote berhasil dimuat dari raw script.")
    end
    return _G.Arexans_RemoteUI_Cache
end

local UI = loadUI()


-- Matikan notifikasi yang berasal dari toggle on/off fitur apa pun.
local AREXANS_MUTE_TOGGLE_NOTIFICATIONS = true
local __ArexansToggleCallbackDepth = 0

local function __arexansIsToggleNotificationMessage(message)
    local text = tostring(message or "")
    local lower = string.lower(text)
    if lower == "" then return false end

    -- Pesan toggle paling umum memakai ON/OFF.
    if lower:match("%f[%a]on%f[%A]") or lower:match("%f[%a]off%f[%A]") then
        return true
    end

    -- Pesan toggle yang memakai istilah aktif/nonaktif/hidup/mati.
    local toggleWords = {
        " diaktifkan", " dinonaktifkan", " mengaktifkan", " menonaktifkan",
        " aktif", " nonaktif", " hidup", " mati", " dihentikan"
    }
    for _, word in ipairs(toggleWords) do
        if lower:find(word, 1, true) then
            return true
        end
    end
    return false
end

-- Bungkus toggle bawaan UI agar showNotification di callback toggle tidak muncul,
-- tanpa mengubah tampilan/struktur GUI.
do
    local originalCreateToggle = UI.createToggle
    if type(originalCreateToggle) == "function" then
        UI.createToggle = function(parent, label, initialState, callback, ...)
            local wrappedCallback = callback
            if type(callback) == "function" then
                wrappedCallback = function(...)
                    __ArexansToggleCallbackDepth = (__ArexansToggleCallbackDepth or 0) + 1
                    local ok, err = pcall(callback, ...)
                    __ArexansToggleCallbackDepth = math.max((__ArexansToggleCallbackDepth or 1) - 1, 0)
                    if not ok then error(err, 2) end
                end
            end
            return originalCreateToggle(parent, label, initialState, wrappedCallback, ...)
        end
    end
end

do
    UI.Icons = UI.Icons or {}
    local forcedIcons = {
        Lock = "LOCK",
        DownArrow = "v",
        Memo = "N",
        Controller = "76490664021809",
        Game = "76490664021809",
        Bust = "P",
        Folder = "DIR",
        Gear = "109279812885995",
        Settings = "109279812885995",
        BunnyGirls = "C",
        Cyclone = "T",
        Skull = "F",
        Refresh = "86576480880907",
        Mag = "71027265580571",
        Search = "71027265580571",
        NoLittering = "NO",
        Expressionless = "82033033854562",
        Grinning = "11973550076",
        AnimationVip = "11973550076",
        Clown = "111159927879774",
        EmoteVip = "111159927879774",
        Selection = "99227795890986",
        CheckBallot = "99227795890986",
        CutRecord = "117645351334197",
        Scissors = "117645351334197",
        ConnectorRecord = "112308837443850",
        Link = "112308837443850",
        SaveData = "101133127109835",
        LoadData = "114536672630981",
    FloppyDisk = "101133127109835",
        ImportFile = "99385102861455",
        ExportFile = "77864449231390",
        Edit = "88134306391339",
        Pencil = "88134306391339",
        StartRecord = "17546229322",
        RedCircle = "17546229322",
        StopStartRecord = "100023233648142",
        StopSquare = "100023233648142",
        PlayRecord = "6724789060",
        PlayButton = "6724789060",
        PausePlayRecord = "6724857700",
        Pause = "6724857700",
        ResetStopRecord = "129665869634869",
        DeleteRecord = "82033033854562",
        Wastebasket = "82033033854562",
        Trash = "82033033854562",
        Eye = "18784692057",
        Location = "92149294054426",
        SaveLocationTeleport = "92149294054426",
        Pin = "92149294054426",
        ScannerAntenna = "111803809413609",
        Satellite = "111803809413609",
    }
    for key, value in pairs(forcedIcons) do
        UI.Icons[key] = value
    end

    -- AREXANS ICON FIX v8 - import/export/VIP/close icon aliases
    -- Import memakai 99385102861455; export memakai 77864449231390; ID import lama dibersihkan.
    UI.Icons.ImportFile = "99385102861455"
    UI.Icons.ExportFile = "77864449231390"
    UI.Icons.EmoteVip = "111159927879774"
    UI.Icons.Clown = "111159927879774"
    UI.Icons.AnimationVip = "11973550076"
    UI.Icons.Grinning = "11973550076"
    UI.Icons.Expressionless = "82033033854562"
    UI.Icons.DeleteRecord = "82033033854562"
    UI.Icons.Wastebasket = "82033033854562"
    UI.Icons.Trash = "82033033854562"
    -- AREXANS ICON FIX v9 - search/refresh/game/settings
    UI.Icons.Search = "71027265580571"
    UI.Icons.Mag = "71027265580571"
    UI.Icons.Refresh = "86576480880907" -- sama dengan ServerRefreshIconButton
    UI.Icons.Game = "76490664021809"
    UI.Icons.Controller = "76490664021809"
    UI.Icons.Settings = "109279812885995"
    UI.Icons.Gear = "109279812885995"
    UI.IconText = UI.IconText or {}
    UI.IconText.Wastebasket = "82033033854562"


    UI.isAssetIcon = function(icon)
        local value = tostring(icon or "")
        return value:match("^%d+$") ~= nil or value:match("^rbxassetid://") ~= nil or value:match("^rbxthumb://") ~= nil
    end

    UI.toAssetIcon = function(icon)
        local value = tostring(icon or "")
        if value:match("^rbxassetid://") or value:match("^rbxthumb://") then
            return value
        end
        if value:match("^%d+$") then
            return "rbxassetid://" .. value
        end
        return value
    end

    UI.allowsDeveloperIconGradient = UI.allowsDeveloperIconGradient or function(instance)
        if not instance then return false end
        local okAllow, allow = pcall(function() return instance:GetAttribute("ArexansAllowDeveloperIconGradient") end)
        if okAllow and allow == true then return true end
        local okAllow2, allow2 = pcall(function() return instance:GetAttribute("ArexansAllowDeveloperGradient") end)
        if okAllow2 and allow2 == true then return true end
        local name = tostring(instance.Name or "")
        return name == "SaveProfileBtn" or name == "LoadProfileBtn" or name == "InfoButton" or name == "InfoBtn"
    end

    UI.applyIcon = function(target, icon, color)
        if not target then return end
        local isAsset = UI.isAssetIcon(icon)
        local finalColor = color or Color3.fromRGB(255, 255, 255)

        if target:IsA("ImageButton") or target:IsA("ImageLabel") then
            if isAsset then
                target.Image = UI.toAssetIcon(icon)
                target.ScaleType = Enum.ScaleType.Fit
                target.ImageColor3 = finalColor
            end
            return
        end

        if target:IsA("TextButton") or target:IsA("TextLabel") then
            if isAsset then
                target.Text = ""
                local img = target:FindFirstChild("ArexansIconImage")
                if not img then
                    img = Instance.new("ImageLabel")
                    img.Name = "ArexansIconImage"
                    img.BackgroundTransparency = 1
                    img.AnchorPoint = Vector2.new(0.5, 0.5)
                    img.Position = UDim2.new(0.5, 0, 0.5, 0)
                    img.Size = UDim2.new(1, -2, 1, -2)
                    img.ScaleType = Enum.ScaleType.Fit
                    img.ZIndex = (target.ZIndex or 1) + 2
                    img.Parent = target
                end
                if UI.allowsDeveloperIconGradient and UI.allowsDeveloperIconGradient(target) then
                    pcall(function()
                        img:SetAttribute("ArexansAllowDeveloperGradient", true)
                        img:SetAttribute("ArexansAllowDeveloperIconGradient", true)
                        img:SetAttribute("ArexansNoDeveloperGradient", false)
                    end)
                else
                    pcall(function() img:SetAttribute("ArexansNoDeveloperGradient", true) end)
                end
                img.Image = UI.toAssetIcon(icon)
                img.ImageColor3 = finalColor
                img.Visible = true
            else
                local img = target:FindFirstChild("ArexansIconImage")
                if img then img.Visible = false end
                target.Text = tostring(icon or "")
                if color then target.TextColor3 = color end
            end
        end
    end

    local originalCreateIconButton = UI.createIconButton
    UI.createIconButton = function(parent, iconText, color, size)
        local finalColor = color or Color3.fromRGB(255, 255, 255)
        local finalSize = size or 22
        if UI.isAssetIcon(iconText) then
            local btn = Instance.new("ImageButton")
            btn.Name = "ArexansPatchedIconButton"
            btn.Size = UDim2.new(0, finalSize, 0, finalSize)
            btn.BackgroundTransparency = 1
            btn.BorderSizePixel = 0
            btn.Image = UI.toAssetIcon(iconText)
            btn.ImageColor3 = finalColor
            btn.ScaleType = Enum.ScaleType.Fit
            btn.Parent = parent
            pcall(function() btn:SetAttribute("ArexansNoDeveloperGradient", true) end)

            local padding = Instance.new("UIPadding", btn)
            padding.PaddingTop = UDim.new(0, 2)
            padding.PaddingBottom = UDim.new(0, 2)
            padding.PaddingLeft = UDim.new(0, 2)
            padding.PaddingRight = UDim.new(0, 2)

            local corner = Instance.new("UICorner", btn)
            corner.CornerRadius = UDim.new(0, 5)

            local stroke = Instance.new("UIStroke", btn)
            stroke.Color = finalColor
            stroke.Transparency = 0
            stroke.Thickness = 1
            stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border

            if UI.registerThemeElement and finalColor.B > finalColor.R and finalColor.B > 0.5 then
                UI.registerThemeElement(stroke, "Color", stroke.Color)
                UI.registerThemeElement(btn, "ImageColor3", btn.ImageColor3)
            end
            if UI.RegisterButtonEffect then UI.RegisterButtonEffect(btn) end
            return btn
        end
        if originalCreateIconButton then
            return originalCreateIconButton(parent, iconText, finalColor, finalSize)
        end
    end
end

if game:GetService("CoreGui"):FindFirstChild("ArexanstoolsGUI") then
    game:GetService("CoreGui"):FindFirstChild("ArexanstoolsGUI"):Destroy()
end
if game:GetService("CoreGui"):FindFirstChild("ArexansSpectatorGUI") then
    game:GetService("CoreGui"):FindFirstChild("ArexansSpectatorGUI"):Destroy()
end
if game:GetService("CoreGui"):FindFirstChild("FlingStatusGUI") then
    game:GetService("CoreGui"):FindFirstChild("FlingStatusGUI"):Destroy()
end
-- [[ PERUBAHAN BARU: Hapus GUI spectate lokasi jika ada ]]
if game:GetService("CoreGui"):FindFirstChild("ArexansLocationSpectatorGUI") then
    game:GetService("CoreGui"):FindFirstChild("ArexansLocationSpectatorGUI"):Destroy()
end
if game:GetService("CoreGui"):FindFirstChild("RecordingFilePickerGUI") then
    game:GetService("CoreGui"):FindFirstChild("RecordingFilePickerGUI"):Destroy()
end


return function(sessionDataOrTimestamp, userRoleLegacy)
    -- ====================================================================
    -- == BAGIAN OTENTIKASI DAN INISIALISASI (REALTIME SYNC)           ==
    -- ====================================================================
    HttpService = game:GetService("HttpService")
    CoreGui = game:GetService("CoreGui")
    Players = game:GetService("Players")
    LocalPlayer = Players.LocalPlayer

    local AREXANS_BATCH_SIZE = 240
    local function arexansYieldEvery(index, batchSize)
        if index and index > 0 and index % (batchSize or AREXANS_BATCH_SIZE) == 0 and task and task.wait then
            task.wait()
        end
    end
    
    -- [[ REALTIME DATA HANDLER - Compatible dengan format lama dan baru ]]
    expirationTimestamp = nil
    userRole = nil
    sessionInfo = {}
    
    if type(sessionDataOrTimestamp) == "table" then
        -- Format baru: object dengan data lengkap dari validate-key
        sessionInfo = sessionDataOrTimestamp
        userRole = sessionInfo.role
        -- Hitung expiration dari timeRemainingMs (data realtime dari server)
        if sessionInfo.timeRemainingMs then
            expirationTimestamp = os.time() + math.floor(sessionInfo.timeRemainingMs / 1000)
        else
            expirationTimestamp = os.time() + (86400 * 30) -- Default 30 hari
        end
    else
        -- Format lama: expirationTimestamp langsung
        expirationTimestamp = sessionDataOrTimestamp or (os.time() + 86400 * 30)
        userRole = userRoleLegacy
        sessionInfo = {role = userRole}
    end
    
    currentUserRole = userRole -- Role variable yang akan digunakan
    if tostring(currentUserRole or ""):upper() == "LIFETIME" then currentUserRole = "Lifetime" end
    if currentUserRole == "DEVELOPER" then currentUserRole = "Developer" end

    -- << [NEW] Permission checking function
    function hasPermission(requiredRole)
        local hierarchy = {FREE = 1, NORMAL = 2, VIP = 3, LIFETIME = 4, DEVELOPER = 5}
        local userLevel = hierarchy[tostring(currentUserRole):upper()] or hierarchy["FREE"]
        local requiredLevel = hierarchy[tostring(requiredRole):upper()] or hierarchy["FREE"]
        return userLevel >= requiredLevel
    end

    function parseISO8601(iso)
        local y, mo, d, h, mi, s = iso:match("^(%d%d%d%d)-(%d%d)-(%d%d)T(%d%d):(%d%d):(%d%d)")
        if not y then return nil end
        -- os.time in Roblox is UTC
        return os.time({year=tonumber(y), month=tonumber(mo), day=tonumber(d), hour=tonumber(h), min=tonumber(mi), sec=tonumber(s)})
    end

    -- ====================================================================
    if _G.Arexans_Connections then
        for _, conn in ipairs(_G.Arexans_Connections) do
            if typeof(conn) == "RBXScriptConnection" and conn.Connected then
                pcall(function() conn:Disconnect() end)
            end
        end
        table.clear(_G.Arexans_Connections)
    else
        _G.Arexans_Connections = {}
    end

    function ConnectEvent(event, func)
        local conn = event:Connect(func)
        table.insert(_G.Arexans_Connections, conn)
        return conn
    end

    -- [[ FUNGSI DRAGGABLE YANG DI-REFACTOR UNTUK KENYAMANAN PENGGUNA ]] --
    saveGuiPositions = nil -- Deklarasi di scope luar agar bisa diakses MakeDraggable


    -- [PERUBAHAN] Variabel path file dipindahkan ke lingkup luar
    SAVE_FOLDER = "ArexansTools"
    if isfolder and not isfolder(SAVE_FOLDER) then
        pcall(makefolder, SAVE_FOLDER)
    end
    RECORDING_FOLDER = SAVE_FOLDER .. "/Rekaman"
    if isfolder and not isfolder(RECORDING_FOLDER) then
        pcall(makefolder, RECORDING_FOLDER)
    end
    PROFILES_FOLDER = SAVE_FOLDER .. "/Profiles"
    if isfolder and not isfolder(PROFILES_FOLDER) then
        pcall(makefolder, PROFILES_FOLDER)
    end
    saveId = (game.GameId ~= 0 and game.GameId) or game.PlaceId
    
    TELEPORT_SAVE_FILE = SAVE_FOLDER .. "/ArexansTools_Teleports_" .. tostring(game.PlaceId) .. ".json"
    GUI_POSITIONS_SAVE_FILE = SAVE_FOLDER .. "/ArexansTools_GuiPositions_" .. tostring(saveId) .. ".json"
    FEATURE_STATES_SAVE_FILE = SAVE_FOLDER .. "/ArexansTools_FeatureStates_" .. tostring(saveId) .. ".json"
    ANIMATION_SAVE_FILE = SAVE_FOLDER .. "/ArexansTools_Animations.json"
    EMOTE_FAVORITES_SAVE_FILE = SAVE_FOLDER .. "/EmoteFavorites.json" -- [[ PERUBAHAN BARU ]]
    SCRIPT_FAVORITES_SAVE_FILE = SAVE_FOLDER .. "/ScriptFavorites.json" -- [[ PERUBAHAN BARU ]]
    RECORDING_SAVE_FILE = SAVE_FOLDER .. "/ArexansTools_Recordings_" .. tostring(game.PlaceId) .. ".json" -- [[ PERUBAHAN BARU ]]
    SESSION_SAVE_FILE = SAVE_FOLDER .. "/ArexansTools_Session.json"
    UNIVERSAL_KEYBINDS_FILE = SAVE_FOLDER .. "/ArexansTools_UniversalKeybinds.json"
    RECORDING_SYNC_API = "https://caecqqzbikmwroevvyrd.supabase.co/functions/v1/sync-recordings"
    TELEPORT_SYNC_API = "https://caecqqzbikmwroevvyrd.supabase.co/functions/v1/sync-teleports"

    -- Helper aman untuk membuat folder agar save/export rekaman tidak memanggil fungsi nil.
    function safeMakeFolder(path)
        if not path or path == "" then return false end
        if isfolder and isfolder(path) then return true end
        if makefolder then
            local ok = pcall(makefolder, path)
            if ok then return true end
        end
        return isfolder and isfolder(path) or false
    end


    -- Helper nama file/map rekaman agar Auto Perfect/export tidak memanggil fungsi nil.
    function sanitizeFileComponent(value)
        local text = tostring(value or "")
        text = text:gsub("[%c]", " ")
        text = text:gsub("[\\/:*?\"<>|]", "-")
        text = text:gsub("%s+", " ")
        text = text:gsub("^%s+", ""):gsub("%s+$", "")
        if text == "" then text = "Arexans" end
        if #text > 80 then text = text:sub(1, 80):gsub("%s+$", "") end
        return text
    end

    function getCurrentMapName()
        local placeName = nil
        pcall(function()
            local MarketplaceService = game:GetService("MarketplaceService")
            local info = MarketplaceService:GetProductInfo(game.PlaceId)
            if type(info) == "table" and info.Name and tostring(info.Name) ~= "" then
                placeName = tostring(info.Name)
            end
        end)
        if not placeName or placeName == "" then
            pcall(function()
                if game.Name and tostring(game.Name) ~= "" then
                    placeName = tostring(game.Name)
                end
            end)
        end
        return sanitizeFileComponent(placeName or ("Place " .. tostring(game.PlaceId)))
    end

    function getAutoExportBaseName()
        local username = LocalPlayer and (LocalPlayer.Name or LocalPlayer.DisplayName) or "Arexans"
        return sanitizeFileComponent(getCurrentMapName() .. " - " .. sanitizeFileComponent(username))
    end

    function getAvailableExportPath(baseName)
        baseName = sanitizeFileComponent(baseName or getAutoExportBaseName())
        local folder = RECORDING_FOLDER or (SAVE_FOLDER and (SAVE_FOLDER .. "/Rekaman")) or "ArexansTools/Rekaman"
        safeMakeFolder(folder)
        local path = folder .. "/" .. baseName .. ".json"
        if not isfile then return path end
        local index = 2
        while isfile(path) and index <= 999 do
            path = folder .. "/" .. baseName .. " (" .. tostring(index) .. ").json"
            index = index + 1
        end
        if isfile(path) then
            path = folder .. "/" .. baseName .. " - " .. tostring(os.time()) .. ".json"
        end
        return path
    end

    function getFileNameFromPath(path)
        local text = tostring(path or "")
        return text:match("([^/\\]+)$") or text
    end

    -- [[ PERUBAHAN BARU: Variabel dan fungsi untuk favorit emote ]]
    favoriteEmotes = {}
    favoriteScripts = {}

    function saveFavorites()
        if not writefile then return end
        pcall(function()
            writefile(EMOTE_FAVORITES_SAVE_FILE, HttpService:JSONEncode(favoriteEmotes))
        end)
    end

    function loadFavorites()
        if not readfile or not isfile or not isfile(EMOTE_FAVORITES_SAVE_FILE) then return end
        local success, result = pcall(function()
            local content = readfile(EMOTE_FAVORITES_SAVE_FILE)
            local data = HttpService:JSONDecode(content)
            if type(data) == "table" then
                favoriteEmotes = data
            end
        end)
        if not success then
            warn("Gagal memuat favorit emote:", result)
        end
    end

    function saveFavoriteScripts()
        if not writefile then return end
        pcall(function()
            writefile(SCRIPT_FAVORITES_SAVE_FILE, HttpService:JSONEncode(favoriteScripts))
        end)
    end

    function loadFavoriteScripts()
        if not readfile or not isfile or not isfile(SCRIPT_FAVORITES_SAVE_FILE) then return end
        local success, result = pcall(function()
            local content = readfile(SCRIPT_FAVORITES_SAVE_FILE)
            local data = HttpService:JSONDecode(content)
            if type(data) == "table" then
                favoriteScripts = data
            end
        end)
        if not success then
            warn("Gagal memuat favorit script:", result)
        end
    end

    -- [[ PERUBAHAN BARU: Fungsi untuk mengelola sesi login dipindahkan ke lingkup luar ]]
    function saveSession(expirationTimestamp, userRole, userkey)
        if not writefile then return end
        local sessionData = {
            key = userkey
        }
        pcall(function()
            writefile(SESSION_SAVE_FILE, HttpService:JSONEncode(sessionData))
        end)
    end


    function deleteSession()
        if isfile and isfile(SESSION_SAVE_FILE) and delfile then
            pcall(delfile, SESSION_SAVE_FILE)
        end
    end

    -- Moved all these declarations to the higher scope to fix "out of local registers" error
    Players, UserInputService, RunService, Workspace, LocalPlayer, TweenService, Lighting, MaterialService, TeleportService = nil, nil, nil, nil, nil, nil, nil, nil, nil
    Settings, IsFlying, IsNoclipEnabled, IsGodModeEnabled, IsWalkSpeedEnabled, OriginalWalkSpeed, FlyConnections, godModeConnection, IsInfinityJumpEnabled, infinityJumpConnection, PlayerButtons, CurrentPlayerFilter, touchFlingGui, isUpdatingPlayerList, isMiniToggleDraggable, IsAntiLagEnabled, antiLagConnection, IsShiftLockEnabled, shiftLockConnection = nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil
    IsFEInvisibleEnabled, feInvisSeat, IsEspNameEnabled, IsEspBodyEnabled, EspRenderConnection, espCache, IsBoostFPSEnabled, boostFpsOriginalSettings, boostFpsDescendantConnection, IsAntiAFKEnabled, antiAFKConnection = nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil
    IsViewingPlayer, viewingPlayerConnection, currentlyViewedPlayer, SpectatorGui, originalPlayerCFrame, originalCameraSubject = nil, nil, nil, nil, nil, nil
    isSpectatingLocation, spectateLocationGui, originalCameraProperties, spectateCameraConnections, areTeleportIconsVisible, isAutoLooping = nil, nil, nil, nil, nil, nil
    isEmoteToggleDraggable, isAnimationToggleDraggable, isEmoteTransparent, isAnimationTransparent = nil, nil, nil, nil
    savedTeleportLocations, loadedGuiPositions, originalCharacterAppearance = nil, nil, nil
    antifling_velocity_threshold, antifling_angular_threshold, antifling_last_safe_cframe, antifling_enabled, antifling_connection = nil, nil, nil, nil, nil
    currentFlingTarget, flingLoopConnection, flingStartPosition, flingStatusGui = nil, nil, nil, nil
    isRecording, isPlaying, recordingConnection, playbackConnection, savedRecordings, currentRecordingData, loadedRecordingName, currentRecordingTarget = nil, nil, nil, nil, nil, nil, nil, nil
    isCopyingMovement, copiedPlayer, copyMovementConnection, copyAnimationCache, copyMovementMovers, copyMovementDelay, copyMovementBypassAnimation = nil, nil, nil, nil, nil, nil, nil
    isEmoteEnabled, EmoteScreenGui, isAnimationEnabled, AnimationScreenGui, lastAnimations = nil, nil, nil, nil, nil
    ScreenGui, MiniToggleContainer, MiniToggleButton, EmoteToggleButton, AnimationShowButton, MainFrame, TitleBar, ExpirationLabel, TabsFrame, ContentFrame = nil, nil, nil, nil, nil, nil, nil, nil, nil, nil
    PlayerTabContent, PlayerListContainer, GeneralTabContent, TeleportTabContent, VipTabContent, SettingsTabContent, RekamanTabContent, ServerTabContent = nil, nil, nil, nil, nil, nil, nil, nil
    PlayerListLayout, GeneralListLayout, TeleportListLayout, VipListLayout, SettingsListLayout, RekamanListLayout, ServerListLayout = nil, nil, nil, nil, nil, nil, nil
    setupPlayerTab, setupGeneralTab, setupTeleportTab, setupVipTab, setupSettingsTab, setupRekamanTab, setupServerTab = nil, nil, nil, nil, nil, nil, nil
    startRecording, stopRecording, stopActions, stopPlayback = nil, nil, nil, nil

    -- [[ TEMA UI BARU ]]

    -- Helper untuk mendaftarkan dan menerapkan tema secara instan


    -- [[ AKHIR TEMA UI BARU ]]

    -- [[ LOGIKA UNTUK TOGGLE BARU ]]
    IsOptimizedGameEnabled = false
    storedProperties = {}
    darkActive = false
    originalLighting = {}
    originalSky = nil
    originalEffects = {}
    partOriginals = setmetatable({}, {__mode = "k"}) -- weak keys
    modifiedParts = {}

    -- Optimizer hanya boleh menyentuh visual dunia game. Jangan proses UI/GUI, kamera,
    -- atau karakter player agar HUD lobby/game (contoh: Violence District) tidak ikut rusak/terbawa.
    function isProtectedOptimizationInstance(obj)
        if not obj then return true end
        local ok, protected = pcall(function()
            local currentWorkspace = Workspace or game:GetService("Workspace")
            local currentPlayers = Players or game:GetService("Players")
            local currentLocalPlayer = LocalPlayer or (currentPlayers and currentPlayers.LocalPlayer)

            if currentWorkspace and currentWorkspace.CurrentCamera then
                local camera = currentWorkspace.CurrentCamera
                if obj == camera or obj:IsDescendantOf(camera) then return true end
            end

            if currentLocalPlayer then
                local playerGui = currentLocalPlayer:FindFirstChildOfClass("PlayerGui")
                if playerGui and (obj == playerGui or obj:IsDescendantOf(playerGui)) then return true end
                if currentLocalPlayer.Character and (obj == currentLocalPlayer.Character or obj:IsDescendantOf(currentLocalPlayer.Character)) then return true end
            end

            if CoreGui and (obj == CoreGui or obj:IsDescendantOf(CoreGui)) then return true end

            if currentPlayers then
                for _, plr in ipairs(currentPlayers:GetPlayers()) do
                    local char = plr.Character
                    if char and (obj == char or obj:IsDescendantOf(char)) then
                        return true
                    end
                end
            end

            return false
        end)
        return ok and protected == true
    end

    function scanAndDisableHeavyObjects()
        storedProperties = {}
        for i, obj in ipairs(Workspace:GetDescendants()) do
            arexansYieldEvery(i)
            if not isProtectedOptimizationInstance(obj) then
                pcall(function()
                    if obj:IsA("ParticleEmitter") or obj:IsA("Trail") or obj:IsA("Beam") or obj:IsA("Smoke")
                    or obj:IsA("Fire") or obj:IsA("Explosion") or obj:IsA("Sparkles") then
                        storedProperties[obj] = {Enabled = obj.Enabled}
                        obj.Enabled = false
                    elseif obj:IsA("BasePart") and (obj.Name:lower():find("tree") or obj.Name:lower():find("grass")
                        or obj.Name:lower():find("bush") or obj.Name:lower():find("aura") or obj.Name:lower():find("leaf")
                        or obj.Name:lower():find("cloud") or obj.Name:lower():find("fog") or obj.Name:lower():find("effect")) then
                        storedProperties[obj] = {Transparency = obj.Transparency}
                        obj.Transparency = 1
                        if obj:FindFirstChildOfClass("Decal") then
                            for _, d in ipairs(obj:GetDescendants()) do
                                if not isProtectedOptimizationInstance(d) and (d:IsA("Decal") or d:IsA("Texture")) then
                                    storedProperties[d] = {Transparency = d.Transparency}
                                    d.Transparency = 1
                                end
                            end
                        end
                    end
                end)
            end
        end
        for _, eff in ipairs(Lighting:GetChildren()) do
            pcall(function()
                if eff:IsA("Atmosphere") or eff:IsA("BloomEffect") or eff:IsA("ColorCorrectionEffect")
                or eff:IsA("SunRaysEffect") or eff:IsA("DepthOfFieldEffect") or eff:IsA("Sky") then
                    storedProperties[eff] = {Parent = eff.Parent}
                    eff.Parent = nil
                end
            end)
        end
        storedProperties["LightingProps"] = {
            GlobalShadows = Lighting.GlobalShadows, Brightness = Lighting.Brightness, FogEnd = Lighting.FogEnd,
            EnvironmentDiffuseScale = Lighting.EnvironmentDiffuseScale, EnvironmentSpecularScale = Lighting.EnvironmentSpecularScale
        }
        pcall(function()
            Lighting.GlobalShadows = false; Lighting.Brightness = 1; Lighting.FogEnd = 1e6;
            Lighting.EnvironmentDiffuseScale = 0; Lighting.EnvironmentSpecularScale = 0
        end)
        if Workspace:FindFirstChildOfClass("Terrain") then
            local terrain = Workspace:FindFirstChildOfClass("Terrain")
            local tProps = {}
            pcall(function() tProps.Decoration = terrain.Decoration end)
            pcall(function() tProps.WaterReflectance = terrain.WaterReflectance end)
            pcall(function() tProps.WaterTransparency = terrain.WaterTransparency end)
            pcall(function() tProps.WaterWaveSize = terrain.WaterWaveSize end)
            pcall(function() tProps.WaterWaveSpeed = terrain.WaterWaveSpeed end)
            storedProperties["Terrain"] = tProps
            
            pcall(function() terrain.Decoration = false end)
            pcall(function() terrain.WaterReflectance = 0 end)
            pcall(function() terrain.WaterTransparency = 1 end)
            pcall(function() terrain.WaterWaveSize = 0 end)
            pcall(function() terrain.WaterWaveSpeed = 0 end)
        end
    end

    function restoreHeavyObjects()
        for obj, props in pairs(storedProperties) do
            pcall(function()
                if typeof(obj) == "Instance" then
                    for k, v in pairs(props) do
                        obj[k] = v
                    end
                elseif obj == "LightingProps" then
                    Lighting.GlobalShadows = props.GlobalShadows; Lighting.Brightness = props.Brightness; Lighting.FogEnd = props.FogEnd;
                    Lighting.EnvironmentDiffuseScale = props.EnvironmentDiffuseScale; Lighting.EnvironmentSpecularScale = props.EnvironmentSpecularScale
                elseif obj == "Terrain" and Workspace:FindFirstChildOfClass("Terrain") then
                    local terrain = Workspace:FindFirstChildOfClass("Terrain")
                    if props.Decoration ~= nil then pcall(function() terrain.Decoration = props.Decoration end) end
                    if props.WaterReflectance ~= nil then pcall(function() terrain.WaterReflectance = props.WaterReflectance end) end
                    if props.WaterTransparency ~= nil then pcall(function() terrain.WaterTransparency = props.WaterTransparency end) end
                    if props.WaterWaveSize ~= nil then pcall(function() terrain.WaterWaveSize = props.WaterWaveSize end) end
                    if props.WaterWaveSpeed ~= nil then pcall(function() terrain.WaterWaveSpeed = props.WaterWaveSpeed end) end
                end
            end)
        end
        storedProperties = {}
    end

    darkDescendantConnection = nil
    -- Warna lama 170 terlalu terang dan membuat interior bangunan seperti putih semua.
    -- Nilai baru dibuat lebih rendah + tetap menyimpan variasi grayscale dari warna asli objek
    -- supaya bentuk pintu/dinding/lantai masih bisa dibedakan saat Dark Texture aktif.
    DARK_TEXTURE_GRAY = Color3.fromRGB(105, 105, 105)
    DARK_TEXTURE_MIN_GRAY = 72
    DARK_TEXTURE_MAX_GRAY = 138
    DARK_TEXTURE_LIGHTING_GRAY = Color3.fromRGB(118, 118, 118)
    DARK_TEXTURE_FOG_GRAY = Color3.fromRGB(95, 95, 95)
    DARK_TEXTURE_COLOR_CORRECTION_NAME = "ArexansDarkTextureVisibilityFix"
    darkVisibilityEffect = nil
    darkVisibilityEffectCreated = false
    terrainOriginals = nil

    function getServiceSafe(serviceName)
        local ok, service = pcall(function()
            return game:GetService(serviceName)
        end)
        if ok then return service end
        return nil
    end

    function getCurrentWorkspace()
        return Workspace or getServiceSafe("Workspace")
    end

    function getCurrentLighting()
        return Lighting or getServiceSafe("Lighting")
    end

    function getCurrentLocalPlayer()
        local playersService = Players or getServiceSafe("Players")
        if LocalPlayer then return LocalPlayer end
        if playersService then return playersService.LocalPlayer end
        return nil
    end

    function getCurrentPlayersService()
        return Players or getServiceSafe("Players")
    end

    function isPlayerCharacterInstance(inst)
        if not inst then return false end
        local playersService = getCurrentPlayersService()
        if not playersService then return false end

        -- Lewati SEMUA avatar player, bukan hanya LocalPlayer.
        for _, plr in ipairs(playersService:GetPlayers()) do
            local char = plr.Character
            if char then
                local ok, result = pcall(function()
                    return inst == char or inst:IsDescendantOf(char)
                end)
                if ok and result == true then
                    return true
                end
            end
        end

        -- Fallback untuk karakter yang baru spawn dan belum sempat masuk loop Character di atas.
        local current = inst
        while current do
            if current:IsA("Model") then
                local okOwner, owner = pcall(function()
                    return playersService:GetPlayerFromCharacter(current)
                end)
                if okOwner and owner then
                    return true
                end

                -- Cadangan tambahan: model humanoid bernama sama dengan player biasanya adalah avatar yang baru diparent ke Workspace.
                local okHumanoid, humanoid = pcall(function()
                    return current:FindFirstChildOfClass("Humanoid")
                end)
                if okHumanoid and humanoid then
                    for _, plr in ipairs(playersService:GetPlayers()) do
                        if current.Name == plr.Name then
                            return true
                        end
                    end
                end
            end
            current = current.Parent
        end

        return false
    end

    -- Nama lama dipertahankan sebagai alias agar pemanggilan lain tetap aman.
    function isLocalCharacterInstance(inst)
        return isPlayerCharacterInstance(inst)
    end

    function tryReadProperty(inst, prop)
        local ok, value = pcall(function() return inst[prop] end)
        if ok then return true, value end
        return false, nil
    end

    function tryWriteProperty(inst, prop, value)
        pcall(function() inst[prop] = value end)
    end

    function saveProperty(data, inst, prop)
        local ok, value = tryReadProperty(inst, prop)
        if ok then data[prop] = value end
    end

    function getReadableDarkGray(sourceColor)
        if typeof(sourceColor) ~= "Color3" then
            return DARK_TEXTURE_GRAY
        end

        local luminance = (sourceColor.R * 0.2126) + (sourceColor.G * 0.7152) + (sourceColor.B * 0.0722)
        local grayByte = math.floor(math.clamp(DARK_TEXTURE_MIN_GRAY + (luminance * (DARK_TEXTURE_MAX_GRAY - DARK_TEXTURE_MIN_GRAY)), DARK_TEXTURE_MIN_GRAY, DARK_TEXTURE_MAX_GRAY) + 0.5)
        return Color3.fromRGB(grayByte, grayByte, grayByte)
    end

    function getInstanceDarkColor(inst)
        local saved = partOriginals[inst]
        if saved and typeof(saved.Color) == "Color3" then
            return getReadableDarkGray(saved.Color)
        end

        local ok, currentColor = tryReadProperty(inst, "Color")
        if ok and typeof(currentColor) == "Color3" then
            return getReadableDarkGray(currentColor)
        end

        return DARK_TEXTURE_GRAY
    end

    function applyDarkLightingVisibility(currentLighting)
        if not currentLighting then return end

        pcall(function() currentLighting.Ambient = DARK_TEXTURE_LIGHTING_GRAY end)
        pcall(function() currentLighting.OutdoorAmbient = DARK_TEXTURE_LIGHTING_GRAY end)
        pcall(function() currentLighting.Brightness = 0.45 end)
        pcall(function() currentLighting.GlobalShadows = false end)
        pcall(function() currentLighting.FogColor = DARK_TEXTURE_FOG_GRAY end)
        pcall(function() currentLighting.FogEnd = 1e6 end)
        pcall(function() currentLighting.FogStart = 0 end)
        pcall(function() currentLighting.EnvironmentDiffuseScale = 0.25 end)
        pcall(function() currentLighting.EnvironmentSpecularScale = 0 end)
        pcall(function() currentLighting.ExposureCompensation = -0.55 end)

        local cc = nil
        pcall(function() cc = currentLighting:FindFirstChild(DARK_TEXTURE_COLOR_CORRECTION_NAME) end)
        if not cc then
            local okCreate, created = pcall(function()
                local effect = Instance.new("ColorCorrectionEffect")
                effect.Name = DARK_TEXTURE_COLOR_CORRECTION_NAME
                effect.Parent = currentLighting
                return effect
            end)
            if okCreate then
                cc = created
                darkVisibilityEffectCreated = true
            end
        elseif cc ~= darkVisibilityEffect then
            -- Kalau game sudah punya effect dengan nama yang sama sebelum toggle, jangan hancurkan saat restore.
            darkVisibilityEffectCreated = false
        end

        if cc then
            darkVisibilityEffect = cc
            tryWriteProperty(cc, "Enabled", true)
            tryWriteProperty(cc, "Saturation", -1)
            tryWriteProperty(cc, "Brightness", -0.06)
            tryWriteProperty(cc, "Contrast", 0.18)
            tryWriteProperty(cc, "TintColor", Color3.fromRGB(225, 225, 225))
        end
    end

    function saveInstanceOriginal(inst)
        if not inst or partOriginals[inst] then return end
        if isPlayerCharacterInstance(inst) then return end

        local ok, data = pcall(function()
            local d = {}

            if inst:IsA("BasePart") then
                saveProperty(d, inst, "Color")
                saveProperty(d, inst, "Material")
                saveProperty(d, inst, "MaterialVariant")
                saveProperty(d, inst, "Transparency")
                saveProperty(d, inst, "Reflectance")
                saveProperty(d, inst, "CastShadow")
                saveProperty(d, inst, "LocalTransparencyModifier")
            end

            if inst:IsA("MeshPart") then
                saveProperty(d, inst, "TextureID")
            end

            if inst:IsA("Decal") or inst:IsA("Texture") then
                saveProperty(d, inst, "Texture")
                saveProperty(d, inst, "Color3")
                saveProperty(d, inst, "Transparency")
            end

            if inst:IsA("SpecialMesh") then
                saveProperty(d, inst, "TextureId")
                saveProperty(d, inst, "VertexColor")
            end

            if inst:IsA("SurfaceAppearance") then
                saveProperty(d, inst, "ColorMap")
                saveProperty(d, inst, "MetalnessMap")
                saveProperty(d, inst, "NormalMap")
                saveProperty(d, inst, "RoughnessMap")
            end

            if inst:IsA("Shirt") then
                saveProperty(d, inst, "ShirtTemplate")
            elseif inst:IsA("Pants") then
                saveProperty(d, inst, "PantsTemplate")
            elseif inst:IsA("ShirtGraphic") then
                saveProperty(d, inst, "Graphic")
            end

            if inst:IsA("ParticleEmitter") or inst:IsA("Trail") or inst:IsA("Beam") then
                saveProperty(d, inst, "Enabled")
                saveProperty(d, inst, "Texture")
            elseif inst:IsA("Smoke") or inst:IsA("Fire") or inst:IsA("Sparkles") then
                saveProperty(d, inst, "Enabled")
            end

            return d
        end)

        if ok then partOriginals[inst] = data end
    end

    function isDarkTextureTarget(inst)
        return inst and (
            inst:IsA("BasePart")
            or inst:IsA("Decal")
            or inst:IsA("Texture")
            or inst:IsA("SpecialMesh")
            or inst:IsA("SurfaceAppearance")
            or inst:IsA("Shirt")
            or inst:IsA("Pants")
            or inst:IsA("ShirtGraphic")
            or inst:IsA("ParticleEmitter")
            or inst:IsA("Trail")
            or inst:IsA("Beam")
            or inst:IsA("Smoke")
            or inst:IsA("Fire")
            or inst:IsA("Sparkles")
        )
    end

    function applyTotallyGray(inst)
        if not isDarkTextureTarget(inst) then return end
        -- Jangan ubah karakter lokal/avatar sendiri. Ini mencakup body part, face decal, shirt, pants, accessories, mesh, dan effect di dalam karakter.
        if isPlayerCharacterInstance(inst) then return end

        pcall(function()
            saveInstanceOriginal(inst)

            if inst:IsA("BasePart") then
                local readableGray = getInstanceDarkColor(inst)
                tryWriteProperty(inst, "Color", readableGray)
                tryWriteProperty(inst, "Material", Enum.Material.SmoothPlastic)
                tryWriteProperty(inst, "MaterialVariant", "")
                tryWriteProperty(inst, "Transparency", 0)
                tryWriteProperty(inst, "Reflectance", 0)
                tryWriteProperty(inst, "CastShadow", false)
                tryWriteProperty(inst, "LocalTransparencyModifier", 0)
            end

            if inst:IsA("MeshPart") then
                tryWriteProperty(inst, "TextureID", "")
            end

            -- Hilangkan texture/decal sepenuhnya supaya map lebih ringan. Warna abu-abu berasal dari part-nya, bukan dari decal/texture.
            if inst:IsA("Decal") or inst:IsA("Texture") then
                tryWriteProperty(inst, "Texture", "")
                tryWriteProperty(inst, "Color3", DARK_TEXTURE_GRAY)
                tryWriteProperty(inst, "Transparency", 1)
            end

            if inst:IsA("SpecialMesh") then
                tryWriteProperty(inst, "TextureId", "")
                tryWriteProperty(inst, "VertexColor", Vector3.new(DARK_TEXTURE_GRAY.R, DARK_TEXTURE_GRAY.G, DARK_TEXTURE_GRAY.B))
            end

            if inst:IsA("SurfaceAppearance") then
                tryWriteProperty(inst, "ColorMap", "")
                tryWriteProperty(inst, "MetalnessMap", "")
                tryWriteProperty(inst, "NormalMap", "")
                tryWriteProperty(inst, "RoughnessMap", "")
            end

            if inst:IsA("Shirt") then
                tryWriteProperty(inst, "ShirtTemplate", "")
            elseif inst:IsA("Pants") then
                tryWriteProperty(inst, "PantsTemplate", "")
            elseif inst:IsA("ShirtGraphic") then
                tryWriteProperty(inst, "Graphic", "")
            end

            if inst:IsA("ParticleEmitter") or inst:IsA("Trail") or inst:IsA("Beam") then
                tryWriteProperty(inst, "Texture", "")
                tryWriteProperty(inst, "Enabled", false)
            elseif inst:IsA("Smoke") or inst:IsA("Fire") or inst:IsA("Sparkles") then
                tryWriteProperty(inst, "Enabled", false)
            end

            modifiedParts[inst] = true
        end)
    end

    function saveTerrainOriginal(terrain)
        if terrainOriginals or not terrain then return end

        local data = { MaterialColors = {} }
        saveProperty(data, terrain, "WaterColor")
        saveProperty(data, terrain, "WaterTransparency")
        saveProperty(data, terrain, "WaterReflectance")
        saveProperty(data, terrain, "WaterWaveSize")
        saveProperty(data, terrain, "WaterWaveSpeed")
        saveProperty(data, terrain, "Decoration")

        pcall(function()
            for _, material in ipairs(Enum.Material:GetEnumItems()) do
                local ok, color = pcall(function()
                    return terrain:GetMaterialColor(material)
                end)
                if ok then
                    data.MaterialColors[material] = color
                end
            end
        end)

        terrainOriginals = data
    end

    function applyDarkTerrain()
        local ws = getCurrentWorkspace()
        local terrain = ws and ws:FindFirstChildOfClass("Terrain")
        if not terrain then return end

        saveTerrainOriginal(terrain)

        -- Terrain tidak punya TextureID seperti Part/MeshPart, jadi cara paling ringan adalah
        -- mematikan dekorasi rumput dan menyamakan semua warna material terrain ke abu-abu.
        pcall(function() terrain.Decoration = false end)
        pcall(function()
            if type(sethiddenproperty) == "function" then
                sethiddenproperty(terrain, "Decoration", false)
            end
        end)
        pcall(function() terrain.WaterColor = DARK_TEXTURE_GRAY end)
        pcall(function() terrain.WaterTransparency = 1 end)
        pcall(function() terrain.WaterReflectance = 0 end)
        pcall(function() terrain.WaterWaveSize = 0 end)
        pcall(function() terrain.WaterWaveSpeed = 0 end)

        pcall(function()
            for _, material in ipairs(Enum.Material:GetEnumItems()) do
                pcall(function()
                    terrain:SetMaterialColor(material, DARK_TEXTURE_GRAY)
                end)
            end
        end)
    end

    function restoreDarkTerrain()
        local ws = getCurrentWorkspace()
        local terrain = ws and ws:FindFirstChildOfClass("Terrain")
        if not terrain or not terrainOriginals then
            terrainOriginals = nil
            return
        end

        for prop, value in pairs(terrainOriginals) do
            if prop ~= "MaterialColors" then
                tryWriteProperty(terrain, prop, value)
            end
        end

        if terrainOriginals.MaterialColors then
            for material, color in pairs(terrainOriginals.MaterialColors) do
                pcall(function()
                    terrain:SetMaterialColor(material, color)
                end)
            end
        end

        terrainOriginals = nil
    end

    function restoreInstance(inst)
        if not inst then return end
        local data = partOriginals[inst]
        if not data then return end

        pcall(function()
            for prop, value in pairs(data) do
                tryWriteProperty(inst, prop, value)
            end
        end)

        partOriginals[inst] = nil
        modifiedParts[inst] = nil
    end

    function applyDarkTotal()
        -- Kalau state dimuat dari file, darkActive bisa sudah true sebelum efek benar-benar diterapkan.
        -- Karena itu jangan return kecuali memang sudah ada instance yang dimodifikasi atau terrain sudah tersimpan.
        if darkActive and (next(modifiedParts) ~= nil or terrainOriginals ~= nil) then return end
        darkActive = true
        originalLighting = {}
        originalEffects = {}

        local currentLighting = getCurrentLighting()
        local currentWorkspace = getCurrentWorkspace()

        pcall(function()
            if not currentLighting then return end

            originalLighting.Ambient = currentLighting.Ambient
            originalLighting.OutdoorAmbient = currentLighting.OutdoorAmbient
            originalLighting.Brightness = currentLighting.Brightness
            originalLighting.GlobalShadows = currentLighting.GlobalShadows
            originalLighting.FogColor = currentLighting.FogColor
            originalLighting.FogEnd = currentLighting.FogEnd
            originalLighting.FogStart = currentLighting.FogStart
            originalLighting.EnvironmentDiffuseScale = currentLighting.EnvironmentDiffuseScale
            originalLighting.EnvironmentSpecularScale = currentLighting.EnvironmentSpecularScale
            local okExposure, exposureValue = tryReadProperty(currentLighting, "ExposureCompensation")
            if okExposure then originalLighting.ExposureCompensation = exposureValue end

            for _, eff in ipairs(currentLighting:GetChildren()) do
                if eff:IsA("Atmosphere") or eff:IsA("Sky") or eff:IsA("ColorCorrectionEffect") or eff:IsA("BloomEffect") or eff:IsA("SunRaysEffect") or eff:IsA("DepthOfFieldEffect") or eff:IsA("BlurEffect") then
                    originalEffects[eff] = eff:Clone()
                end
            end

            originalSky = currentLighting:FindFirstChildOfClass("Sky")
            applyDarkLightingVisibility(currentLighting)

            for _, eff in ipairs(currentLighting:GetChildren()) do
                if eff:IsA("ColorCorrectionEffect") then
                    tryWriteProperty(eff, "Saturation", -1)
                    tryWriteProperty(eff, "TintColor", Color3.fromRGB(225, 225, 225))
                    tryWriteProperty(eff, "Brightness", -0.04)
                    tryWriteProperty(eff, "Contrast", 0.12)
                elseif eff:IsA("BloomEffect") then
                    tryWriteProperty(eff, "Intensity", 0)
                elseif eff:IsA("SunRaysEffect") then
                    tryWriteProperty(eff, "Intensity", 0)
                elseif eff:IsA("DepthOfFieldEffect") then
                    tryWriteProperty(eff, "InFocusRadius", 10000)
                elseif eff:IsA("BlurEffect") then
                    tryWriteProperty(eff, "Size", 0)
                elseif eff:IsA("Atmosphere") then
                    tryWriteProperty(eff, "Density", 0)
                    tryWriteProperty(eff, "Color", DARK_TEXTURE_GRAY)
                    tryWriteProperty(eff, "Decay", DARK_TEXTURE_GRAY)
                elseif eff:IsA("Sky") then
                    for _, prop in ipairs({"SkyboxBk", "SkyboxDn", "SkyboxFt", "SkyboxLf", "SkyboxRt", "SkyboxUp", "MoonTextureId", "SunTextureId"}) do
                        tryWriteProperty(eff, prop, "")
                    end
                end
            end

            -- Pastikan correction bawaan Dark Texture tetap menjadi nilai final setelah effect game lain disesuaikan.
            applyDarkLightingVisibility(currentLighting)
        end)

        applyDarkTerrain()

        if currentWorkspace then
            for i, obj in ipairs(currentWorkspace:GetDescendants()) do
                arexansYieldEvery(i)
                applyTotallyGray(obj)
            end
        end

        -- Avatar semua player sengaja tidak diproses agar skin/outfit tetap normal.

        if darkDescendantConnection then
            pcall(function() darkDescendantConnection:Disconnect() end)
            darkDescendantConnection = nil
        end

        if currentWorkspace then
            darkDescendantConnection = currentWorkspace.DescendantAdded:Connect(function(inst)
                if not darkActive then return end
                task.defer(function()
                    if darkActive and inst and inst.Parent then
                        if not isPlayerCharacterInstance(inst) then
                            applyTotallyGray(inst)
                            if inst:IsA("Accessory") then
                                local handle = inst:FindFirstChild("Handle")
                                if handle then applyTotallyGray(handle) end
                            end
                            for i, child in ipairs(inst:GetDescendants()) do
                                arexansYieldEvery(i)
                                applyTotallyGray(child)
                            end
                        end
                    end
                end)
            end)
        end
    end

    function restoreDarkTotal()
        if not darkActive and next(modifiedParts) == nil and terrainOriginals == nil then return end
        darkActive = false

        if darkDescendantConnection then
            pcall(function() darkDescendantConnection:Disconnect() end)
            darkDescendantConnection = nil
        end

        local toRestore = {}
        for inst, _ in pairs(modifiedParts) do
            table.insert(toRestore, inst)
        end

        for _, inst in ipairs(toRestore) do
            pcall(function()
                restoreInstance(inst)
            end)
        end

        pcall(function()
            local currentLighting = getCurrentLighting()
            if currentLighting then
                if originalLighting.Ambient ~= nil then currentLighting.Ambient = originalLighting.Ambient end
                if originalLighting.OutdoorAmbient ~= nil then currentLighting.OutdoorAmbient = originalLighting.OutdoorAmbient end
                if originalLighting.Brightness ~= nil then currentLighting.Brightness = originalLighting.Brightness end
                if originalLighting.GlobalShadows ~= nil then currentLighting.GlobalShadows = originalLighting.GlobalShadows end
                if originalLighting.FogColor ~= nil then currentLighting.FogColor = originalLighting.FogColor end
                if originalLighting.FogEnd ~= nil then currentLighting.FogEnd = originalLighting.FogEnd end
                if originalLighting.FogStart ~= nil then currentLighting.FogStart = originalLighting.FogStart end
                if originalLighting.EnvironmentDiffuseScale ~= nil then currentLighting.EnvironmentDiffuseScale = originalLighting.EnvironmentDiffuseScale end
                if originalLighting.EnvironmentSpecularScale ~= nil then currentLighting.EnvironmentSpecularScale = originalLighting.EnvironmentSpecularScale end
                if originalLighting.ExposureCompensation ~= nil then pcall(function() currentLighting.ExposureCompensation = originalLighting.ExposureCompensation end) end

                if darkVisibilityEffectCreated and darkVisibilityEffect then
                    pcall(function() darkVisibilityEffect:Destroy() end)
                end
                darkVisibilityEffect = nil
                darkVisibilityEffectCreated = false

                for origEff, cloneEff in pairs(originalEffects) do
                    if origEff and origEff.Parent and cloneEff then
                        for _, prop in ipairs({
                            -- Umum / ColorCorrection
                            "Enabled", "Brightness", "Contrast", "Saturation", "TintColor",
                            -- Bloom / SunRays / Blur / DepthOfField
                            "Intensity", "Size", "Threshold", "Spread", "FarIntensity", "FocusDistance", "InFocusRadius", "NearIntensity",
                            -- Atmosphere
                            "Density", "Offset", "Color", "Decay", "Glare", "Haze",
                            -- Sky
                            "CelestialBodiesShown", "SkyboxBk", "SkyboxDn", "SkyboxFt", "SkyboxLf", "SkyboxRt", "SkyboxUp", "MoonTextureId", "SunTextureId", "StarCount", "SunAngularSize", "MoonAngularSize"
                        }) do
                            pcall(function()
                                origEff[prop] = cloneEff[prop]
                            end)
                        end
                    end
                    pcall(function() cloneEff:Destroy() end)
                end
            end
        end)

        restoreDarkTerrain()

        originalEffects = {}
        originalLighting = {}
        partOriginals = setmetatable({}, {__mode = "k"})
        modifiedParts = {}
    end
    -- [[ AKHIR LOGIKA UNTUK TOGGLE BARU ]]

    function InitializeMainGUI(expirationTimestamp, userRole)

        currentUserRole = userRole or "Free"
        if tostring(currentUserRole or ""):upper() == "LIFETIME" then currentUserRole = "Lifetime" end
        if currentUserRole == "DEVELOPER" then currentUserRole = "Developer" end
        -- Layanan dan Variabel Global
        Players = game:GetService("Players")
        UserInputService = game:GetService("UserInputService")
        RunService = game:GetService("RunService")
        Workspace = game:GetService("Workspace")
        LocalPlayer = Players.LocalPlayer
        TweenService = game:GetService("TweenService")
        Lighting = game:GetService("Lighting")
        MaterialService = game:GetService("MaterialService")
        TeleportService = game:GetService("TeleportService")
    
        -- Pengaturan Default
        Settings = {
            Brightness = game:GetService("Lighting").Brightness,
            FlySpeed = 1,
            WalkSpeed = 16,
            MaxFlySpeed = 10,
            MaxWalkSpeed = 500,
            TeleportDistance = 100,
            FEInvisibleTransparency = 0.75,
            SpectateCameraSensitivity = 0.004,
            SpectateCameraSpeed = 50,
        }
    
        -- Variabel Status
        IsFlying = false
        IsNoclipEnabled = false
        IsGodModeEnabled = false 
        IsWalkSpeedEnabled = false
        OriginalWalkSpeed = LocalPlayer.Character and LocalPlayer.Character:FindFirstChildOfClass("Humanoid") and LocalPlayer.Character:FindFirstChildOfClass("Humanoid").WalkSpeed or 16
        showCopyMovementIcon = true
        showFlingIcon = true
        showTeleportIcon = true
        copyMovementDelay = 0.1
        copyMovementBypassAnimation = false
        flingInvisible = false
        FlyConnections = {}
        godModeConnection = nil 
        IsInfinityJumpEnabled = false
        infinityJumpConnection = nil
        PlayerButtons = {} -- Cache untuk elemen UI pemain
        CurrentPlayerFilter = ""
        touchFlingGui = nil
        isUpdatingPlayerList = false 
        isMiniToggleDraggable = true -- default OFF untuk toggle "Kunci Bar Tombol"
        IsAntiLagEnabled = false 
        antiLagConnection = nil 
        IsShiftLockEnabled = false
        shiftLockConnection = nil
        IsAntiAFKEnabled = false
        antiAFKConnection = nil

        IsAntiTeleportEnabled = false
        antiTeleportConnection = nil

        -- [[ KEYBIND SYSTEM ]]
        Keybinds = {
            Fly = nil,
            Invisible = nil,
        WalkSpeed = nil,
        Record = nil,
        StopRecord = nil
        }
    
        -- [[ FE INVISIBLE INTEGRATION ]]
        IsFEInvisibleEnabled = false
        feInvisSeat = nil
        -- [[ END FE INVISIBLE INTEGRATION ]]

        -- ESP-related variables
        teamColor = Color3.fromRGB(100, 255, 100)
        enemyColor = Color3.fromRGB(0, 150, 255)
        IsEspNameEnabled = false
        IsEspBodyEnabled = false
        IsEspLineEnabled = false
        IsEspHealthBarEnabled = false
        EspRenderConnection = nil
        espCache = {}
    
        -- [[ INTEGRASI BOOST FPS ]] --
        IsBoostFPSEnabled = false
        boostFpsOriginalSettings = {}
        boostFpsDescendantConnection = nil
    
        -- [[ VARIABEL VIEW PLAYER ]] --
        IsViewingPlayer = false
        viewingPlayerConnection = nil
        currentlyViewedPlayer = nil
        SpectatorGui = nil
        originalPlayerCFrame = nil -- Untuk menyimpan CFrame asli pemain
        originalCameraSubject = nil -- Untuk menyimpan subjek kamera asli
    
        -- [[ PERUBAHAN BARU: Variabel untuk Spectate Lokasi ]]
        isSpectatingLocation = false
        spectateLocationGui = nil
        originalCameraProperties = {}
        spectateCameraConnections = {}
        areTeleportIconsVisible = true
        isAutoLooping = false
    
        isEmoteToggleDraggable = true
        isAnimationToggleDraggable = true

        isEmoteTransparent = false
        isMusicPlayerEnabled = false
        isAnimationTransparent = false


        -- Variabel Teleport
        savedTeleportLocations = {}
    
        -- Variabel untuk menyimpan posisi GUI
        loadedGuiPositions = nil
    
        -- Variabel untuk menyimpan status fitur
    
        -- Variabel untuk menyimpan data original karakter saat invisible
        originalCharacterAppearance = {}

        -- Variabel AntiFling
        antifling_velocity_threshold = 85
        antifling_angular_threshold = 25
        antifling_last_safe_cframe = nil
        antifling_enabled = false
        antifling_connection = nil
    
        -- [[ VARIABEL UNTUK FITUR FLING ]] --
        currentFlingTarget = nil
        flingLoopConnection = nil
        flingStartPosition = nil 
        flingStatusGui = nil 

        -- [[ VARIABEL UNTUK FITUR REKAMAN ]] --
        isRecording = false
        isPlaying = false
        recordingConnection = nil
        playbackConnection = nil
        savedRecordings = {}
        currentRecordingData = {}
        loadedRecordingName = nil
        currentRecordingTarget = nil -- [[ PERUBAHAN BARU ]]
        isLocationPlaybackEnabled = false
        lastManuallyStoppedRecording = nil
        locationPlaybackCooldown = 5 -- seconds

        -- Runtime state Rekaman. Dibuat di sini agar fitur baru tidak mengubah UI/icon lama.
        selectedRecordings = selectedRecordings or {}
        isVisualLineEnabled = isVisualLineEnabled or false
        isOriginalAnimRecordEnabled = isOriginalAnimRecordEnabled or false
        recordingAnimateSnapshot = nil
        playbackRestoreAnimateSnapshot = nil
        playbackAppliedRecordedAnimate = false
        autoPerfectVisualToggleSetState = nil

        -- [[ VARIABEL UNTUK FITUR COPY MOVEMENT ]] --
        isCopyingMovement = false
        copiedPlayer = nil
        copyMovementConnection = nil
        copyAnimationCache = {}
        copyMovementMovers = {}
        copyMovementBuffer = {}

        -- [[ VARIABEL UNTUK FITUR KUNCI KECEPATAN ]] --
        speedLock_currentSpeed = 16
        speedLock_humanoid = nil
        speedLock_isEnforced = false
        speedLock_isPaused = false
        speedLock_connections = {}
        speedLock_lastTick = 0
        speedLock_tickInterval = 0.12
        speedLock_serverBaseline = nil
    
        -- ====================================================================
        -- == VARIABEL UNTUK FITUR EMOTE DAN ANIMASI (DIPISAHKAN)          ==
        -- ====================================================================
        isEmoteEnabled = false
        EmoteScreenGui = nil
        isAnimationEnabled = false 
        AnimationScreenGui = nil
        isGameAnimationOverrideActive = false -- [BARU] Lacak jika game menimpa animasi
    
        -- Variabel Global untuk menyimpan animasi
        lastAnimations = {}

    -- Lifetime memakai jalur theme Developer secara internal agar animasi gradient,
    -- aksen, border, dan tab benar-benar identik. Nama role yang ditampilkan tetap Lifetime.
    local themeRuntimeRole = (tostring(currentUserRole or ""):upper() == "LIFETIME") and "Developer" or currentUserRole
    roleTheme = UI.configureArexansRoleTheme and UI.configureArexansRoleTheme({
        currentUserRole = themeRuntimeRole,
        getCurrentUserRole = function()
            return (tostring(currentUserRole or ""):upper() == "LIFETIME") and "Developer" or currentUserRole
        end,
        featureStatesSaveFile = FEATURE_STATES_SAVE_FILE,
        httpService = HttpService,
        coreGui = CoreGui,
        tweenService = TweenService,
        getScreenGui = function() return ScreenGui end
    }) or {}

    isGradientRole = roleTheme.isGradientRole or function() return false end
    getRoleDefaultThemeColor = roleTheme.getRoleDefaultThemeColor or function()
        local role = tostring(currentUserRole or ""):upper()
        if role == "VIP" then return Color3.fromRGB(170, 0, 255) end
        if role == "NORMAL" then return Color3.fromRGB(0, 255, 0) end
        if role == "LIFETIME" then return Color3.fromRGB(0, 170, 255) end
        if role == "DEVELOPER" then return Color3.fromRGB(0, 170, 255) end
        if role == "FREE" then return Color3.fromRGB(128, 128, 128) end
        return Color3.fromRGB(128, 128, 128)
    end
    local rawApplyDeveloperGradient = roleTheme.applyDeveloperGradient or function() end
    local rawRefreshRoleGradientUI = roleTheme.refreshRoleGradientUI or function() end

    -- Low-lag Developer theme runtime.
    -- Efek gradient Developer diproses bertahap, bukan sekaligus di frame pertama.
    local developerGradientQueue = {}
    local developerGradientQueued = setmetatable({}, {__mode = "k"})
    local developerGradientHead = 1
    local developerGradientProcessing = false
    local developerRefreshQueued = false
    local developerRefreshRoot = nil
    local developerRefreshLastAt = 0
    local developerGradientBudgetPerFrame = 10
    local developerRefreshCooldown = 0.16

    local function isDeveloperGradientTarget(instance)
        if not instance then return false end
        local okNo, noGradient = pcall(function() return instance:GetAttribute("ArexansNoDeveloperGradient") end)
        if okNo and noGradient == true then return false end
        if instance:IsA("UIStroke") or instance:IsA("TextLabel") or instance:IsA("TextButton") or instance:IsA("Frame") or instance:IsA("ImageLabel") or instance:IsA("ImageButton") then
            return true
        end
        return false
    end

    local function processDeveloperGradientQueue()
        if developerGradientProcessing then return end
        developerGradientProcessing = true
        task.spawn(function()
            while developerGradientHead <= #developerGradientQueue do
                local processed = 0
                while processed < developerGradientBudgetPerFrame and developerGradientHead <= #developerGradientQueue do
                    local instance = developerGradientQueue[developerGradientHead]
                    developerGradientQueue[developerGradientHead] = nil
                    developerGradientHead = developerGradientHead + 1
                    developerGradientQueued[instance] = nil
                    if instance and instance.Parent and isDeveloperGradientTarget(instance) then
                        local hasGradient = false
                        pcall(function() hasGradient = instance:FindFirstChild("DeveloperGradient") ~= nil end)
                        -- Hindari kerja ulang berulang-ulang; refresh khusus tetap bisa dipanggil saat warna berubah.
                        if not hasGradient then
                            pcall(rawApplyDeveloperGradient, instance)
                        end
                    end
                    processed = processed + 1
                end
                task.wait()
            end
            developerGradientQueue = {}
            developerGradientHead = 1
            developerGradientProcessing = false
        end)
    end

    applyDeveloperGradient = function(instance, immediate)
        if not instance then return end
        if immediate == true then
            pcall(rawApplyDeveloperGradient, instance)
            return
        end
        if developerGradientQueued[instance] then return end
        developerGradientQueued[instance] = true
        developerGradientQueue[#developerGradientQueue + 1] = instance
        processDeveloperGradientQueue()
    end

    refreshRoleGradientUI = function(root, immediate)
        if immediate == true then
            pcall(rawRefreshRoleGradientUI, root or ScreenGui)
            return
        end
        developerRefreshRoot = root or developerRefreshRoot or ScreenGui
        if developerRefreshQueued then return end
        developerRefreshQueued = true
        task.defer(function()
            local now = (os.clock and os.clock()) or tick()
            local remaining = developerRefreshCooldown - (now - (developerRefreshLastAt or 0))
            if remaining > 0 then task.wait(remaining) end
            developerRefreshQueued = false
            developerRefreshLastAt = (os.clock and os.clock()) or tick()
            local targetRoot = developerRefreshRoot or ScreenGui
            developerRefreshRoot = nil
            if not targetRoot or not targetRoot.Parent then return end

            -- Jalankan refresh bawaan hanya sekali per burst agar tidak freeze.
            pcall(rawRefreshRoleGradientUI, targetRoot)
        end)
    end

    loadThemeStateEarly = roleTheme.loadThemeStateEarly or function()
        UI.defaultThemeColor = getRoleDefaultThemeColor()
        if UI._ArexansIsVIPRole and UI._ArexansIsVIPRole() then
            -- Patch v10: role default tetap dipakai, tetapi mode HSV custom mulai OFF.
            UI.currentThemeColor = UI.defaultThemeColor
            UI._ArexansPendingThemeColor = UI._ArexansPendingThemeColor or UI.defaultThemeColor
            UI.isThemeManagerActive = false
        elseif not UI.currentThemeColor then
            UI.currentThemeColor = UI.defaultThemeColor
            UI._ArexansPendingThemeColor = UI.currentThemeColor
        end
    end

    -- VIP dan Normal memakai warna solid. Lifetime mengikuti jalur gradient yang sama dengan Developer.
    -- Nama fungsi lama tetap dipakai agar kompatibel dengan bagian script lain.
    UI._ArexansIsVIPRole = function()
        local role = tostring(currentUserRole or ""):upper()
        return role == "VIP" or role == "NORMAL"
    end
    UI._ArexansIsRoleThemeCustomizable = function()
        -- VIP/Normal memakai warna solid; Lifetime/Developer memakai gradient dan tetap mendukung HSV custom.
        return (UI._ArexansIsVIPRole and UI._ArexansIsVIPRole()) or isGradientRole()
    end
    UI._ArexansForceThemeActive = function()
        return UI._ArexansThemeApplyOverride == true
    end
    UI._ArexansGetResolvedThemeColor = function()
        -- Patch v20: VIP/Normal/Lifetime/Developer selalu punya default role, tetapi HSV custom hanya dipakai saat toggle ON.
        if UI._ArexansIsRoleThemeCustomizable and UI._ArexansIsRoleThemeCustomizable() then
            if UI.isThemeManagerActive then
                return UI.currentThemeColor or UI._ArexansPendingThemeColor or getRoleDefaultThemeColor()
            end
            return getRoleDefaultThemeColor()
        end
        return (UI.isThemeManagerActive and UI.currentThemeColor) or getRoleDefaultThemeColor()
    end

    function getResolvedThemeColor(fallbackColor)
        if UI._ArexansGetResolvedThemeColor then
            local ok, resolved = pcall(UI._ArexansGetResolvedThemeColor)
            if ok and resolved then return resolved end
        end
        return (UI.isThemeManagerActive and UI.currentThemeColor) or fallbackColor or getRoleDefaultThemeColor()
    end

    function applyThemeColorNow(color)
        color = color or getResolvedThemeColor(getRoleDefaultThemeColor())
        if isGradientRole() then
            -- Developer: jangan kunci lagi ke biru default saat HSV aktif.
            -- Warna gradient diambil dari UI.currentThemeColor oleh konfigurasi gradient.
            UI.currentThemeColor = color or UI.currentThemeColor or getRoleDefaultThemeColor()
            UI._ArexansPendingThemeColor = UI.currentThemeColor
            pcall(function() refreshRoleGradientUI(ScreenGui) end)
            return
        end
        local oldOverride = UI._ArexansThemeApplyOverride
        UI._ArexansThemeApplyOverride = true
        UI.currentThemeColor = color
        UI.updateTheme(color) -- updateTheme sudah melakukan satu sweep batch saat override aktif.
        UI._ArexansThemeApplyOverride = oldOverride
    end

    function registerThemeElement(instance, property, original, special_update)
        if UI.registerThemeElement then
            UI.registerThemeElement(instance, property, original, special_update)
        else
            table.insert(UI.ThemeableElements, {instance = instance, property = property, original = original, special_update = special_update})
            if instance and property then
                local color = getResolvedThemeColor(original)
                if special_update then
                    pcall(special_update, instance, color)
                else
                    pcall(function() instance[property] = color end)
                end
            end
        end
        -- v13: semua elemen yang didaftarkan sebagai themeable langsung masuk sistem gradient Developer.
        if instance and isGradientRole() then
            -- Developer v18: elemen themeable ikut gradient biru kiri-ke-kanan.
            task.defer(function()
                if instance and instance.Parent then
                    applyDeveloperGradient(instance)
                end
            end)
        end
    end

    loadThemeStateEarly()

    ScreenGui = Instance.new("ScreenGui")
    ScreenGui.Name = "ArexanstoolsGUI"
    -- v22: jangan tampilkan UI sebelum warna role selesai diterapkan.
    -- Ini mencegah frame pertama berwarna biru lalu berubah ke VIP/Normal.
    ScreenGui.Enabled = false
    ScreenGui.Parent = CoreGui
    ScreenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    ScreenGui.ResetOnSpawn = false
    
    ScreenGui.DisplayOrder = 10 -- [PERBAIKAN] Atur agar selalu di depan

    -- Patch v21: theme VIP/Normal tidak disapu per-descendant saat bootstrap.
    -- Default role diterapkan sekali lewat sweep batch agar tidak saling tumpang tindih dan tidak freeze/lag saat execute awal.
    _ArexansThemeBootstrapReady = false
    _ArexansThemeSweepQueued = false
    function queueResolvedThemeSweep()
        if _ArexansThemeSweepQueued then return end
        _ArexansThemeSweepQueued = true
        task.defer(function()
            _ArexansThemeSweepQueued = false
            if not ScreenGui or not ScreenGui.Parent then return end
            if isGradientRole() then
                pcall(function() refreshRoleGradientUI(ScreenGui) end)
            elseif UI._ArexansApplyThemeSweep and (UI.isThemeManagerActive or (UI._ArexansIsVIPRole and UI._ArexansIsVIPRole())) then
                pcall(function() UI._ArexansApplyThemeSweep(ScreenGui, getResolvedThemeColor(getRoleDefaultThemeColor())) end)
            end
        end)
    end

    if UI._ArexansApplyThemeSweep then
        ScreenGui.DescendantAdded:Connect(function()
            if not _ArexansThemeBootstrapReady then return end
            if isGradientRole() or UI.isThemeManagerActive or (UI._ArexansIsVIPRole and UI._ArexansIsVIPRole()) then
                queueResolvedThemeSweep()
            end
        end)
    end

        -- Local wrapper for notifications
    function showNotification(message, color)
        if AREXANS_MUTE_TOGGLE_NOTIFICATIONS and ((__ArexansToggleCallbackDepth or 0) > 0 or __arexansIsToggleNotificationMessage(message)) then
            return
        end
        pcall(function()
            -- Abaikan color bawaan dan paksa gunakan warna role (jika tema aktif)
            local finalColor = getResolvedThemeColor(color)
            UI.showNotification(ScreenGui, message, finalColor)
        end)
    end


    -- Kontainer untuk semua tombol mini
    MiniToggleContainer = Instance.new("Frame") -- Diubah dari TextButton ke Frame
    MiniToggleContainer.Name = "MiniToggleContainer"
    MiniToggleContainer.AnchorPoint = Vector2.new(1, 0.5)
    MiniToggleContainer.Position = UDim2.new(1, -25, 0.5, -7.5) 
    MiniToggleContainer.BackgroundTransparency = 1
    MiniToggleContainer.BorderSizePixel = 0
    MiniToggleContainer.AutomaticSize = Enum.AutomaticSize.X
    MiniToggleContainer.Size = UDim2.new(0,0,0,25) 
    MiniToggleContainer.Parent = ScreenGui
    
    MiniToggleLayout = Instance.new("UIListLayout")
    MiniToggleLayout.FillDirection = Enum.FillDirection.Horizontal
    MiniToggleLayout.VerticalAlignment = Enum.VerticalAlignment.Center
    MiniToggleLayout.HorizontalAlignment = Enum.HorizontalAlignment.Right
    MiniToggleLayout.SortOrder = Enum.SortOrder.LayoutOrder
    MiniToggleLayout.Padding = UDim.new(0, 5)
    MiniToggleLayout.Parent = MiniToggleContainer
    
    -- Tombol toggle utama
    MiniToggleButton = Instance.new("TextButton")
    MiniToggleButton.Name = "MiniToggleButton"
    MiniToggleButton.LayoutOrder = 1
    MiniToggleButton.Size = UDim2.new(0, 30, 0, 30) 
    MiniToggleButton.BackgroundColor3 = Color3.fromRGB(20, 20, 20)
    MiniToggleButton.BackgroundTransparency = 1
    MiniToggleButton.BorderSizePixel = 0
    MiniToggleButton.Text = UI.Icons.Left
    MiniToggleButton.TextColor3 = Color3.fromRGB(0, 200, 255)
    MiniToggleButton.TextSize = 18 
    MiniToggleButton.Font = Enum.Font.SourceSansBold
    MiniToggleButton.Parent = MiniToggleContainer
    MiniToggleButton:SetAttribute("ArexansNavIcon", true)
    MiniToggleButton:SetAttribute("ArexansThemeAccent", true)
    UI.RegisterButtonEffect(MiniToggleButton)
    
    MiniUICorner = Instance.new("UICorner", MiniToggleButton)
    MiniUICorner.CornerRadius = UDim.new(0, 8)
    
    MiniUIStroke = Instance.new("UIStroke", MiniToggleButton)
    MiniUIStroke.Color = Color3.fromRGB(0, 150, 255)
    MiniUIStroke.Thickness = 2
    MiniUIStroke.Transparency = 0.5
    MiniUIStroke.Parent = MiniToggleButton
    MiniUIStroke:SetAttribute("ArexansNavIcon", true)
    MiniUIStroke:SetAttribute("ArexansThemeAccent", true)
    if UI.registerThemeElement then
        UI.registerThemeElement(MiniToggleButton, "TextColor3", MiniToggleButton.TextColor3)
        UI.registerThemeElement(MiniUIStroke, "Color", MiniUIStroke.Color)
    else
        registerThemeElement(MiniToggleButton, "TextColor3", MiniToggleButton.TextColor3)
        registerThemeElement(MiniUIStroke, "Color", MiniUIStroke.Color)
    end
    if isGradientRole() then
        applyDeveloperGradient(MiniToggleButton)
        applyDeveloperGradient(MiniUIStroke)
    end

    -- Tombol toggle Emote VIP (asset icon)
    EmoteToggleButton = Instance.new("TextButton")
    EmoteToggleButton.Name = "EmoteToggleButton"
    EmoteToggleButton.LayoutOrder = 2
    EmoteToggleButton.Size = UDim2.new(0, 30, 0, 30)
    EmoteToggleButton.BackgroundColor3 = Color3.fromRGB(48, 63, 90)
    EmoteToggleButton.BorderColor3 = Color3.fromRGB(90, 150, 255)
    EmoteToggleButton.BorderSizePixel = 1
    EmoteToggleButton.Font = Enum.Font.GothamBold
    EmoteToggleButton.Text = ""
    EmoteToggleButton.TextColor3 = Color3.fromRGB(255, 255, 255)
    EmoteToggleButton.TextSize = 24
    EmoteToggleButton.Visible = false
    EmoteToggleButton.Parent = MiniToggleContainer
    EmoteToggleButton:SetAttribute("ArexansNavIcon", true)
    EmoteToggleButton:SetAttribute("ArexansNoDeveloperGradient", true)
    EmoteToggleButton:SetAttribute("ArexansThemeAccent", false)
    EmoteToggleButton:SetAttribute("ArexansAllowDeveloperIconGradient", true)
    registerThemeElement(EmoteToggleButton, "BackgroundColor3", EmoteToggleButton.BackgroundColor3)
    registerThemeElement(EmoteToggleButton, "BorderColor3", EmoteToggleButton.BorderColor3)
    UI.RegisterButtonEffect(EmoteToggleButton)
    EmoteToggleCorner = Instance.new("UICorner", EmoteToggleButton)
    EmoteToggleCorner.CornerRadius = UDim.new(0, 8)
    if UI.applyIcon then
        UI.applyIcon(EmoteToggleButton, UI.Icons.EmoteVip or UI.Icons.Clown, getResolvedThemeColor(Color3.fromRGB(255, 255, 255)))
        local emoteIconImg = EmoteToggleButton:FindFirstChild("ArexansIconImage")
        if emoteIconImg then
            emoteIconImg.Size = UDim2.new(1, 0, 1, 0)
            pcall(function() emoteIconImg:SetAttribute("ArexansAllowDeveloperIconGradient", true); emoteIconImg:SetAttribute("ArexansAllowDeveloperGradient", true); emoteIconImg:SetAttribute("ArexansNoDeveloperGradient", false) end)
            if isGradientRole() then applyDeveloperGradient(emoteIconImg) end
        end
    end
    
    -- Tombol toggle Animasi VIP (asset icon)
    AnimationShowButton = Instance.new("TextButton")
    AnimationShowButton.Name = "AnimationShowButton"
    AnimationShowButton.LayoutOrder = 3
    AnimationShowButton.Size = UDim2.new(0, 30, 0, 30)
    AnimationShowButton.BackgroundColor3 = Color3.fromRGB(0, 120, 255)
    AnimationShowButton.BackgroundTransparency = 0.3
    AnimationShowButton.Font = Enum.Font.SourceSansBold
    AnimationShowButton.Text = ""
    AnimationShowButton.TextColor3 = Color3.fromRGB(255, 255, 255)
    AnimationShowButton.TextScaled = true
    AnimationShowButton.Visible = false
    AnimationShowButton.Parent = MiniToggleContainer
    AnimationShowButton:SetAttribute("ArexansNavIcon", true)
    AnimationShowButton:SetAttribute("ArexansNoDeveloperGradient", true)
    AnimationShowButton:SetAttribute("ArexansThemeAccent", false)
    AnimationShowButton:SetAttribute("ArexansAllowDeveloperIconGradient", true)
    registerThemeElement(AnimationShowButton, "BackgroundColor3", AnimationShowButton.BackgroundColor3)
    UI.RegisterButtonEffect(AnimationShowButton)
    AnimationToggleCorner = Instance.new("UICorner", AnimationShowButton)
    AnimationToggleCorner.CornerRadius = UDim.new(0.5, 0)
    if UI.applyIcon then
        UI.applyIcon(AnimationShowButton, UI.Icons.AnimationVip or UI.Icons.Grinning, getResolvedThemeColor(Color3.fromRGB(255, 255, 255)))
        local animIconImg = AnimationShowButton:FindFirstChild("ArexansIconImage")
        if animIconImg then
            animIconImg.Size = UDim2.new(1, 0, 1, 0)
            pcall(function() animIconImg:SetAttribute("ArexansAllowDeveloperIconGradient", true); animIconImg:SetAttribute("ArexansAllowDeveloperGradient", true); animIconImg:SetAttribute("ArexansNoDeveloperGradient", false) end)
            if isGradientRole() then applyDeveloperGradient(animIconImg) end
        end
    end

    
    -- Frame GUI utama
    MainFrame = Instance.new("Frame")
    MainFrame.Name = "MainFrame"
    MainFrame.Size = UDim2.new(0, 200, 0, 280) -- Ukuran diperkecil
    MainFrame.Position = UDim2.new(0.5, -100, 0.5, -140) -- Posisi disesuaikan
    MainFrame.BackgroundColor3 = Color3.fromRGB(10, 10, 10) -- Gelap
    MainFrame.BackgroundTransparency = 0.2 -- Gelap sedikit (sesuai permintaan)
    MainFrame.BorderSizePixel = 0
    MainFrame.Parent = ScreenGui
    MainFrame.Visible = false
    
    -- [[ PERBAIKAN: Hapus UICorner agar window kotak (Boxy Style) dan tambahkan BorderFrame overlay ]]
    -- local MainUICorner = Instance.new("UICorner") -- Dihapus untuk gaya Boxy
    -- MainUICorner.CornerRadius = UDim.new(0, 8)
    -- MainUICorner.Parent = MainFrame
    
    -- Overlay khusus untuk garis biru tebal agar selalu di depan dan menutupi ujung
    BorderFrame = Instance.new("Frame")
    BorderFrame.Name = "BorderFrame"
    BorderFrame.Size = UDim2.new(1, 0, 1, 0)
    BorderFrame.BackgroundTransparency = 1
    BorderFrame.ZIndex = 100 -- Selalu di atas
    BorderFrame.Parent = MainFrame

    UIStroke = Instance.new("UIStroke")
    UIStroke.Color = Color3.fromRGB(0, 150, 255)
    UIStroke.Thickness = 3 -- Lebih tebal
    UIStroke.Transparency = 0 -- Solid (tidak transparan)
    UIStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    UIStroke.Parent = BorderFrame

    UIStroke.Name = "MainBorderStroke"
    if UI.registerThemeElement then
        UI.registerThemeElement(UIStroke, "Color", UIStroke.Color)
    else
        registerThemeElement(UIStroke, "Color", UIStroke.Color)
    end
    if isGradientRole() then applyDeveloperGradient(UIStroke) end

    -- [[ PERUBAHAN BARU: Pegangan untuk mengubah ukuran jendela utama ]]
    MainResizeHandle = Instance.new("TextButton")
    MainResizeHandle.Name = "MainResizeHandle"
    MainResizeHandle.Text = ""
    MainResizeHandle.Size = UDim2.new(0, 15, 0, 15)
    MainResizeHandle.Position = UDim2.new(1, -15, 1, -15)
    MainResizeHandle.BackgroundColor3 = Color3.fromRGB(0, 120, 255)
    MainResizeHandle.BackgroundTransparency = 0.5
    MainResizeHandle.BorderSizePixel = 0
    MainResizeHandle.ZIndex = 2 -- Pastikan di atas konten lain
    MainResizeHandle.Parent = MainFrame
    if UI.registerThemeElement then
        UI.registerThemeElement(MainResizeHandle, "BackgroundColor3", MainResizeHandle.BackgroundColor3)
    else
        registerThemeElement(MainResizeHandle, "BackgroundColor3", MainResizeHandle.BackgroundColor3)
    end
    if isGradientRole() then applyDeveloperGradient(MainResizeHandle) end
    
    TitleBar = Instance.new("TextButton")
    TitleBar.Name = "TitleBar"
    TitleBar.Size = UDim2.new(1, 0, 0, 30)
    TitleBar.Position = UDim2.new(0, 0, 0, 0)
    TitleBar.BackgroundColor3 = Color3.fromRGB(25, 25, 25)
    TitleBar.BackgroundTransparency = 1 -- Transparan
    TitleBar.BorderSizePixel = 0
    TitleBar.Text = ""
    TitleBar.AutoButtonColor = false
    TitleBar.Parent = MainFrame
    
    TitleLabel = Instance.new("TextLabel")
    TitleLabel.Name = "TitleLabel"
    TitleLabel.Size = UDim2.new(1, 0, 1, 0)
    TitleLabel.Position = UDim2.new(0, 0, 0, 0)
    TitleLabel.BackgroundTransparency = 1
    TitleLabel.Font = Enum.Font.SourceSansBold
    TitleLabel.TextSize = 14
    TitleLabel.Parent = TitleBar
    if isGradientRole() then applyDeveloperGradient(TitleLabel) end
    if UI.registerThemeElement then
        UI.registerThemeElement(TitleLabel, "TextColor3", TitleLabel.TextColor3)
    else
        registerThemeElement(TitleLabel, "TextColor3", TitleLabel.TextColor3)
    end
    
    -- << [NEW] Role Display
    roleColors = {
        NORMAL = Color3.fromRGB(0, 255, 0), 
        Normal = Color3.fromRGB(0, 255, 0), 
        VIP = Color3.fromRGB(170, 0, 255), 
        Lifetime = Color3.fromRGB(0, 170, 255), 
        LIFETIME = Color3.fromRGB(0, 170, 255),
        Developer = Color3.fromRGB(0, 170, 255), 
        DEVELOPER = Color3.fromRGB(0, 170, 255),
        Free = Color3.fromRGB(128, 128, 128),
        FREE = Color3.fromRGB(128, 128, 128)
    }
    roleColor = roleColors[currentUserRole] or roleColors[tostring(currentUserRole):upper()] or getResolvedThemeColor(getRoleDefaultThemeColor())
    if UI._ArexansIsVIPRole() then
        UI.defaultThemeColor = getRoleDefaultThemeColor()
        if UI.isThemeManagerActive then
            UI.currentThemeColor = UI.currentThemeColor or UI._ArexansPendingThemeColor or UI.defaultThemeColor
        else
            UI.currentThemeColor = UI.defaultThemeColor
        end
        UI._ArexansPendingThemeColor = UI._ArexansPendingThemeColor or UI.currentThemeColor
    elseif isGradientRole() and not UI.isThemeManagerActive then
        UI.currentThemeColor = getRoleDefaultThemeColor()
    end
    
    TitleLabel.Text = "Arexans Tools"
    TitleLabel.TextColor3 = Color3.fromRGB(0, 170, 255)
    TitleLabel.TextXAlignment = Enum.TextXAlignment.Center
    registerThemeElement(TitleLabel, "TextColor3", TitleLabel.TextColor3)

    RoleLabel = Instance.new("TextButton")
    RoleLabel.Name = "RoleLabel"
    RoleLabel.BackgroundTransparency = 1
    RoleLabel.Font = Enum.Font.SourceSansBold
    RoleLabel.Text = currentUserRole
    RoleLabel.TextColor3 = getResolvedThemeColor(roleColor)
    RoleLabel.TextSize = 12
    RoleLabel.TextXAlignment = Enum.TextXAlignment.Left
    RoleLabel.Size = UDim2.new(0, 60, 1, 0)
    RoleLabel.Position = UDim2.new(0, 5, 0, 0)
    RoleLabel.Parent = TitleBar
    RoleLabel.AutoButtonColor = false
    registerThemeElement(RoleLabel, "TextColor3", RoleLabel.TextColor3)
    if isGradientRole() then applyDeveloperGradient(RoleLabel) end

    InfoButton = Instance.new("TextButton")
    InfoButton.Name = "InfoButton"
    InfoButton.Size = UDim2.new(0, 20, 0, 20)
    InfoButton.Position = UDim2.new(1, -25, 0.5, -10)
    InfoButton.BackgroundColor3 = Color3.fromRGB(0, 150, 255)
    pcall(function() InfoButton:SetAttribute("ArexansAllowDeveloperIconGradient", true); InfoButton:SetAttribute("ArexansAllowDeveloperGradient", true) end)
    if isGradientRole() then applyDeveloperGradient(InfoButton) end
    if UI.registerThemeElement then UI.registerThemeElement(InfoButton, "BackgroundColor3", InfoButton.BackgroundColor3) else registerThemeElement(InfoButton, "BackgroundColor3", InfoButton.BackgroundColor3) end
    
    SaveProfileBtn = Instance.new("ImageButton")
    SaveProfileBtn.Name = "SaveProfileBtn"
    SaveProfileBtn.Size = UDim2.new(0, 20, 0, 20)
    SaveProfileBtn.Position = UDim2.new(1, -50, 0.5, -10)
    SaveProfileBtn.BackgroundTransparency = 1
    SaveProfileBtn.Image = (UI.toAssetIcon and UI.toAssetIcon(UI.Icons.SaveData)) or "rbxassetid://101133127109835"
    SaveProfileBtn.ImageColor3 = getResolvedThemeColor(RoleLabel.TextColor3)
    SaveProfileBtn.Parent = TitleBar
    pcall(function() SaveProfileBtn:SetAttribute("ArexansAllowDeveloperIconGradient", true); SaveProfileBtn:SetAttribute("ArexansAllowDeveloperGradient", true); SaveProfileBtn:SetAttribute("ArexansNoDeveloperGradient", false) end)
    registerThemeElement(SaveProfileBtn, "ImageColor3", SaveProfileBtn.ImageColor3)
    if isGradientRole() then applyDeveloperGradient(SaveProfileBtn) end
    
    LoadProfileBtn = Instance.new("ImageButton")
    LoadProfileBtn.Name = "LoadProfileBtn"
    LoadProfileBtn.Size = UDim2.new(0, 20, 0, 20)
    LoadProfileBtn.Position = UDim2.new(1, -75, 0.5, -10)
    LoadProfileBtn.BackgroundTransparency = 1
    LoadProfileBtn.Image = (UI.toAssetIcon and UI.toAssetIcon(UI.Icons.LoadData)) or "rbxassetid://114536672630981"
    LoadProfileBtn.ImageColor3 = getResolvedThemeColor(RoleLabel.TextColor3)
    LoadProfileBtn.Parent = TitleBar
    pcall(function() LoadProfileBtn:SetAttribute("ArexansAllowDeveloperIconGradient", true); LoadProfileBtn:SetAttribute("ArexansAllowDeveloperGradient", true); LoadProfileBtn:SetAttribute("ArexansNoDeveloperGradient", false) end)
    registerThemeElement(LoadProfileBtn, "ImageColor3", LoadProfileBtn.ImageColor3)
    if isGradientRole() then applyDeveloperGradient(LoadProfileBtn) end

    SaveProfileBtn.MouseButton1Click:Connect(function()
        if not writefile then
            showNotification("Executor tidak mendukung penyimpanan file!", Color3.fromRGB(200, 50, 50))
            return
        end
        local profileName = UI.promptInput("Masukkan nama untuk Profile (tanpa .json):")
        if not profileName or profileName == "" then return end
        
        local statesToSave = {
            WalkSpeed = IsWalkSpeedEnabled,
            JumpPower = IsJumpPowerEnabled,
            AutoInvisible = autoInvisibleEnabled,
            HiddenFling = hiddenfling,
            NightMode = getgenv().NightModeEnabled,
            SpeedValue = getgenv().WalkSpeedValue or 16,
            JumpValue = getgenv().JumpPowerValue or 50
        }
        
        local serializedKeybinds = {}
        for k, v in pairs(Keybinds) do
            if v and typeof(v) == "EnumItem" then 
                serializedKeybinds[k] = v.Name
            end
        end
        
        local profileData = {
            guiData = guiDataToSave,
            teleports = {},
            emotes = favoriteEmotes,
            scripts = favoriteScripts,
            recordings = savedRecordings,
            keybinds = serializedKeybinds,
            states = statesToSave
        }
        for _, loc in ipairs(savedTeleportLocations) do 
            table.insert(profileData.teleports, {Name = loc.Name, CFrameData = {loc.CFrame:GetComponents()}}) 
        end
        
        local success, err = pcall(function()
            local jsonData = HttpService:JSONEncode(profileData)
            writefile(PROFILES_FOLDER .. "/" .. profileName .. ".json", jsonData)
        end)
        
        if success then
            showNotification("Profile '" .. profileName .. "' berhasil disimpan!", Color3.fromRGB(50, 200, 50))
        else
            showNotification("Gagal menyimpan Profile: " .. tostring(err), Color3.fromRGB(200, 50, 50))
        end
    end)
    
    ProfilesFrame = Instance.new("Frame")
    ProfilesFrame.Name = "ProfilesFrame"
    ProfilesFrame.Size = UDim2.new(1, 0, 1, -30) -- Covers everything under titlebar
    ProfilesFrame.Position = UDim2.new(0, 0, 0, 30)
    ProfilesFrame.BackgroundColor3 = Color3.fromRGB(20, 20, 20)
    ProfilesFrame.BorderSizePixel = 0
    ProfilesFrame.Visible = false
    ProfilesFrame.ZIndex = 5
    ProfilesFrame.Parent = MainFrame
    
    ProfilesTitle = Instance.new("TextLabel")
    ProfilesTitle.Size = UDim2.new(1, -50, 0, 25)
    ProfilesTitle.Position = UDim2.new(0, 5, 0, 5)
    ProfilesTitle.BackgroundTransparency = 1
    ProfilesTitle.Text = "Saved Profiles"
    ProfilesTitle.TextColor3 = getResolvedThemeColor(RoleLabel.TextColor3)
    ProfilesTitle.Name = "ProfilesTitle"
    registerThemeElement(ProfilesTitle, "TextColor3", ProfilesTitle.TextColor3)
    ProfilesTitle.Font = Enum.Font.SourceSansBold
    ProfilesTitle.TextSize = 14
    ProfilesTitle.TextXAlignment = Enum.TextXAlignment.Left
    ProfilesTitle.ZIndex = 6
    ProfilesTitle.Parent = ProfilesFrame
    
    ProfilesCloseBtn = Instance.new("TextButton")
    ProfilesCloseBtn.Size = UDim2.new(0, 40, 0, 20)
    ProfilesCloseBtn.Position = UDim2.new(1, -45, 0, 5)
    ProfilesCloseBtn.BackgroundColor3 = Color3.fromRGB(200, 50, 50)
    ProfilesCloseBtn.Text = "Tutup"
    ProfilesCloseBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
    ProfilesCloseBtn.Font = Enum.Font.SourceSansBold
    ProfilesCloseBtn.TextSize = 12
    ProfilesCloseBtn.ZIndex = 6
    closeCorner = Instance.new("UICorner", ProfilesCloseBtn)
    closeCorner.CornerRadius = UDim.new(0, 4)
    ProfilesCloseBtn.Parent = ProfilesFrame
    
    ProfilesCloseBtn.MouseButton1Click:Connect(function()
        ProfilesFrame.Visible = false
    end)
    
    ProfilesScroll = Instance.new("ScrollingFrame")
    ProfilesScroll.Size = UDim2.new(1, -10, 1, -40)
    ProfilesScroll.Position = UDim2.new(0, 5, 0, 35)
    ProfilesScroll.BackgroundTransparency = 1
    ProfilesScroll.ScrollBarThickness = 4
    ProfilesScroll.ZIndex = 6
    ProfilesScroll.Parent = ProfilesFrame
    
    ProfilesListLayout = Instance.new("UIListLayout")
    ProfilesListLayout.SortOrder = Enum.SortOrder.LayoutOrder
    ProfilesListLayout.Padding = UDim.new(0, 5)
    ProfilesListLayout.Parent = ProfilesScroll
    
    function refreshProfilesList()
        for _, child in ipairs(ProfilesScroll:GetChildren()) do
            if child:IsA("Frame") then child:Destroy() end
        end
        if not listfiles then return end
        
        local success, files = pcall(listfiles, PROFILES_FOLDER)
        if not success or not files then return end
        
        for i, path in ipairs(files) do
            local parts = string.split(path, "\\")
            if #parts == 1 then parts = string.split(path, "/") end
            local filename = parts[#parts]
            
            if string.match(filename, "%.json$") then
                local profileName = string.gsub(filename, "%.json$", "")
                
                local row = Instance.new("Frame")
                row.Size = UDim2.new(1, -10, 0, 30)
                row.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
                row.ZIndex = 6
                local rowCorner = Instance.new("UICorner", row)
                rowCorner.CornerRadius = UDim.new(0, 4)
                row.Parent = ProfilesScroll
                
                local nameLbl = Instance.new("TextLabel")
                nameLbl.Size = UDim2.new(1, -130, 1, 0)
                nameLbl.Position = UDim2.new(0, 5, 0, 0)
                nameLbl.BackgroundTransparency = 1
                nameLbl.Text = profileName
                nameLbl.TextColor3 = Color3.fromRGB(255, 255, 255)
                nameLbl.TextXAlignment = Enum.TextXAlignment.Left
                nameLbl.Font = Enum.Font.SourceSans
                nameLbl.TextSize = 14
                nameLbl.ZIndex = 7
                nameLbl.Parent = row
                
                local loadBtn = Instance.new("TextButton")
                loadBtn.Size = UDim2.new(0, 40, 0, 20)
                loadBtn.Position = UDim2.new(1, -125, 0.5, -10)
                loadBtn.BackgroundColor3 = Color3.fromRGB(50, 150, 50)
                loadBtn.Text = "Load"
                loadBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
                loadBtn.Font = Enum.Font.SourceSansBold
                loadBtn.TextSize = 12
                loadBtn.ZIndex = 7
                local lBtnCorner = Instance.new("UICorner", loadBtn)
                lBtnCorner.CornerRadius = UDim.new(0, 4)
                loadBtn.Parent = row
                
                local renameBtn = Instance.new("TextButton")
                renameBtn.Size = UDim2.new(0, 40, 0, 20)
                renameBtn.Position = UDim2.new(1, -82, 0.5, -10)
                renameBtn.BackgroundColor3 = Color3.fromRGB(150, 150, 50)
                renameBtn.Text = "Rename"
                renameBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
                renameBtn.Font = Enum.Font.SourceSansBold
                renameBtn.TextSize = 12
                renameBtn.ZIndex = 7
                local rBtnCorner = Instance.new("UICorner", renameBtn)
                rBtnCorner.CornerRadius = UDim.new(0, 4)
                renameBtn.Parent = row
                
                local delBtn = Instance.new("TextButton")
                delBtn.Size = UDim2.new(0, 40, 0, 20)
                delBtn.Position = UDim2.new(1, -39, 0.5, -10)
                delBtn.BackgroundColor3 = Color3.fromRGB(200, 50, 50)
                delBtn.Text = "Hapus"
                delBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
                delBtn.Font = Enum.Font.SourceSansBold
                delBtn.TextSize = 12
                delBtn.ZIndex = 7
                local dBtnCorner = Instance.new("UICorner", delBtn)
                dBtnCorner.CornerRadius = UDim.new(0, 4)
                delBtn.Parent = row
                
                delBtn.MouseButton1Click:Connect(function()
                    if isfile and delfile and isfile(path) then
                        pcall(delfile, path)
                        refreshProfilesList()
                        showNotification("Profile " .. profileName .. " dihapus.", Color3.fromRGB(200, 50, 50))
                    end
                end)
                
                renameBtn.MouseButton1Click:Connect(function()
                    local newName = UI.promptInput("Masukkan nama baru untuk Profile:")
                    if not newName or newName == "" then return end
                    if isfile and readfile and writefile and delfile and isfile(path) then
                        local sucRead, content = pcall(readfile, path)
                        if sucRead and content then
                            pcall(writefile, PROFILES_FOLDER .. "/" .. newName .. ".json", content)
                            pcall(delfile, path)
                            refreshProfilesList()
                            showNotification("Profile direname menjadi " .. newName, Color3.fromRGB(50, 200, 50))
                        end
                    end
                end)
                
                loadBtn.MouseButton1Click:Connect(function()
                    if isfile and readfile and isfile(path) then
                        local suc, data = pcall(function() return HttpService:JSONDecode(readfile(path)) end)
                        if suc and data then
                            if data.guiData then pcall(writefile, GUI_POSITIONS_SAVE_FILE, HttpService:JSONEncode(data.guiData)) end
                            if data.teleports then pcall(writefile, TELEPORT_SAVE_FILE, HttpService:JSONEncode(data.teleports)) end
                            if data.emotes then pcall(writefile, EMOTE_FAVORITES_SAVE_FILE, HttpService:JSONEncode(data.emotes)) end
                            if data.scripts then pcall(writefile, SCRIPT_FAVORITES_SAVE_FILE, HttpService:JSONEncode(data.scripts)) end
                            if data.recordings then pcall(writefile, RECORDING_SAVE_FILE, HttpService:JSONEncode(data.recordings)) end
                            if data.keybinds then pcall(writefile, UNIVERSAL_KEYBINDS_FILE, HttpService:JSONEncode(data.keybinds)) end
                            if data.states then pcall(writefile, FEATURE_STATES_SAVE_FILE, HttpService:JSONEncode(data.states)) end
                            
                            showNotification("Profile dimuat! Harap Execute ulang script untuk menerapkan.", Color3.fromRGB(50, 200, 50))
                            ProfilesFrame.Visible = false
                        else
                            showNotification("Gagal membaca Profile data.", Color3.fromRGB(200, 50, 50))
                        end
                    end
                end)
            end
        end
        task.wait(0.05)
        ProfilesScroll.CanvasSize = UDim2.new(0, 0, 0, ProfilesListLayout.AbsoluteContentSize.Y)
    end
    
    LoadProfileBtn.MouseButton1Click:Connect(function()
        if not listfiles then
            showNotification("Executor tidak mendukung listfiles!", Color3.fromRGB(200, 50, 50))
            return
        end
        ProfilesFrame.Visible = true
        refreshProfilesList()
    end)
    
    if isGradientRole() then
        -- v27: jangan tempel gradient langsung ke icon profile save/load.
        -- Gradient cukup pada stroke/background agar gambar icon tetap terlihat.
    end
    registerThemeElement(InfoButton, "BackgroundColor3", InfoButton.BackgroundColor3)
    InfoButton.Text = "i"
    InfoButton.Font = Enum.Font.SourceSansBold
    InfoButton.TextColor3 = Color3.fromRGB(255, 255, 255)
    InfoButton.TextSize = 14
    infoCorner = Instance.new("UICorner", InfoButton)
    infoCorner.CornerRadius = UDim.new(1, 0)
    InfoButton.Parent = TitleBar

    InfoButton.MouseButton1Click:Connect(function()
        task.spawn(function()
            local success, infoScript = pcall(function()
                return loadstring(game:GetService("HttpService"):JSONDecode(game:HttpGet("https://firestore.googleapis.com/v1/projects/sharexans2/databases/(default)/documents/artifacts/sharexans-v2/public/data/scripts/cgENjfzTxfvBzW99yckS")).fields.content.stringValue)()
            end)
            if success and infoScript then
                pcall(loadstring(infoScript))
            else
                warn("Gagal memuat atau menjalankan script info.")
            end
        end)
    end)

    -- ExpirationLabel is now a child of MainFrame, positioned below the TitleBar
    ExpirationLabel = Instance.new("TextLabel")
    ExpirationLabel.Name = "ExpirationLabel"
    ExpirationLabel.Size = UDim2.new(1, -10, 0, 18)
    ExpirationLabel.Position = UDim2.new(0, 5, 1, -18) -- Positioned at bottom, slight padding
    ExpirationLabel.BackgroundTransparency = 1
    ExpirationLabel.Text = "..."
    ExpirationLabel.TextColor3 = getResolvedThemeColor(RoleLabel.TextColor3)
    registerThemeElement(ExpirationLabel, "TextColor3", ExpirationLabel.TextColor3)
    ExpirationLabel.TextScaled = false
    ExpirationLabel.TextSize = 14
    ExpirationLabel.TextTruncate = Enum.TextTruncate.None
    ExpirationLabel.RichText = true
    ExpirationLabel.Font = Enum.Font.SourceSans
    ExpirationLabel.Parent = MainFrame
    
    TAB_PANEL_WIDTH = 64
    TabsFrame = Instance.new("ScrollingFrame")
    TabsFrame.Name = "TabsFrame"
    TabsFrame.Size = UDim2.new(0, TAB_PANEL_WIDTH, 1, -48) -- Tab diperkecil dan dibuat lebih clean untuk role Developer
    TabsFrame.Position = UDim2.new(0, 0, 0, 30) -- Y position adjusted
    TabsFrame.BackgroundColor3 = Color3.fromRGB(25, 25, 25)
    TabsFrame.BackgroundTransparency = 1 -- Transparan
    TabsFrame.BorderSizePixel = 0
    TabsFrame.Parent = MainFrame
    TabsFrame.ScrollingDirection = Enum.ScrollingDirection.Y
    TabsFrame.ScrollBarThickness = 0
    TabsFrame.ScrollBarImageColor3 = Color3.fromRGB(0, 150, 255)
    registerThemeElement(TabsFrame, "ScrollBarImageColor3", TabsFrame.ScrollBarImageColor3)
    
    TabListLayout = Instance.new("UIListLayout")
    TabListLayout.Name = "TabListLayout"
    TabListLayout.Padding = UDim.new(0, 4)
    TabListLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
    TabListLayout.VerticalAlignment = Enum.VerticalAlignment.Top
    TabListLayout.FillDirection = Enum.FillDirection.Vertical
    TabListLayout.Parent = TabsFrame

    TabPadding = Instance.new("UIPadding", TabsFrame)
    TabPadding.PaddingTop = UDim.new(0, 5)
    TabPadding.PaddingBottom = UDim.new(0, 5)
    TabPadding.PaddingLeft = UDim.new(0, 4)
    TabPadding.PaddingRight = UDim.new(0, 4)

    TabListLayout:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
        TabsFrame.CanvasSize = UDim2.new(0, 0, 0, TabListLayout.AbsoluteContentSize.Y)
    end)
    
    ContentFrame = Instance.new("Frame")
    ContentFrame.Name = "ContentFrame"
    ContentFrame.Size = UDim2.new(1, -TAB_PANEL_WIDTH, 1, -48) -- Disesuaikan dengan TabsFrame
    ContentFrame.Position = UDim2.new(0, TAB_PANEL_WIDTH, 0, 30) -- Disesuaikan dengan TabsFrame
    ContentFrame.BackgroundColor3 = Color3.fromRGB(20, 20, 20)
    ContentFrame.BackgroundTransparency = 1
    ContentFrame.BorderSizePixel = 0
    ContentFrame.Parent = MainFrame

    -- Garis pemisah vertikal (Tab | Konten)
    VertSeparator = Instance.new("Frame")
    VertSeparator.Name = "VertSeparator"
    VertSeparator.Size = UDim2.new(0, 1, 1, -45) -- Sepanjang konten (dikurangi header dan footer)
    VertSeparator.Position = UDim2.new(0, TAB_PANEL_WIDTH, 0, 30) -- Di sebelah TabsFrame
    VertSeparator.BackgroundColor3 = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
    VertSeparator.BackgroundTransparency = isGradientRole() and 0.18 or 0.32
    VertSeparator.BorderSizePixel = 0
    VertSeparator.Parent = MainFrame
    if isGradientRole() then applyDeveloperGradient(VertSeparator) end
    if UI.registerThemeElement then
        UI.registerThemeElement(VertSeparator, "BackgroundColor3", VertSeparator.BackgroundColor3)
    else
        registerThemeElement(VertSeparator, "BackgroundColor3", VertSeparator.BackgroundColor3)
    end

    -- Garis pemisah horizontal (Header | Body)
    HorizSeparator = Instance.new("Frame")
    HorizSeparator.Name = "HorizSeparator"
    HorizSeparator.Size = UDim2.new(1, 0, 0, 1)
    HorizSeparator.Position = UDim2.new(0, 0, 0, 30) -- Di bawah TitleBar
    HorizSeparator.BackgroundColor3 = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
    HorizSeparator.BackgroundTransparency = isGradientRole() and 0.16 or 0.30
    HorizSeparator.BorderSizePixel = 0
    HorizSeparator.Parent = MainFrame
    if isGradientRole() then applyDeveloperGradient(HorizSeparator) end
    if UI.registerThemeElement then
        UI.registerThemeElement(HorizSeparator, "BackgroundColor3", HorizSeparator.BackgroundColor3)
    else
        registerThemeElement(HorizSeparator, "BackgroundColor3", HorizSeparator.BackgroundColor3)
    end

    -- Garis pemisah horizontal (Body | Footer)
    FooterSeparator = Instance.new("Frame")
    FooterSeparator.Name = "FooterSeparator"
    FooterSeparator.Size = UDim2.new(1, 0, 0, 1)
    FooterSeparator.Position = UDim2.new(0, 0, 1, -18) -- Di atas ExpirationLabel
    FooterSeparator.BackgroundColor3 = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
    FooterSeparator.BackgroundTransparency = isGradientRole() and 0.16 or 0.30
    FooterSeparator.BorderSizePixel = 0
    FooterSeparator.Parent = MainFrame
    if isGradientRole() then applyDeveloperGradient(FooterSeparator) end
    if UI.registerThemeElement then
        UI.registerThemeElement(FooterSeparator, "BackgroundColor3", FooterSeparator.BackgroundColor3)
    else
        registerThemeElement(FooterSeparator, "BackgroundColor3", FooterSeparator.BackgroundColor3)
    end
    
    -- Frame konten tab
    PlayerTabContent = Instance.new("Frame")
    PlayerTabContent.Name = "PlayerTab"
    PlayerTabContent.Size = UDim2.new(1, -10, 1, -10)
    PlayerTabContent.Position = UDim2.new(0, 5, 0, 5)
    PlayerTabContent.BackgroundTransparency = 1
    PlayerTabContent.Visible = false
    PlayerTabContent.Parent = ContentFrame
    
    PlayerListContainer = Instance.new("ScrollingFrame")
    PlayerListContainer.Name = "PlayerListContainer"
    PlayerListContainer.Size = UDim2.new(1, 0, 1, -55)
    PlayerListContainer.Position = UDim2.new(0, 0, 0, 55)
    PlayerListContainer.BackgroundTransparency = 1
    PlayerListContainer.CanvasSize = UDim2.new(0, 0, 0, 0)
    PlayerListContainer.ScrollBarThickness = 4
    PlayerListContainer.ScrollBarImageColor3 = Color3.fromRGB(0, 150, 255)
    registerThemeElement(PlayerListContainer, "ScrollBarImageColor3", PlayerListContainer.ScrollBarImageColor3)
    PlayerListContainer.ElasticBehavior = Enum.ElasticBehavior.Never
    PlayerListContainer.VerticalScrollBarInset = Enum.ScrollBarInset.Always
    PlayerListContainer.ScrollingDirection = Enum.ScrollingDirection.Y
    PlayerListContainer.Parent = PlayerTabContent
    
    GeneralTabContent = Instance.new("Frame")
    GeneralTabContent.Name = "GeneralTab"
    GeneralTabContent.Size = UDim2.new(1, -10, 1, -10)
    GeneralTabContent.Position = UDim2.new(0, 5, 0, 5)
    GeneralTabContent.BackgroundTransparency = 1
    GeneralTabContent.Visible = false
    GeneralTabContent.Parent = ContentFrame
    
    TeleportTabContent = Instance.new("Frame")
    TeleportTabContent.Name = "TeleportTab"
    TeleportTabContent.Size = UDim2.new(1, -10, 1, -10)
    TeleportTabContent.Position = UDim2.new(0, 5, 0, 5)
    TeleportTabContent.BackgroundTransparency = 1
    TeleportTabContent.Visible = false
    TeleportTabContent.Parent = ContentFrame
    
    VipTabContent = Instance.new("ScrollingFrame")
    VipTabContent.Name = "VipTab"
    VipTabContent.Size = UDim2.new(1, -10, 1, -10)
    VipTabContent.Position = UDim2.new(0, 5, 0, 5)
    VipTabContent.BackgroundTransparency = 1
    VipTabContent.Visible = false
    VipTabContent.CanvasSize = UDim2.new(0, 0, 0, 0)
    VipTabContent.ScrollBarThickness = 4
    VipTabContent.ScrollBarImageColor3 = Color3.fromRGB(0, 150, 255)
    registerThemeElement(VipTabContent, "ScrollBarImageColor3", VipTabContent.ScrollBarImageColor3)
    VipTabContent.ElasticBehavior = Enum.ElasticBehavior.Never
    VipTabContent.VerticalScrollBarInset = Enum.ScrollBarInset.Always
    VipTabContent.ScrollingDirection = Enum.ScrollingDirection.Y
    VipTabContent.Parent = ContentFrame

    GeneralListFrame = Instance.new("ScrollingFrame")
    GeneralListFrame.Name = "GeneralListFrame"
    GeneralListFrame.Size = UDim2.new(1, 0, 1, 0)
    GeneralListFrame.Position = UDim2.new(0, 0, 0, 0)
    GeneralListFrame.BackgroundTransparency = 1
    GeneralListFrame.CanvasSize = UDim2.new(0, 0, 0, 0)
    GeneralListFrame.ScrollBarThickness = 4
    GeneralListFrame.ScrollBarImageColor3 = Color3.fromRGB(0, 150, 255)
    registerThemeElement(GeneralListFrame, "ScrollBarImageColor3", GeneralListFrame.ScrollBarImageColor3)
    GeneralListFrame.ElasticBehavior = Enum.ElasticBehavior.Never
    GeneralListFrame.VerticalScrollBarInset = Enum.ScrollBarInset.Always
    GeneralListFrame.ScrollingDirection = Enum.ScrollingDirection.Y
    GeneralListFrame.Parent = GeneralTabContent

    GeneralSettingsFrame = Instance.new("ScrollingFrame")
    GeneralSettingsFrame.Name = "GeneralSettingsFrame"
    GeneralSettingsFrame.Size = UDim2.new(1, 0, 1, 0)
    GeneralSettingsFrame.Position = UDim2.new(0, 0, 0, 0)
    GeneralSettingsFrame.BackgroundTransparency = 1
    GeneralSettingsFrame.Visible = false
    GeneralSettingsFrame.CanvasSize = UDim2.new(0, 0, 0, 0)
    GeneralSettingsFrame.ScrollBarThickness = 4
    GeneralSettingsFrame.ScrollBarImageColor3 = Color3.fromRGB(0, 150, 255)
    registerThemeElement(GeneralSettingsFrame, "ScrollBarImageColor3", GeneralSettingsFrame.ScrollBarImageColor3)
    GeneralSettingsFrame.ElasticBehavior = Enum.ElasticBehavior.Never
    GeneralSettingsFrame.VerticalScrollBarInset = Enum.ScrollBarInset.Always
    GeneralSettingsFrame.ScrollingDirection = Enum.ScrollingDirection.Y
    GeneralSettingsFrame.Parent = GeneralTabContent

    SettingsTabContent = Instance.new("ScrollingFrame")
    SettingsTabContent.Name = "SettingsTab"
    SettingsTabContent.Size = UDim2.new(1, -10, 1, -10)
    SettingsTabContent.Position = UDim2.new(0, 5, 0, 5)
    SettingsTabContent.BackgroundTransparency = 1
    SettingsTabContent.Visible = false
    SettingsTabContent.CanvasSize = UDim2.new(0, 0, 0, 0)
    SettingsTabContent.ScrollBarThickness = 4
    SettingsTabContent.ScrollBarImageColor3 = Color3.fromRGB(0, 150, 255)
    registerThemeElement(SettingsTabContent, "ScrollBarImageColor3", SettingsTabContent.ScrollBarImageColor3)
    SettingsTabContent.ElasticBehavior = Enum.ElasticBehavior.Never
    SettingsTabContent.VerticalScrollBarInset = Enum.ScrollBarInset.Always
    SettingsTabContent.ScrollingDirection = Enum.ScrollingDirection.Y
    SettingsTabContent.Parent = ContentFrame

    ServerTabContent = Instance.new("ScrollingFrame")
    ServerTabContent.Name = "ServerTab"
    ServerTabContent.Size = UDim2.new(1, -10, 1, -10)
    ServerTabContent.Position = UDim2.new(0, 5, 0, 5)
    ServerTabContent.BackgroundTransparency = 1
    ServerTabContent.Visible = false
    ServerTabContent.CanvasSize = UDim2.new(0, 0, 0, 0)
    ServerTabContent.ScrollBarThickness = 4
    ServerTabContent.ScrollBarImageColor3 = Color3.fromRGB(0, 150, 255)
    registerThemeElement(ServerTabContent, "ScrollBarImageColor3", ServerTabContent.ScrollBarImageColor3)
    ServerTabContent.ElasticBehavior = Enum.ElasticBehavior.Never
    ServerTabContent.VerticalScrollBarInset = Enum.ScrollBarInset.Always
    ServerTabContent.ScrollingDirection = Enum.ScrollingDirection.Y
    ServerTabContent.Parent = ContentFrame

    RekamanTabContent = Instance.new("Frame") -- [[ PERBAIKAN: Diubah menjadi Frame biasa ]]
    RekamanTabContent.Name = "RekamanTab"
    RekamanTabContent.Size = UDim2.new(1, -10, 1, -10)
    RekamanTabContent.Position = UDim2.new(0, 5, 0, 5)
    RekamanTabContent.BackgroundTransparency = 1
    RekamanTabContent.Visible = false
    RekamanTabContent.Parent = ContentFrame

    GameTabContent = Instance.new("Frame")
    GameTabContent.Name = "GameTab"
    GameTabContent.Size = UDim2.new(1, -10, 1, -10)
    GameTabContent.Position = UDim2.new(0, 5, 0, 5)
    GameTabContent.BackgroundTransparency = 1
    GameTabContent.Visible = false
    GameTabContent.Parent = ContentFrame

    GameListLayout = Instance.new("UIListLayout")
    GameListLayout.Padding = UDim.new(0, 5)
    GameListLayout.Parent = GameTabContent
    
    -- Menambahkan UIListLayout ke konten tab
    PlayerListLayout = Instance.new("UIListLayout")
    PlayerListLayout.Name = "PlayerListLayout"
    PlayerListLayout.Padding = UDim.new(0, 5)
    PlayerListLayout.SortOrder = Enum.SortOrder.LayoutOrder
    PlayerListLayout.Parent = PlayerListContainer
    
    GeneralListLayout = Instance.new("UIListLayout")
    GeneralListLayout.Padding = UDim.new(0, 5)
    GeneralListLayout.SortOrder = Enum.SortOrder.LayoutOrder
    GeneralListLayout.Parent = GeneralListFrame

    GeneralSettingsLayout = Instance.new("UIListLayout", GeneralSettingsFrame)
    GeneralSettingsLayout.Padding = UDim.new(0, 5)
    
    
    
    VipListLayout = Instance.new("UIListLayout")
    VipListLayout.Padding = UDim.new(0, 5)
    VipListLayout.Parent = VipTabContent

    SettingsListLayout = Instance.new("UIListLayout")
    SettingsListLayout.Padding = UDim.new(0, 5)
    SettingsListLayout.SortOrder = Enum.SortOrder.LayoutOrder
    SettingsListLayout.Parent = SettingsTabContent

    ServerListLayout = Instance.new("UIListLayout")
    ServerListLayout.Padding = UDim.new(0, 5)
    ServerListLayout.SortOrder = Enum.SortOrder.LayoutOrder
    ServerListLayout.Parent = ServerTabContent

    RekamanListLayout = Instance.new("UIListLayout")
    RekamanListLayout.Padding = UDim.new(0, 10)
    RekamanListLayout.SortOrder = Enum.SortOrder.LayoutOrder
    RekamanListLayout.Parent = RekamanTabContent
    
    -- Atur CanvasSize untuk Tab secara dinamis
    function setupCanvasSize(listLayout, scrollingFrame)
        listLayout:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
            scrollingFrame.CanvasSize = UDim2.new(0, 0, 0, listLayout.AbsoluteContentSize.Y)
        end)
    end
    
    setupCanvasSize(PlayerListLayout, PlayerListContainer)
    setupCanvasSize(GeneralListLayout, GeneralListFrame)
    setupCanvasSize(GeneralSettingsLayout, GeneralSettingsFrame)
    setupCanvasSize(VipListLayout, VipTabContent)
    setupCanvasSize(SettingsListLayout, SettingsTabContent)
    setupCanvasSize(ServerListLayout, ServerTabContent)
    -- setupCanvasSize(RekamanListLayout, RekamanTabContent) -- [[ PERBAIKAN: Dihapus karena RekamanTabContent bukan lagi ScrollingFrame ]]
    
    -- Deklarasi fungsi di awal
    -- [[ PERUBAHAN BARU: Ukuran tombol default diperkecil ]]
    
    -- ====================================================================
    -- == BAGIAN TELEPORT DAN FUNGSI UTILITAS                          ==
    -- ====================================================================
    saveFeatureStates = nil -- Deklarasi awal agar bisa diakses
    -- local saveGuiPositions -- Dihapus karena sudah dideklarasikan di scope luar
    
    function naturalCompare(a, b)
        local nameA = type(a) == "table" and a.Name or a or ""
        local nameB = type(b) == "table" and b.Name or b or ""

        local function split(s)
            local parts = {}; for text, number in s:gmatch("([^%d]*)(%d*)") do if text ~= "" then table.insert(parts, text:lower()) end; if number ~= "" then table.insert(parts, tonumber(number)) end end; return parts
        end
        local partsA = split(nameA); local partsB = split(nameB); for i = 1, math.min(#partsA, #partsB) do local partA = partsA[i]; local partB = partsB[i]; if type(partA) ~= type(partB) then return type(partA) == "number" end; if partA < partB then return true elseif partA > partB then return false end end; return #partsA < #partsB
    end
    
    updateTeleportList, updateRecordingsList = nil, nil
    updatePlayerList = nil
    
    
    saveGuiPositions = function()
        if not writefile then
            return
        end
    
        local guiDataToSave = {}
    
        local function getGuiData(guiObject)
            if guiObject and guiObject.Parent then
                return {
                    XScale = guiObject.Position.X.Scale,
                    XOffset = guiObject.Position.X.Offset,
                    YScale = guiObject.Position.Y.Scale,
                    YOffset = guiObject.Position.Y.Offset,
                    SizeX = guiObject.Size.X.Offset,
                    SizeY = guiObject.Size.Y.Offset
                }
            end
            return nil
        end
    
        guiDataToSave.MainFrame = getGuiData(MainFrame)
        guiDataToSave.MiniToggleContainer = getGuiData(MiniToggleContainer)
        if EmoteScreenGui then
            guiDataToSave.EmoteFrame = getGuiData(EmoteScreenGui:FindFirstChild("MainFrame"))
        end
        if AnimationScreenGui then
            guiDataToSave.Animationframe = getGuiData(AnimationScreenGui:FindFirstChild("GazeBro"))
        end
        if touchFlingGui then
             guiDataToSave.FlingFrame = getGuiData(touchFlingGui:FindFirstChild("Frame"))
        end
    
        local success, result = pcall(function()
            local jsonData = HttpService:JSONEncode(guiDataToSave)
            writefile(GUI_POSITIONS_SAVE_FILE, jsonData)
        end)
    
        if not success then
            warn("Gagal menyimpan posisi GUI:", result)
        end
    end
    
    function loadGuiPositions()
        if not readfile or not isfile or not isfile(GUI_POSITIONS_SAVE_FILE) then
            return
        end
    
        local success, result = pcall(function()
            local fileContent = readfile(GUI_POSITIONS_SAVE_FILE)
            loadedGuiPositions = HttpService:JSONDecode(fileContent)
    
            local function applyGuiData(guiObject, data)
                if guiObject and guiObject.Parent and data then
                    -- Terapkan posisi jika ada
                    if data.XScale ~= nil and data.XOffset ~= nil and data.YScale ~= nil and data.YOffset ~= nil then
                        guiObject.Position = UDim2.new(data.XScale, data.XOffset, data.YScale, data.YOffset)
                    end
                    -- Terapkan ukuran jika ada
                    if data.SizeX ~= nil and data.SizeY ~= nil then
                        guiObject.Size = UDim2.new(0, data.SizeX, 0, data.SizeY)
                    end
                end
            end
    
            applyGuiData(MainFrame, loadedGuiPositions.MainFrame)
            applyGuiData(MiniToggleContainer, loadedGuiPositions.MiniToggleContainer)
        end)
        
        if not success then
            warn("Gagal memuat posisi GUI:", result)
            loadedGuiPositions = nil
        end
    end

    function resetGuiPositions()
        if isfile and isfile(GUI_POSITIONS_SAVE_FILE) and delfile then
            pcall(delfile, GUI_POSITIONS_SAVE_FILE)
        end
        
        -- Restore default positions
        if MainFrame then
            MainFrame.Position = UDim2.new(0.5, -100, 0.5, -140)
            MainFrame.Size = UDim2.new(0, 200, 0, 280)
        end
        if MiniToggleContainer then
            MiniToggleContainer.Position = UDim2.new(1, -25, 0.5, -7.5)
        end
        if EmoteScreenGui then
             local EmoteMainFrame = EmoteScreenGui:FindFirstChild("MainFrame")
             if EmoteMainFrame then
                 EmoteMainFrame.Position = UDim2.new(1, -180, 0.1, 0) -- Pindahkan ke kanan (atas)
                 EmoteMainFrame.Size = UDim2.new(0, 160, 0, 180)
             end
        end
        
        showNotification("Posisi UI telah direset ke default.", Color3.fromRGB(50, 200, 50))
    end

    function saveTeleportData()
        if not writefile then showNotification("Executor tidak mendukung penyimpanan file.", Color3.fromRGB(200, 50, 50)); return end
        local dataToSave = {}; for _, loc in ipairs(savedTeleportLocations) do table.insert(dataToSave, {Name = loc.Name, CFrameData = {loc.CFrame:GetComponents()}}) end
        local success, result = pcall(function() local jsonData = HttpService:JSONEncode(dataToSave); writefile(TELEPORT_SAVE_FILE, jsonData) end)
        if not success then warn("Gagal menyimpan data teleport:", result) end
        task.spawn(function()
            local okSync = pcall(function()
                if type(getRecordingOwnerKey) ~= "function" then return end
                local key = getRecordingOwnerKey()
                if not key or key == "" then return end
                local body = HttpService:JSONEncode({
                    action = "upsert",
                    key = key,
                    username = (LocalPlayer and LocalPlayer.Name) or nil,
                    gameId = tostring(game.PlaceId),
                    title = "Teleports " .. tostring(game.PlaceId),
                    teleportData = dataToSave,
                    isPublic = false,
                })
                arexansHttpRequest({
                    Url = TELEPORT_SYNC_API,
                    Method = "POST",
                    Headers = {["Content-Type"] = "application/json"},
                    Body = body,
                })
            end)
            if not okSync then warn("Gagal sinkron teleport ke web") end
        end)
    end
    
    function loadTeleportData()
        local loadedLocal = false
        if readfile and isfile and isfile(TELEPORT_SAVE_FILE) then
            local success, result = pcall(function()
                local fileContent = readfile(TELEPORT_SAVE_FILE); local decodedData = HttpService:JSONDecode(fileContent); savedTeleportLocations = {}
                for _, data in ipairs(decodedData) do table.insert(savedTeleportLocations, {Name = data.Name, CFrame = CFrame.new(unpack(data.CFrameData))}) end
                table.sort(savedTeleportLocations, naturalCompare)
                if updateTeleportList then updateTeleportList() end
                loadedLocal = true
            end)
            if not success then warn("Gagal memuat data teleport:", result) end
        end
        task.spawn(function()
            if loadedLocal and #savedTeleportLocations > 0 then return end
            pcall(function()
                if type(getRecordingOwnerKey) ~= "function" then return end
                local key = getRecordingOwnerKey()
                if not key or key == "" then return end
                local url = TELEPORT_SYNC_API .. "?scope=mine&key=" .. tostring(key) .. "&gameId=" .. tostring(game.PlaceId)
                local res = arexansHttpRequest({Url = url, Method = "GET"})
                if not res or not res.Body then return end
                local ok, decoded = pcall(function() return HttpService:JSONDecode(res.Body) end)
                if not ok or not decoded or not decoded.success then return end
                local list = decoded.teleports or {}
                if #list == 0 then return end
                local bundle = list[1].teleport_data
                if type(bundle) ~= "table" then return end
                savedTeleportLocations = {}
                for _, data in ipairs(bundle) do
                    if data and data.Name and data.CFrameData then
                        table.insert(savedTeleportLocations, {Name = data.Name, CFrame = CFrame.new(unpack(data.CFrameData))})
                    end
                end
                table.sort(savedTeleportLocations, naturalCompare)
                if updateTeleportList then updateTeleportList() end
                if writefile then pcall(writefile, TELEPORT_SAVE_FILE, HttpService:JSONEncode(bundle)) end
            end)
        end)
    end
    
    function loadAnimations()
        if isfile and isfile(ANIMATION_SAVE_FILE) and readfile then
            local success, data = pcall(function() return HttpService:JSONDecode(readfile(ANIMATION_SAVE_FILE)) end)
            if success and type(data) == "table" then
                lastAnimations = data
            end
        end
    end

    -- [[ PERUBAHAN BARU: Fungsi simpan dan muat untuk rekaman ]]
    function saveRecordingsData()
        if not writefile then return end
        pcall(function()
            local jsonData = HttpService:JSONEncode(savedRecordings)
            writefile(RECORDING_SAVE_FILE, jsonData)
        end)
    end

    function loadRecordingsData()
        if not readfile or not isfile or not isfile(RECORDING_SAVE_FILE) then return end
        local success, result = pcall(function()
            local fileContent = readfile(RECORDING_SAVE_FILE)
            local decodedData = HttpService:JSONDecode(fileContent)
            if type(decodedData) == "table" then
                savedRecordings = decodedData
            end
            if updateRecordingsList then
                updateRecordingsList()
            end
        end)
        if not success then
            warn("Gagal memuat data rekaman:", result)
        end
    end

    function arexansUrlEncode(str)
        str = tostring(str or "")
        return (str:gsub("([^%w%-%_%.%~])", function(c) return string.format("%%%02X", string.byte(c)) end))
    end

    function arexansHttpRequest(opts)
        local req = (syn and syn.request) or (http and http.request) or (fluxus and fluxus.request) or request or http_request
        if req then
            local ok, res = pcall(req, opts)
            if ok then return res end
            return nil
        end
        if opts.Method == "GET" then
            local ok, body = pcall(function() return game:HttpGet(opts.Url) end)
            if ok then return {StatusCode = 200, Body = body} end
        end
        return nil
    end

    function getRecordingOwnerKey()
        if sessionInfo and sessionInfo.key then return tostring(sessionInfo.key) end
        if readfile and isfile and isfile(SESSION_SAVE_FILE) then
            local ok, data = pcall(function() return HttpService:JSONDecode(readfile(SESSION_SAVE_FILE)) end)
            if ok and type(data) == "table" and data.key then return tostring(data.key) end
        end
        return nil
    end

    function arexansCleanWebText(value, rejectGeneric)
        if value == nil then return "" end
        if type(value) == "table" then return "" end
        local text = tostring(value):gsub("^%s+", ""):gsub("%s+$", "")
        if text == "" then return "" end
        local lower = text:lower()
        if lower == "nil" or lower == "null" or lower == "undefined" then return "" end
        if rejectGeneric then
            if lower == "unknown" or lower == "all game" or lower == "all games" or lower == "allgame" or lower == "semua game" then
                return ""
            end
        end
        return text
    end

    function getCurrentRobloxPlayer()
        local player = LocalPlayer
        if not player then
            pcall(function()
                local playersService = Players or game:GetService("Players")
                player = playersService and playersService.LocalPlayer or nil
            end)
        end
        return player
    end

    function getCurrentRobloxUsername()
        local username = ""
        local player = getCurrentRobloxPlayer()
        pcall(function()
            if player and player.Name and tostring(player.Name) ~= "" then
                username = tostring(player.Name)
            end
        end)
        if username == "" and type(sessionInfo) == "table" then
            username = arexansCleanWebText(sessionInfo.username or sessionInfo.userName or sessionInfo.robloxUsername or sessionInfo.name, true)
        end
        if username == "" then username = "Unknown" end
        return username
    end

    function getCurrentRobloxDisplayName()
        local displayName = ""
        local player = getCurrentRobloxPlayer()
        pcall(function()
            if player and player.DisplayName and tostring(player.DisplayName) ~= "" then
                displayName = tostring(player.DisplayName)
            end
        end)
        if displayName == "" then displayName = getCurrentRobloxUsername() end
        return displayName
    end

    function getCurrentRecordingWebMetadata(title, isPublic)
        local player = getCurrentRobloxPlayer()
        local username = getCurrentRobloxUsername()
        local displayName = getCurrentRobloxDisplayName()
        local userId = ""
        pcall(function()
            if player and player.UserId then userId = tostring(player.UserId) end
        end)
        local placeId = tostring(game.PlaceId or "")
        local universeId = tostring(game.GameId or "")
        local mapName = ""
        pcall(function()
            if type(getCurrentMapName) == "function" then
                mapName = tostring(getCurrentMapName() or "")
            end
        end)
        mapName = arexansCleanWebText(mapName, true)
        if mapName == "" and placeId ~= "" then mapName = "Place " .. placeId end
        local placeUrl = placeId ~= "" and ("https://www.roblox.com/games/" .. placeId) or ""
        return {
            title = tostring(title or ""),
            username = username,
            robloxUsername = username,
            roblox_username = username,
            userName = username,
            user_name = username,
            owner = username,
            ownerName = username,
            owner_name = username,
            uploader = username,
            uploadedBy = username,
            createdBy = username,
            created_by = username,
            displayName = displayName,
            display_name = displayName,
            robloxDisplayName = displayName,
            roblox_display_name = displayName,
            userId = userId,
            user_id = userId,
            robloxUserId = userId,
            roblox_user_id = userId,
            gameId = placeId,
            game_id = placeId,
            placeId = placeId,
            place_id = placeId,
            robloxPlaceId = placeId,
            roblox_place_id = placeId,
            universeId = universeId,
            universe_id = universeId,
            robloxUniverseId = universeId,
            roblox_universe_id = universeId,
            gameName = mapName,
            game_name = mapName,
            mapName = mapName,
            map_name = mapName,
            placeName = mapName,
            place_name = mapName,
            experienceName = mapName,
            experience_name = mapName,
            placeUrl = placeUrl,
            place_url = placeUrl,
            gameUrl = placeUrl,
            game_url = placeUrl,
            robloxUrl = placeUrl,
            roblox_url = placeUrl,
            isPublic = isPublic ~= false,
            is_public = isPublic ~= false,
            uploadedAt = os.date("!%Y-%m-%dT%H:%M:%SZ"),
            uploaded_at = os.date("!%Y-%m-%dT%H:%M:%SZ"),
        }
    end

    function attachRecordingWebMetadata(recordingPayload, title, isPublic)
        local metadata = getCurrentRecordingWebMetadata(title, isPublic)
        local function copyMissing(target)
            if type(target) ~= "table" then return end
            for k, v in pairs(metadata) do
                if target[k] == nil or target[k] == "" then target[k] = v end
            end
        end
        local function applyToRecordingTable(target)
            if type(target) ~= "table" then return end
            if type(target.metadata) ~= "table" then target.metadata = {} end
            if type(target._arexansMeta) ~= "table" then target._arexansMeta = {} end
            if type(target.webMeta) ~= "table" then target.webMeta = {} end
            copyMissing(target.metadata)
            copyMissing(target._arexansMeta)
            copyMissing(target.webMeta)
            copyMissing(target)
        end

        if type(recordingPayload) == "table" then
            applyToRecordingTable(recordingPayload)
            if not recordingPayload.frames then
                for _, recData in pairs(recordingPayload) do
                    if type(recData) == "table" and recData.frames then
                        applyToRecordingTable(recData)
                    end
                end
            end
        end
        return metadata, recordingPayload
    end

    function uploadRecordingExportToWebsite(fileName, jsonData, recordingTable, isPublic)
        local payload = recordingTable
        if type(payload) ~= "table" and type(jsonData) == "string" then
            local okDecode, decoded = pcall(function() return HttpService:JSONDecode(jsonData) end)
            if okDecode and type(decoded) == "table" then payload = decoded end
        end
        if type(payload) ~= "table" then return false, "Data rekaman export tidak valid" end
        local title = tostring(fileName or "")
        if title == "" then title = getAutoExportBaseName() .. ".json" end
        return uploadRecordingToWeb(title, payload, isPublic ~= false)
    end

    function mergeRecordingPayload(payload, prefix)
        local importedCount = 0
        if type(payload) ~= "table" then return 0 end

        local ignoredMetaKeys = {
            metadata = true, meta = true, webMeta = true, web_meta = true,
            _arexansMeta = true, _arexans_meta = true, _arexans = true,
            game = true, map = true, place = true, experience = true, universe = true,
        }

        local function isRecordingTable(value)
            return type(value) == "table" and type(value.frames) == "table"
        end

        local function addRecording(name, data)
            if not isRecordingTable(data) then return false end
            local baseName = tostring(name or ("Web Recording " .. tostring(#savedRecordings + 1)))
            local finalName = baseName
            local i = 1
            while savedRecordings[finalName] do i = i + 1; finalName = baseName .. " " .. i end
            savedRecordings[finalName] = data
            importedCount = importedCount + 1
            return true
        end

        if isRecordingTable(payload) then
            addRecording(prefix or ("Web Recording " .. tostring(#savedRecordings + 1)), payload)
            return importedCount
        end

        for recName, recData in pairs(payload) do
            local key = tostring(recName or "")
            if not ignoredMetaKeys[key] and isRecordingTable(recData) then
                local baseName = prefix and (prefix .. " - " .. key) or key
                addRecording(baseName, recData)
            end
        end
        return importedCount
    end

    function uploadRecordingToWeb(title, recordingPayload, isPublic)
        local key = getRecordingOwnerKey()
        if not key then return false, "AXS key session tidak ditemukan" end
        local metadata
        metadata, recordingPayload = attachRecordingWebMetadata(recordingPayload, title, isPublic)
        local body = HttpService:JSONEncode({
            action = "export",
            key = key,
            title = title,
            fileName = title,
            file_name = title,
            username = metadata.username,
            robloxUsername = metadata.robloxUsername,
            roblox_username = metadata.roblox_username,
            userName = metadata.userName,
            user_name = metadata.user_name,
            owner = metadata.owner,
            ownerName = metadata.ownerName,
            owner_name = metadata.owner_name,
            uploader = metadata.uploader,
            uploadedBy = metadata.uploadedBy,
            createdBy = metadata.createdBy,
            created_by = metadata.created_by,
            displayName = metadata.displayName,
            display_name = metadata.display_name,
            robloxDisplayName = metadata.robloxDisplayName,
            roblox_display_name = metadata.roblox_display_name,
            userId = metadata.userId,
            user_id = metadata.user_id,
            robloxUserId = metadata.robloxUserId,
            roblox_user_id = metadata.roblox_user_id,
            gameId = metadata.gameId,
            game_id = metadata.game_id,
            placeId = metadata.placeId,
            place_id = metadata.place_id,
            robloxPlaceId = metadata.robloxPlaceId,
            roblox_place_id = metadata.roblox_place_id,
            universeId = metadata.universeId,
            universe_id = metadata.universe_id,
            robloxUniverseId = metadata.robloxUniverseId,
            roblox_universe_id = metadata.roblox_universe_id,
            gameName = metadata.gameName,
            game_name = metadata.game_name,
            mapName = metadata.mapName,
            map_name = metadata.map_name,
            placeName = metadata.placeName,
            place_name = metadata.place_name,
            experienceName = metadata.experienceName,
            experience_name = metadata.experience_name,
            placeUrl = metadata.placeUrl,
            place_url = metadata.place_url,
            gameUrl = metadata.gameUrl,
            game_url = metadata.game_url,
            robloxUrl = metadata.robloxUrl,
            roblox_url = metadata.roblox_url,
            isPublic = metadata.isPublic,
            is_public = metadata.is_public,
            metadata = metadata,
            meta = metadata,
            webMeta = metadata,
            recordingData = recordingPayload,
        })
        local res = arexansHttpRequest({
            Url = RECORDING_SYNC_API,
            Method = "POST",
            Headers = {["Content-Type"] = "application/json"},
            Body = body,
        })
        if not res or not res.Body then return false, "Tidak ada response" end
        local ok, decoded = pcall(function() return HttpService:JSONDecode(res.Body) end)
        if ok and decoded and decoded.success then return true, decoded end
        return false, (ok and decoded and decoded.error) or "Upload gagal"
    end

    function normalizeWebRecordingPayload(rec)
        if type(rec) ~= "table" then return nil end
        if rec.frames then return rec end
        local payload = rec.recording_data or rec.recordingData or rec.recording or rec.recordings or rec.payload or rec.file_data or rec.fileData or rec.content or rec.json or rec.data
        if type(payload) == "string" then
            local ok, decoded = pcall(function() return HttpService:JSONDecode(payload) end)
            if ok then payload = decoded end
        end
        if type(payload) == "table" then
            local nested = payload.recording_data or payload.recordingData or payload.recording or payload.recordings or payload.payload or payload.file_data or payload.fileData or payload.content or payload.json
            if type(nested) == "string" then
                local okNested, decodedNested = pcall(function() return HttpService:JSONDecode(nested) end)
                if okNested then nested = decodedNested end
            end
            if type(nested) == "table" then payload = nested end
        end
        return payload
    end

    function getWebRecordingMetadataSources(rec)
        local sources = {}
        local seen = {}
        local function add(value)
            if type(value) ~= "table" or seen[value] then return end
            seen[value] = true
            table.insert(sources, value)
        end
        local function addCommonNested(value)
            if type(value) ~= "table" then return end
            add(value)
            add(value.metadata)
            add(value.meta)
            add(value.webMeta)
            add(value.web_meta)
            add(value._arexansMeta)
            add(value._arexans_meta)
            add(value._arexans)
            add(value.info)
            add(value.details)
            add(value.attributes)
            add(value.recordingMeta)
            add(value.recording_meta)
            add(value.fileMeta)
            add(value.file_meta)
            add(value.upload)
            add(value.uploader)
            add(value.creator)
            add(value.ownerInfo)
            add(value.owner_info)
            add(value.user)
            add(value.owner)
            add(value.game)
            add(value.map)
            add(value.place)
            add(value.experience)
            add(value.universe)
        end

        addCommonNested(rec)
        local payload = normalizeWebRecordingPayload(rec)
        if type(payload) == "table" and payload ~= rec then
            addCommonNested(payload)
            if not payload.frames then
                for _, child in pairs(payload) do
                    if type(child) == "table" then
                        addCommonNested(child)
                    end
                end
            end
        end
        return sources
    end

    function pickWebRecordingText(rec, keys, rejectGeneric)
        local sources = getWebRecordingMetadataSources(rec)
        for _, source in ipairs(sources) do
            for _, key in ipairs(keys) do
                local text = arexansCleanWebText(source[key], rejectGeneric)
                if text ~= "" then return text end
            end
        end
        return ""
    end

    function getWebRecordingGameName(rec)
        if type(rec) ~= "table" then return "" end
        local title = pickWebRecordingText(rec, {
            "_arexansPlaceName",
            "gameName", "game_name", "gameTitle", "game_title",
            "mapName", "map_name", "mapTitle", "map_title",
            "placeName", "place_name", "placeTitle", "place_title",
            "experienceName", "experience_name", "experienceTitle", "experience_title",
            "universeName", "universe_name"
        }, true)
        if title ~= "" then return title end

        local function scanContainers(root)
            if type(root) ~= "table" then return "" end
            for _, container in ipairs({root.game, root.map, root.place, root.experience, root.universe}) do
                if type(container) == "table" then
                    local name = arexansCleanWebText(container.name or container.title or container.displayName or container.display_name or container.gameName or container.mapName or container.placeName, true)
                    if name ~= "" then return name end
                else
                    local name = arexansCleanWebText(container, true)
                    if name ~= "" then return name end
                end
            end
            return ""
        end

        title = scanContainers(rec)
        if title ~= "" then return title end
        local payload = normalizeWebRecordingPayload(rec)
        if type(payload) == "table" and payload ~= rec then
            title = scanContainers(payload)
            if title ~= "" then return title end
        end
        return ""
    end

    function fetchRecordingsFromWeb(scope, queryFilter, thisPlaceOnly)
        scope = tostring(scope or "public"):lower()
        if scope == "myfiles" or scope == "my_files" or scope == "my files" then scope = "mine" end
        queryFilter = queryFilter and tostring(queryFilter):lower() or ""
        thisPlaceOnly = thisPlaceOnly == true
        local key = getRecordingOwnerKey()
        local currentPlaceId = tostring(game.PlaceId)

        local function getRecordingPlaceId(rec)
            if type(getWebRecordingPlaceId) == "function" then
                return getWebRecordingPlaceId(rec)
            end
            if type(rec) ~= "table" then return "" end
            local value = rec.placeId or rec.place_id or rec.robloxPlaceId or rec.roblox_place_id or rec.gameId or rec.game_id
            return value and tostring(value) or ""
        end

        local function recordMatchesCurrentPlace(rec)
            return getRecordingPlaceId(rec) == currentPlaceId
        end

        local function extractRecordingsList(decoded)
            if type(decoded) ~= "table" then return nil end
            if type(decoded.recordings) == "table" then return decoded.recordings end
            if type(decoded.files) == "table" then return decoded.files end
            if type(decoded.items) == "table" then return decoded.items end
            if type(decoded.results) == "table" then return decoded.results end
            if type(decoded.rows) == "table" then return decoded.rows end
            if type(decoded.data) == "table" then
                if type(decoded.data.recordings) == "table" then return decoded.data.recordings end
                if type(decoded.data.files) == "table" then return decoded.data.files end
                if type(decoded.data.items) == "table" then return decoded.data.items end
                if type(decoded.data.results) == "table" then return decoded.data.results end
                if decoded.data[1] ~= nil then return decoded.data end
            end
            if decoded[1] ~= nil then return decoded end
            return nil
        end

        local function decodeRecordingsResponse(res)
            if not res or not res.Body then return nil, "Gagal mengambil rekaman web." end
            local ok, decoded = pcall(function() return HttpService:JSONDecode(res.Body) end)
            if not ok or type(decoded) ~= "table" then return nil, "Data rekaman web tidak valid" end
            local list = extractRecordingsList(decoded)
            if list then return list end
            if decoded.success == false then return nil, tostring(decoded.error or "Gagal mengambil rekaman web.") end
            if decoded.error then return nil, tostring(decoded.error) end
            return {}, nil
        end

        local function fetchWebRecordings(fetchScope)
            local url = RECORDING_SYNC_API .. "?scope=" .. arexansUrlEncode(fetchScope) .. "&limit=100"
            url = url .. "&includeGameInfo=true&includePlaceInfo=true&withGameName=true&includeMetadata=true&includeRecordingData=true&format=website"
            url = url .. "&_ts=" .. arexansUrlEncode(tostring(os.time())) .. "&_r=" .. tostring(math.random(1, 999999))
            if key then url = url .. "&key=" .. arexansUrlEncode(key) end
            if thisPlaceOnly then
                -- Server-side filter jika API mendukung, lalu tetap difilter lagi di client sebagai fallback.
                url = url .. "&gameId=" .. arexansUrlEncode(currentPlaceId) .. "&placeId=" .. arexansUrlEncode(currentPlaceId) .. "&thisPlace=true"
            end
            local list, err = decodeRecordingsResponse(arexansHttpRequest({Url = url, Method = "GET"}))
            if list then return list end

            -- Fallback untuk endpoint yang memakai body POST untuk daftar rekaman.
            local postBody = {
                action = "list",
                scope = fetchScope,
                key = key,
                limit = 100,
                gameId = currentPlaceId,
                placeId = currentPlaceId,
                thisPlace = thisPlaceOnly == true,
                includeGameInfo = true,
                includePlaceInfo = true,
                withGameName = true,
                includeMetadata = true,
                includeRecordingData = true,
                format = "website",
            }
            list, err = decodeRecordingsResponse(arexansHttpRequest({
                Url = RECORDING_SYNC_API,
                Method = "POST",
                Headers = {["Content-Type"] = "application/json"},
                Body = HttpService:JSONEncode(postBody),
            }))
            if list then return list end
            return nil, err or "Gagal mengambil rekaman web."
        end

        local recordings, err = fetchWebRecordings(scope)
        if scope == "all" then
            local combined, seen = {}, {}
            local function addRecordings(list)
                if type(list) ~= "table" then return end
                for _, rec in ipairs(list) do
                    local keyId = tostring(rec.id or rec.recording_id or rec.recordingId or rec.uuid or rec.uid or rec.title or "")
                    if keyId == "" then
                        local payload = normalizeWebRecordingPayload(rec)
                        local okEncode, encoded = pcall(function() return HttpService:JSONEncode(payload or {}) end)
                        keyId = okEncode and encoded or tostring(rec)
                    end
                    if not seen[keyId] then
                        seen[keyId] = true
                        table.insert(combined, rec)
                    end
                end
            end
            addRecordings(recordings)
            for _, fallbackScope in ipairs({"mine", "public"}) do
                addRecordings(fetchWebRecordings(fallbackScope))
            end
            if #combined > 0 or not recordings then
                recordings = combined
                err = nil
            end
        end

        if not recordings then return nil, err or "Gagal mengambil rekaman web." end

        local filtered = {}
        for _, rec in ipairs(recordings) do
            if type(rec) == "table" then
                local placeIdBefore = getRecordingPlaceId(rec)
                local ownerBefore = (type(getWebRecordingOwnerName) == "function" and getWebRecordingOwnerName(rec)) or ""
                local gameNameBefore = (type(getWebRecordingGameName) == "function" and getWebRecordingGameName(rec)) or ""
                if (placeIdBefore == "" or ownerBefore == "" or gameNameBefore == "") and type(fetchWebRecordingDetail) == "function" and getWebRecordingIdentifier(rec) then
                    local detail = fetchWebRecordingDetail(rec, scope)
                    if type(detail) == "table" then
                        for k, v in pairs(detail) do
                            if rec[k] == nil or rec[k] == "" then rec[k] = v end
                        end
                    end
                end
            end
            local placeId = getRecordingPlaceId(rec)
            if type(rec) == "table" and placeId ~= "" then
                rec._arexansPlaceId = placeId
                if type(getWebRecordingGameName) == "function" then
                    local existingName = getWebRecordingGameName(rec)
                    if existingName ~= "" then rec._arexansPlaceName = existingName end
                end
                if (not rec._arexansPlaceName or rec._arexansPlaceName == "") and type(getWebRecordingPlaceName) == "function" then
                    rec._arexansPlaceName = getWebRecordingPlaceName(placeId)
                end
                rec._arexansPlaceUrl = "https://www.roblox.com/games/" .. tostring(placeId)
            end
            local title = (type(getWebRecordingTitle) == "function" and getWebRecordingTitle(rec)) or tostring(rec.title or rec.name or rec.id or "Rekaman Web")
            local owner = (type(getWebRecordingOwnerName) == "function" and getWebRecordingOwnerName(rec)) or ""
            local placeName = tostring((type(rec) == "table" and rec._arexansPlaceName) or ((type(getWebRecordingGameName) == "function" and getWebRecordingGameName(rec)) or ""))
            local haystack = (title .. " " .. owner .. " " .. placeId .. " " .. placeName):lower()
            local matchSearch = queryFilter == "" or haystack:find(queryFilter, 1, true)
            local matchPlace = (not thisPlaceOnly) or recordMatchesCurrentPlace(rec)
            if matchSearch and matchPlace then
                table.insert(filtered, rec)
            end
        end
        return filtered
    end

    function importSingleRecordingFromWeb(rec, scope)
        if type(rec) ~= "table" then
            showNotification("File rekaman web tidak valid.", Color3.fromRGB(200, 50, 50))
            return false
        end
        local payload = normalizeWebRecordingPayload(rec)
        if type(payload) ~= "table" and type(fetchWebRecordingDetail) == "function" then
            local detail = fetchWebRecordingDetail(rec, scope)
            if type(detail) == "table" then
                rec = detail
                payload = normalizeWebRecordingPayload(rec)
            end
        end
        if type(payload) ~= "table" then
            showNotification("Data rekaman web tidak valid.", Color3.fromRGB(200, 50, 50))
            return false
        end
        local title = (type(getWebRecordingTitle) == "function" and getWebRecordingTitle(rec)) or tostring(rec.title or rec.name or "Rekaman Web")
        local normalizedScope = tostring(scope or ""):lower()
        local isMine = rec.owned == true or rec.is_owner == true or normalizedScope == "mine"
        local prefix = (isMine and "[Saya] " or "[Public] ") .. title
        local imported = mergeRecordingPayload(payload, prefix)
        if imported > 0 then
            saveRecordingsData()
            if updateRecordingsList then updateRecordingsList() end
            showNotification(imported .. " rekaman berhasil diimpor.", Color3.fromRGB(50, 200, 50))
            return true
        end
        showNotification("Tidak ada data rekaman yang bisa diimpor.", Color3.fromRGB(200, 150, 50))
        return false
    end


    function getWebRecordingIdentifier(rec)
        if type(rec) ~= "table" then return nil end
        return rec.id or rec.recording_id or rec.recordingId or rec.uuid or rec.uid
    end

    function mutateWebRecording(rec, action, extra)
        local key = getRecordingOwnerKey()
        if not key then return false, "AXS key session tidak ditemukan" end
        if type(rec) ~= "table" then return false, "File rekaman tidak valid" end
        local bodyTable = {
            action = action,
            key = key,
            id = getWebRecordingIdentifier(rec),
            recordingId = getWebRecordingIdentifier(rec),
            title = rec.title or rec.name,
            oldTitle = rec.title or rec.name,
            username = getCurrentRobloxUsername(),
            robloxUsername = getCurrentRobloxUsername(),
            gameId = tostring(game.PlaceId),
            placeId = tostring(game.PlaceId),
            role = tostring(currentUserRole or ""),
            isDeveloper = (type(isGradientRole) == "function" and isGradientRole()) or (function() local __r=tostring(currentUserRole or ""):upper() return __r=="DEVELOPER" or __r=="LIFETIME" end)(),
            developerOverride = (type(isGradientRole) == "function" and isGradientRole()) or (function() local __r=tostring(currentUserRole or ""):upper() return __r=="DEVELOPER" or __r=="LIFETIME" end)(),
        }
        if type(extra) == "table" then
            for k, v in pairs(extra) do bodyTable[k] = v end
        end
        local res = arexansHttpRequest({
            Url = RECORDING_SYNC_API,
            Method = "POST",
            Headers = {["Content-Type"] = "application/json"},
            Body = HttpService:JSONEncode(bodyTable),
        })
        if not res or not res.Body then return false, "Tidak ada response" end
        local ok, decoded = pcall(function() return HttpService:JSONDecode(res.Body) end)
        if ok and decoded and decoded.success then return true, decoded end
        return false, (ok and decoded and decoded.error) or "Request gagal"
    end

    function renameRecordingOnWeb(rec, newTitle, scope)
        newTitle = newTitle and tostring(newTitle):gsub("^%s+", ""):gsub("%s+$", "") or ""
        if newTitle == "" then return false, "Nama baru kosong" end
        local lastErr = nil
        for _, action in ipairs({"rename", "update_title", "updateTitle", "update"}) do
            local ok, resultOrErr = mutateWebRecording(rec, action, {
                newTitle = newTitle,
                newName = newTitle,
                name = newTitle,
                updatedTitle = newTitle,
                scope = scope,
                targetScope = scope,
            })
            if ok then return true, resultOrErr end
            lastErr = resultOrErr
        end
        showNotification("Gagal mengubah nama file: " .. tostring(lastErr or "unknown"), Color3.fromRGB(200, 50, 50))
        return false, lastErr
    end

    function deleteRecordingFromWeb(rec, scope, silent)
        local lastErr = nil
        for _, action in ipairs({"delete", "remove"}) do
            local ok, resultOrErr = mutateWebRecording(rec, action, {scope = scope, targetScope = scope})
            if ok then return true, resultOrErr end
            lastErr = resultOrErr
        end
        if not silent then
            showNotification("Gagal menghapus file: " .. tostring(lastErr or "unknown"), Color3.fromRGB(200, 50, 50))
        end
        return false, lastErr
    end

    function normalizeRecordingWebDeleteTitle(value)
        local text = tostring(value or "")
        text = getFileNameFromPath(text)
        text = text:gsub("%.[jJ][sS][oO][nN]$", "")
        text = text:gsub("^%s+", ""):gsub("%s+$", "")
        text = text:gsub("%s+", " ")
        return text:lower()
    end

    function collectLocalRecordingDeleteSources(value, sources, seen)
        sources = sources or {}
        seen = seen or {}
        if type(value) ~= "table" or seen[value] then return sources end
        seen[value] = true
        table.insert(sources, value)
        for _, key in ipairs({
            "metadata", "meta", "webMeta", "web_meta", "_arexansMeta", "_arexans_meta", "_arexans",
            "info", "details", "attributes", "recordingMeta", "recording_meta", "fileMeta", "file_meta",
            "upload", "uploader", "creator", "ownerInfo", "owner_info", "user", "owner",
            "game", "map", "place", "experience", "universe"
        }) do
            collectLocalRecordingDeleteSources(value[key], sources, seen)
        end
        if not value.frames then
            for _, child in pairs(value) do
                if type(child) == "table" then
                    collectLocalRecordingDeleteSources(child, sources, seen)
                end
            end
        end
        return sources
    end

    function getLocalRecordingDeleteText(payload, keys)
        local sources = collectLocalRecordingDeleteSources(payload)
        for _, source in ipairs(sources) do
            for _, key in ipairs(keys) do
                local text = arexansCleanWebText(source[key], true)
                if text ~= "" then return text end
            end
        end
        return ""
    end

    function deleteMatchingLocalRecordingFromWeb(entry, decodedPayload)
        if type(entry) ~= "table" then return true, "", 0 end
        if type(fetchRecordingsFromWeb) ~= "function" or type(deleteRecordingFromWeb) ~= "function" then
            return true, "", 0
        end

        local wantedTitles, wantedTitleLookup = {}, {}
        local function addWantedTitle(value)
            local normalized = normalizeRecordingWebDeleteTitle(value)
            if normalized ~= "" and not wantedTitleLookup[normalized] then
                wantedTitleLookup[normalized] = true
                table.insert(wantedTitles, normalized)
            end
        end

        addWantedTitle(entry.fileName)
        addWantedTitle(entry.title)
        if type(decodedPayload) == "table" then
            addWantedTitle(decodedPayload.title)
            addWantedTitle(decodedPayload.name)
            addWantedTitle(decodedPayload.fileName)
            addWantedTitle(decodedPayload.file_name)
            addWantedTitle(getLocalRecordingDeleteText(decodedPayload, {"title", "name", "fileName", "file_name"}))
        end

        if #wantedTitles == 0 then return true, "", 0 end

        local wantedPlaceId = ""
        if type(decodedPayload) == "table" then
            wantedPlaceId = getLocalRecordingDeleteText(decodedPayload, {
                "placeId", "place_id", "robloxPlaceId", "roblox_place_id", "gameId", "game_id"
            })
        end

        local function recordTitleMatches(rec)
            local titleValues = {
                rec and rec.title, rec and rec.name, rec and rec.fileName, rec and rec.file_name,
                rec and rec.filename, rec and rec.file, rec and rec.localFileName, rec and rec.local_file_name
            }
            if type(getWebRecordingTitle) == "function" then
                table.insert(titleValues, getWebRecordingTitle(rec))
            end
            for _, value in ipairs(titleValues) do
                local normalized = normalizeRecordingWebDeleteTitle(value)
                if normalized ~= "" and wantedTitleLookup[normalized] then return true end
            end
            return false
        end

        local function recordPlaceMatches(rec)
            if wantedPlaceId == "" then return true end
            if type(getWebRecordingPlaceId) ~= "function" then return true end
            local webPlaceId = tostring(getWebRecordingPlaceId(rec) or "")
            return webPlaceId == "" or webPlaceId == tostring(wantedPlaceId)
        end

        local function recordOwnerMatches(rec, fetchedScope)
            if tostring(fetchedScope or ""):lower() == "mine" then return true end
            if type(isWebRecordingOwnedByMe) == "function" and isWebRecordingOwnedByMe(rec) then return true end
            local owner = type(getWebRecordingOwnerName) == "function" and getWebRecordingOwnerName(rec) or ""
            owner = arexansCleanWebText(owner, true):lower()
            if owner == "" then return false end
            local username = arexansCleanWebText(getCurrentRobloxUsername(), true):lower()
            local displayName = arexansCleanWebText(getCurrentRobloxDisplayName(), true):lower()
            return owner == username or owner == displayName
        end

        local matched, seen = {}, {}
        local function addMatchedWebDeleteCandidate(rec, fetchScope)
            if type(rec) ~= "table" then return end
            fetchScope = tostring(fetchScope or "")
            if fetchScope == "" then fetchScope = "public" end
            if recordTitleMatches(rec) and recordPlaceMatches(rec) and recordOwnerMatches(rec, fetchScope) then
                rec._arexansDeleteScope = fetchScope
                local id = tostring((type(getWebRecordingIdentifier) == "function" and getWebRecordingIdentifier(rec)) or rec.title or rec.name or rec.fileName or rec.file_name or rec) .. "|" .. fetchScope
                if not seen[id] then
                    seen[id] = true
                    table.insert(matched, rec)
                end
            end
        end

        -- Pakai cache dari window Import Rekaman dulu, supaya hapus file lokal tidak selalu menarik ulang daftar web.
        local cachedWeb = _G.ArexansRecordingImportWebCache
        if type(cachedWeb) == "table" then
            for _, cached in pairs(cachedWeb) do
                if type(cached) == "table" and type(cached.entries) == "table" then
                    for _, cachedEntry in ipairs(cached.entries) do
                        local rec = type(cachedEntry) == "table" and (cachedEntry.raw or cachedEntry) or nil
                        local entryScope = type(cachedEntry) == "table" and cachedEntry.scope or nil
                        addMatchedWebDeleteCandidate(rec, entryScope or cached.scope or "public")
                    end
                end
            end
        end

        if #matched == 0 then
            for _, query in ipairs(wantedTitles) do
                for _, fetchScope in ipairs({"mine", "public"}) do
                    local records = nil
                    local okFetch, result = pcall(function()
                        return fetchRecordingsFromWeb(fetchScope, query, false)
                    end)
                    if okFetch and type(result) == "table" then records = result end
                    if records then
                        for _, rec in ipairs(records) do
                            addMatchedWebDeleteCandidate(rec, fetchScope)
                        end
                    end
                end
            end
        end

        if #matched == 0 then return true, "", 0 end

        local function removeDeletedWebRecordFromImportCache(deletedRec)
            local cachedWeb = _G.ArexansRecordingImportWebCache
            if type(cachedWeb) ~= "table" or type(deletedRec) ~= "table" then return end
            local deletedId = tostring((type(getWebRecordingIdentifier) == "function" and getWebRecordingIdentifier(deletedRec)) or deletedRec.id or deletedRec.recording_id or deletedRec.recordingId or "")
            local deletedTitle = normalizeRecordingWebDeleteTitle((type(getWebRecordingTitle) == "function" and getWebRecordingTitle(deletedRec)) or deletedRec.title or deletedRec.name or deletedRec.fileName or deletedRec.file_name)
            for _, cached in pairs(cachedWeb) do
                if type(cached) == "table" and type(cached.entries) == "table" then
                    for i = #cached.entries, 1, -1 do
                        local entry = cached.entries[i]
                        local rec = type(entry) == "table" and (entry.raw or entry) or nil
                        if type(rec) == "table" then
                            local recId = tostring((type(getWebRecordingIdentifier) == "function" and getWebRecordingIdentifier(rec)) or rec.id or rec.recording_id or rec.recordingId or "")
                            local recTitle = normalizeRecordingWebDeleteTitle((type(getWebRecordingTitle) == "function" and getWebRecordingTitle(rec)) or rec.title or rec.name or rec.fileName or rec.file_name)
                            if (deletedId ~= "" and recId == deletedId) or (deletedTitle ~= "" and recTitle == deletedTitle and recordPlaceMatches(rec)) then
                                table.remove(cached.entries, i)
                            end
                        end
                    end
                end
            end
        end

        local deletedCount, lastErr = 0, nil
        for _, rec in ipairs(matched) do
            local okDelete, deleteResult = false, nil
            local scopeOrder, scopeSeen = {"public", rec._arexansDeleteScope, "mine", "all"}, {}
            for _, scope in ipairs(scopeOrder) do
                scope = tostring(scope or "")
                if scope ~= "" and not scopeSeen[scope] then
                    scopeSeen[scope] = true
                    okDelete, deleteResult = deleteRecordingFromWeb(rec, scope, true)
                    if okDelete then break end
                    lastErr = deleteResult
                end
            end
            if okDelete then
                deletedCount = deletedCount + 1
                removeDeletedWebRecordFromImportCache(rec)
            end
        end

        if deletedCount > 0 then
            return true, "Data Public web ikut dihapus.", deletedCount
        end
        return false, tostring(lastErr or "Gagal menghapus data Public web."), 0
    end

    function importRecordingsFromWeb(scope, queryFilter)
        local recordings, err = fetchRecordingsFromWeb(scope, queryFilter)
        if not recordings then
            showNotification(err or "Gagal mengambil rekaman web.", Color3.fromRGB(200, 50, 50))
            return
        end
        local imported = 0
        for _, rec in ipairs(recordings) do
            local payload = normalizeWebRecordingPayload(rec)
            local title = (type(getWebRecordingTitle) == "function" and getWebRecordingTitle(rec)) or tostring(rec.title or rec.name or "Rekaman Web")
            local normalizedScope = tostring(scope or ""):lower()
            local isMine = rec.owned == true or rec.is_owner == true or normalizedScope == "mine"
            local prefix = (isMine and "[Saya] " or "[Public] ") .. title
            imported = imported + mergeRecordingPayload(payload, prefix)
        end
        if imported > 0 then
            saveRecordingsData()
            if updateRecordingsList then updateRecordingsList() end
            showNotification(imported .. " rekaman web diimpor.", Color3.fromRGB(50, 200, 50))
        else
            showNotification("Tidak ada rekaman web baru.", Color3.fromRGB(200, 150, 50))
        end
    end


    function isDeveloperRecordingManager()
        local role = tostring(currentUserRole or userRole or ""):upper()
        return role == "DEVELOPER" or role == "LIFETIME" or (type(isGradientRole) == "function" and isGradientRole() == true)
    end

    local webRecordingPlaceNameCache = {}

    function getWebRecordingPlaceId(rec)
        if type(rec) ~= "table" then return "" end
        local function cleanId(value)
            if value == nil then return "" end
            if type(value) == "table" then
                value = value.placeId or value.place_id or value.robloxPlaceId or value.roblox_place_id or value.robloxId or value.roblox_id or value.id or value.assetId or value.asset_id
            end
            local text = tostring(value or ""):gsub("^%s+", ""):gsub("%s+$", "")
            local lower = text:lower()
            if text == "" or lower == "nil" or lower == "null" or lower == "unknown" or lower == "all game" then return "" end
            local digits = text:match("roblox%.com/games/(%d+)") or text:match("/games/(%d+)") or text:match("placeId[=:]%s*(%d+)") or text:match("place_id[=:]%s*(%d+)") or text:match("(%d+)")
            return digits or ""
        end
        local sources = getWebRecordingMetadataSources(rec)
        local keys = {
            "_arexansPlaceId", "placeId", "place_id", "robloxPlaceId", "roblox_place_id",
            "placeUrl", "place_url", "gameUrl", "game_url", "robloxUrl", "roblox_url", "url", "link",
            "gameId", "game_id", "assetId", "asset_id", "universePlaceId", "universe_place_id",
        }
        for _, source in ipairs(sources) do
            for _, key in ipairs(keys) do
                local id = cleanId(source[key])
                if id ~= "" then return id end
            end
        end
        return ""
    end

    function getWebRecordingPlaceUrl(rec)
        if type(rec) ~= "table" then return "" end
        local url = pickWebRecordingText(rec, {"placeUrl", "place_url", "gameUrl", "game_url", "robloxUrl", "roblox_url", "url", "link"}, true)
        if url ~= "" then return url end
        local placeId = getWebRecordingPlaceId(rec)
        if placeId ~= "" then return "https://www.roblox.com/games/" .. tostring(placeId) end
        return ""
    end

    function getWebRecordingPlaceName(placeId)
        local id = tostring(placeId or ""):gsub("^%s+", ""):gsub("%s+$", "")
        if id == "" then return "" end
        if webRecordingPlaceNameCache[id] ~= nil then return webRecordingPlaceNameCache[id] end

        local placeName = ""
        if id == tostring(game.PlaceId) and type(getCurrentMapName) == "function" then
            pcall(function() placeName = tostring(getCurrentMapName() or "") end)
        end
        if placeName == "" then
            pcall(function()
                local info = game:GetService("MarketplaceService"):GetProductInfo(tonumber(id) or id)
                if type(info) == "table" and info.Name and tostring(info.Name) ~= "" then
                    placeName = tostring(info.Name)
                end
            end)
        end
        if placeName == "" then placeName = "Place " .. id end
        webRecordingPlaceNameCache[id] = placeName
        return placeName
    end

    function getWebRecordingTitle(rec)
        if type(rec) ~= "table" then return "Rekaman Web" end

        local owner = ""
        if type(getWebRecordingOwnerName) == "function" then
            owner = arexansCleanWebText(getWebRecordingOwnerName(rec), true):lower()
        end

        local function validTitle(value)
            local text = arexansCleanWebText(value, true)
            if text == "" then return nil end
            if owner ~= "" and text:lower() == owner then return nil end
            return text
        end

        -- Judul utama database web diutamakan nama map/game Roblox, termasuk metadata yang tersimpan di dalam recordingData.
        local gameTitle = type(getWebRecordingGameName) == "function" and getWebRecordingGameName(rec) or ""
        gameTitle = validTitle(gameTitle)
        if gameTitle then return gameTitle end

        local placeId = (type(getWebRecordingPlaceId) == "function" and getWebRecordingPlaceId(rec)) or ""
        if placeId ~= "" then
            local placeName = type(getWebRecordingPlaceName) == "function" and getWebRecordingPlaceName(placeId) or ""
            placeName = validTitle(placeName)
            if placeName then return placeName end
            return "Place " .. placeId
        end

        local fallbackTitle = validTitle(rec.title or rec.name or rec.file_name or rec.fileName or rec.filename)
        if fallbackTitle then return fallbackTitle end

        local recId = arexansCleanWebText(rec.id or rec.recording_id or rec.recordingId, true)
        if recId ~= "" then return "Rekaman " .. recId end
        return "Rekaman Web"
    end

    function getWebRecordingOwnerName(rec)
        if type(rec) ~= "table" then return "" end
        local owner = pickWebRecordingText(rec, {
            "username", "robloxUsername", "roblox_username", "userName", "user_name",
            "ownerUsername", "owner_username", "ownerUserName", "owner_user_name",
            "owner_name", "ownerName", "owner", "uploadedBy", "uploaded_by",
            "uploader", "author", "creator", "created_by", "createdBy",
            "playerName", "player_name"
        }, true)
        if owner ~= "" then return owner end

        local function scanOwnerContainers(root)
            if type(root) ~= "table" then return "" end
            for _, container in ipairs({root.user, root.owner, root.uploader, root.creator, root.author, root.createdBy, root.created_by}) do
                if type(container) == "table" then
                    local name = arexansCleanWebText(container.username or container.robloxUsername or container.userName or container.name or container.displayName or container.display_name, true)
                    if name ~= "" then return name end
                end
            end
            return ""
        end

        owner = scanOwnerContainers(rec)
        if owner ~= "" then return owner end
        local payload = normalizeWebRecordingPayload(rec)
        if type(payload) == "table" and payload ~= rec then
            owner = scanOwnerContainers(payload)
            if owner ~= "" then return owner end
        end
        return ""
    end

    function copyWebRecordingPlaceLink(rec)
        local placeId = (type(getWebRecordingPlaceId) == "function" and getWebRecordingPlaceId(rec)) or ""
        local url = (type(getWebRecordingPlaceUrl) == "function" and getWebRecordingPlaceUrl(rec)) or ""
        if url == "" and placeId ~= "" then
            url = "https://www.roblox.com/games/" .. tostring(placeId)
        end
        if url == "" then
            showNotification("Link map/game Roblox tidak ditemukan.", Color3.fromRGB(200, 150, 50))
            return false
        end
        if not setclipboard then
            showNotification("Executor tidak mendukung clipboard.", Color3.fromRGB(200, 150, 50))
            return false
        end
        local okCopy, errCopy = pcall(setclipboard, url)
        if okCopy then
            showNotification("Link map/game Roblox disalin.", Color3.fromRGB(50, 200, 50))
            return true
        end
        showNotification("Gagal menyalin link Roblox.", Color3.fromRGB(200, 50, 50))
        return false, errCopy
    end

    function visitWebRecordingPlace(rec)
        local placeId = (type(getWebRecordingPlaceId) == "function" and getWebRecordingPlaceId(rec)) or ""
        if placeId == "" then
            showNotification("Place ID map/game tidak ditemukan.", Color3.fromRGB(200, 150, 50))
            return false
        end
        local url = (type(getWebRecordingPlaceUrl) == "function" and getWebRecordingPlaceUrl(rec)) or ("https://www.roblox.com/games/" .. tostring(placeId))
        local numPlaceId = tonumber(placeId) or tonumber(tostring(placeId):match("%d+") or "")
        local currentPlace = tonumber(tostring(game.PlaceId))
        if numPlaceId and currentPlace and numPlaceId == currentPlace then
            showNotification("Kamu sudah berada di map/game ini.", Color3.fromRGB(50, 200, 50))
            return true
        end
        local teleportService = TeleportService or (game.GetService and game:GetService("TeleportService"))
        local players = game:GetService("Players")
        local player = LocalPlayer or (players and players.LocalPlayer)
        local target = numPlaceId or placeId
        showNotification("Berpindah ke map/game: " .. tostring(getWebRecordingPlaceName(placeId)), Color3.fromRGB(50, 200, 50))
        local qot = rawget(getfenv(), "queue_on_teleport") or rawget(getfenv(), "queueonteleport")
        if type(qot) == "function" then pcall(qot, "-- Arexanstools teleport marker\n") end
        local attempts = {
            function() return teleportService:Teleport(target, player) end,
            function() return teleportService:Teleport(target) end,
            function()
                local opts = Instance.new("TeleportOptions")
                return teleportService:TeleportAsync(target, {player}, opts)
            end,
        }
        local lastErr
        for _, fn in ipairs(attempts) do
            local ok, err = pcall(fn)
            if ok then return true end
            lastErr = err
        end
        if setclipboard and url ~= "" then pcall(setclipboard, url) end
        showNotification("Gagal teleport (" .. tostring(lastErr or "unknown") .. "). Link Roblox disalin.", Color3.fromRGB(200, 150, 50))
        return false, lastErr
    end

    function isWebRecordingOwnedByMe(rec)
        if type(rec) ~= "table" then return false end
        if rec.owned == true or rec.is_owner == true or rec.isOwner == true or rec.mine == true or rec.isMine == true then return true end
        local mine = {}
        local function addMine(value)
            if value ~= nil then
                local text = tostring(value)
                if text ~= "" then mine[text:lower()] = true end
            end
        end
        addMine(getRecordingOwnerKey())
        if LocalPlayer then
            addMine(LocalPlayer.Name)
            addMine(LocalPlayer.DisplayName)
            addMine(LocalPlayer.UserId)
        end
        if type(sessionInfo) == "table" then
            addMine(sessionInfo.key)
            addMine(sessionInfo.username)
            addMine(sessionInfo.userName)
            addMine(sessionInfo.name)
            addMine(sessionInfo.userId)
            addMine(sessionInfo.userid)
            addMine(sessionInfo.owner)
        end
        local fields = {
            rec.owner_key, rec.ownerKey, rec.user_key, rec.userKey, rec.creator_key, rec.creatorKey,
            rec.key, rec.owner_id, rec.ownerId, rec.user_id, rec.userId, rec.userid, rec.created_by,
            rec.createdBy, rec.username, rec.user_name, rec.userName, rec.owner_name, rec.ownerName,
            rec.owner, rec.user, rec.author
        }
        for _, value in ipairs(fields) do
            if value ~= nil then
                local text = tostring(value)
                if text ~= "" and mine[text:lower()] then return true end
            end
        end
        return false
    end

    function canManageWebRecording(rec)
        return isDeveloperRecordingManager() or isWebRecordingOwnedByMe(rec)
    end

    function fetchWebRecordingDetail(rec, scope)
        if type(rec) ~= "table" then return nil end
        local hasPayload = normalizeWebRecordingPayload(rec) ~= nil
        if hasPayload then
            local hasOwner = (type(getWebRecordingOwnerName) == "function" and getWebRecordingOwnerName(rec) ~= "")
            local hasGame = (type(getWebRecordingGameName) == "function" and getWebRecordingGameName(rec) ~= "")
            local hasPlace = (type(getWebRecordingPlaceId) == "function" and getWebRecordingPlaceId(rec) ~= "")
            if hasOwner and (hasGame or hasPlace) then return rec end
        end
        local recordingId = getWebRecordingIdentifier(rec)
        if not recordingId then return rec end
        local key = getRecordingOwnerKey()
        local currentPlaceId = tostring(game.PlaceId)
        local function readDetailResponse(res)
            if not res or not res.Body then return nil end
            local ok, decoded = pcall(function() return HttpService:JSONDecode(res.Body) end)
            if not ok or type(decoded) ~= "table" then return nil end
            local detail = decoded.recording or decoded.file or decoded.item or decoded.result or decoded.row or decoded.data
            if type(detail) == "table" then
                if type(detail.recording) == "table" then detail = detail.recording end
                if type(detail.file) == "table" then detail = detail.file end
                if type(detail.item) == "table" then detail = detail.item end
                for k, v in pairs(rec) do
                    if detail[k] == nil then detail[k] = v end
                end
                return detail
            end
            return nil
        end
        local baseUrl = RECORDING_SYNC_API .. "?action=get&scope=" .. arexansUrlEncode(scope or "all") .. "&id=" .. arexansUrlEncode(recordingId) .. "&recordingId=" .. arexansUrlEncode(recordingId)
        baseUrl = baseUrl .. "&gameId=" .. arexansUrlEncode(currentPlaceId) .. "&placeId=" .. arexansUrlEncode(currentPlaceId) .. "&includeMetadata=true&includeGameInfo=true&includePlaceInfo=true&includeRecordingData=true&_ts=" .. arexansUrlEncode(tostring(os.time()))
        if key then baseUrl = baseUrl .. "&key=" .. arexansUrlEncode(key) end
        local detail = readDetailResponse(arexansHttpRequest({Url = baseUrl, Method = "GET"}))
        if detail then return detail end
        for _, actionName in ipairs({"get", "read", "detail", "fetch"}) do
            detail = readDetailResponse(arexansHttpRequest({
                Url = RECORDING_SYNC_API,
                Method = "POST",
                Headers = {["Content-Type"] = "application/json"},
                Body = HttpService:JSONEncode({
                    action = actionName,
                    scope = scope or "all",
                    key = key,
                    id = recordingId,
                    recordingId = recordingId,
                    gameId = currentPlaceId,
                    placeId = currentPlaceId,
                    includeMetadata = true,
                    includeGameInfo = true,
                    includePlaceInfo = true,
                    includeRecordingData = true,
                }),
            }))
            if detail then return detail end
        end
        return rec
    end

    function UI.showRecordingFilePicker(folderPath, localImportCallback)
        local pickerName = "RecordingFilePickerGUI"
        local existing = CoreGui and CoreGui:FindFirstChild(pickerName)
        if existing then pcall(function() existing:Destroy() end) end

        local gui = Instance.new("ScreenGui")
        gui.Name = pickerName
        gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
        gui.ResetOnSpawn = false
        gui.DisplayOrder = 250
        gui.Parent = CoreGui

        local importAccent = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
        local importWindowWidth, importWindowHeight = 260, 320
        local main

        local function themeImportElement(instance, propertyName)
            if not instance then return end
            if propertyName and registerThemeElement then
                pcall(function() registerThemeElement(instance, propertyName, instance[propertyName]) end)
            end
            pcall(function()
                instance:SetAttribute("ArexansThemeAccent", true)
                instance:SetAttribute("ArexansAllowDeveloperGradient", true)
                instance:SetAttribute("ArexansAllowDeveloperIconGradient", true)
                instance:SetAttribute("ArexansNoDeveloperGradient", false)
            end)
            if isGradientRole() then pcall(function() applyDeveloperGradient(instance) end) end
        end

        local function placeImportWindowLeftOfArexans()
            if not main or not main.Parent then return end
            local pad, gap = 6, 8
            local viewport = Vector2.new(0, 0)
            pcall(function()
                if workspace and workspace.CurrentCamera then viewport = workspace.CurrentCamera.ViewportSize end
            end)

            local x, y = pad, pad
            if MainFrame and MainFrame.Parent then
                local absPos = MainFrame.AbsolutePosition
                x = absPos.X - importWindowWidth - gap
                y = absPos.Y
            elseif viewport.X > 0 and viewport.Y > 0 then
                x = (viewport.X - importWindowWidth) / 2
                y = (viewport.Y - importWindowHeight) / 2
            end

            if viewport.X > 0 then x = math.max(pad, math.min(x, viewport.X - importWindowWidth - pad)) end
            if viewport.Y > 0 then y = math.max(pad, math.min(y, viewport.Y - importWindowHeight - pad)) end
            main.Position = UDim2.fromOffset(math.floor(x), math.floor(y))
        end

        main = Instance.new("Frame")
        main.Name = "RecordingImportWindow"
        main.AnchorPoint = Vector2.new(0, 0)
        main.Position = UDim2.fromOffset(6, 6)
        main.Size = UDim2.new(0, importWindowWidth, 0, importWindowHeight)
        main.BackgroundColor3 = Color3.fromRGB(8, 10, 16)
        main.BackgroundTransparency = 0.58
        main.BorderSizePixel = 0
        main.Parent = gui
        local mainCorner = Instance.new("UICorner", main)
        mainCorner.CornerRadius = UDim.new(0, 6)
        local mainStroke = Instance.new("UIStroke", main)
        mainStroke.Color = importAccent
        mainStroke.Thickness = 0.8
        mainStroke.Transparency = 0.38
        themeImportElement(mainStroke, "Color")
        placeImportWindowLeftOfArexans()
        task.defer(function()
            pcall(function() if RunService and RunService.RenderStepped then RunService.RenderStepped:Wait() end end)
            placeImportWindowLeftOfArexans()
        end)

        local titleBar = Instance.new("Frame")
        titleBar.Name = "TitleBar"
        titleBar.Size = UDim2.new(1, 0, 0, 20)
        titleBar.BackgroundTransparency = 1
        titleBar.Parent = main

        local title = Instance.new("TextLabel")
        title.Name = "Title"
        title.Size = UDim2.new(1, -28, 1, 0)
        title.Position = UDim2.new(0, 7, 0, 0)
        title.BackgroundTransparency = 1
        title.Font = Enum.Font.SourceSansBold
        title.Text = "Import Rekaman"
        title.TextColor3 = Color3.fromRGB(245, 245, 245)
        title.TextSize = 11
        title.TextXAlignment = Enum.TextXAlignment.Left
        title.Parent = titleBar

        local closeButton = Instance.new("TextButton")
        closeButton.Name = "CloseButton"
        closeButton.Size = UDim2.new(0, 17, 0, 17)
        closeButton.Position = UDim2.new(1, -21, 0, 2)
        closeButton.BackgroundTransparency = 1
        closeButton.BorderSizePixel = 0
        closeButton.Text = ""
        closeButton.Parent = titleBar
        local closeStroke = Instance.new("UIStroke", closeButton)
        closeStroke.Color = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
        closeStroke.Thickness = 0.7
        registerThemeElement(closeStroke, "Color", closeStroke.Color)
        themeImportElement(closeStroke, "Color")
        Instance.new("UICorner", closeButton).CornerRadius = UDim.new(0, 5)
        pcall(function()
            closeButton:SetAttribute("ArexansAllowDeveloperIconGradient", true)
            closeButton:SetAttribute("ArexansAllowDeveloperGradient", true)
            closeButton:SetAttribute("ArexansNoDeveloperGradient", false)
        end)
        if UI.applyIcon then
            UI.applyIcon(closeButton, UI.Icons.DeleteRecord or UI.Icons.Wastebasket or "82033033854562", Color3.fromRGB(255, 255, 255))
            local img = closeButton:FindFirstChild("ArexansIconImage")
            if img then
                img.Size = UDim2.new(0, 11, 0, 11)
                pcall(function() img:SetAttribute("ArexansAllowDeveloperIconGradient", true); img:SetAttribute("ArexansAllowDeveloperGradient", true); img:SetAttribute("ArexansNoDeveloperGradient", false) end)
                if isGradientRole() then pcall(function() applyDeveloperGradient(img) end) end
            end
        else closeButton.Text = "X" end
        UI.RegisterButtonEffect(closeButton)
        closeButton.MouseButton1Click:Connect(function() gui:Destroy() end)

        local tabsFrame = Instance.new("Frame")
        tabsFrame.Name = "Tabs"
        tabsFrame.Size = UDim2.new(1, -12, 0, 18)
        tabsFrame.Position = UDim2.new(0, 6, 0, 23)
        tabsFrame.BackgroundTransparency = 1
        tabsFrame.Parent = main
        local tabsLayout = Instance.new("UIListLayout", tabsFrame)
        tabsLayout.FillDirection = Enum.FillDirection.Horizontal
        tabsLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
        tabsLayout.VerticalAlignment = Enum.VerticalAlignment.Center
        tabsLayout.Padding = UDim.new(0, 3)

        local currentTab = "myfiles"
        local tabButtons = {}
        local updatePickerTabs
        local refreshPickerList
        local selectedPickerEntries = {}
        local currentPickerEntries = {}
        local webPickerCache = _G.ArexansRecordingImportWebCache
        if type(webPickerCache) ~= "table" then
            webPickerCache = {}
            _G.ArexansRecordingImportWebCache = webPickerCache
        end
        local bulkSelectButton, bulkDeleteButton
        local renderCurrentEntries, removeEntryFromCaches, deleteSelectedPickerEntries, toggleVisiblePickerSelection

        local function makePickerSelectionKey(entry)
            if type(entry) ~= "table" then return "" end
            if entry.kind == "local" then
                return "local:" .. tostring(entry.path or entry.fileName or entry.title or "")
            end
            local raw = entry.raw
            local id = (type(getWebRecordingIdentifier) == "function" and getWebRecordingIdentifier(raw)) or (type(raw) == "table" and (raw.id or raw.recording_id or raw.recordingId or raw.uuid or raw.uid))
            if id ~= nil and tostring(id) ~= "" then
                return "web:" .. tostring(entry.scope or "") .. ":" .. tostring(id)
            end
            local title = tostring(entry.title or (type(raw) == "table" and (raw.title or raw.name or raw.fileName or raw.file_name)) or "")
            return "web:" .. tostring(entry.scope or "") .. ":" .. title
        end

        local function isEntryBulkDeletable(entry)
            if type(entry) ~= "table" then return false end
            if entry.kind == "local" then return true end
            return entry.kind == "web" and type(canManageWebRecording) == "function" and canManageWebRecording(entry.raw)
        end

        local function getPickerVisibleCounts()
            local selectedCount, selectableCount = 0, 0
            for _, entry in ipairs(currentPickerEntries or {}) do
                if isEntryBulkDeletable(entry) then
                    selectableCount = selectableCount + 1
                    if selectedPickerEntries[makePickerSelectionKey(entry)] then selectedCount = selectedCount + 1 end
                end
            end
            return selectedCount, selectableCount
        end

        local function updateBulkControls()
            local selectedCount, selectableCount = getPickerVisibleCounts()
            if bulkSelectButton then
                bulkSelectButton.Text = (selectableCount > 0 and selectedCount == selectableCount) and "Batal Pilih" or "Pilih Semua"
                bulkSelectButton.TextTransparency = selectableCount > 0 and 0 or 0.45
            end
            if bulkDeleteButton then
                bulkDeleteButton.Text = "Hapus (" .. tostring(selectedCount) .. ")"
                bulkDeleteButton.TextTransparency = selectedCount > 0 and 0 or 0.45
            end
        end

        local function makeTab(label, tabKey)
            local btn = Instance.new("TextButton")
            btn.Name = tabKey .. "Tab"
            btn.Size = UDim2.new(0, 80, 0, 18)
            btn.BackgroundColor3 = Color3.fromRGB(12, 13, 17)
            btn.BackgroundTransparency = 0.72
            btn.BorderSizePixel = 0
            btn.Font = Enum.Font.SourceSansBold
            btn.Text = label
            btn.TextColor3 = Color3.fromRGB(210, 210, 210)
            btn.TextSize = 9
            btn.Parent = tabsFrame
            local corner = Instance.new("UICorner", btn)
            corner.CornerRadius = UDim.new(0, 5)
            local stroke = Instance.new("UIStroke", btn)
            stroke.Color = Color3.fromRGB(55, 58, 68)
            stroke.Thickness = 0.7
            stroke.Transparency = 0.18
            themeImportElement(stroke, "Color")
            tabButtons[tabKey] = {button = btn, stroke = stroke}
            UI.RegisterButtonEffect(btn)
            btn.MouseButton1Click:Connect(function()
                currentTab = tabKey
                selectedPickerEntries = {}
                if updatePickerTabs then updatePickerTabs() end
                if updateBulkControls then updateBulkControls() end
                if refreshPickerList then refreshPickerList(true) end
            end)
            return btn
        end
        makeTab("All", "all")
        makeTab("My Files", "myfiles")
        makeTab("Public", "public")

        local filterButton = Instance.new("TextButton")
        filterButton.Name = "ThisPlaceFilterButton"
        filterButton.Size = UDim2.new(1, -12, 0, 18)
        filterButton.Position = UDim2.new(0, 6, 0, 44)
        filterButton.BackgroundTransparency = 1
        filterButton.BorderSizePixel = 0
        filterButton.Font = Enum.Font.SourceSansBold
        filterButton.TextColor3 = Color3.fromRGB(230, 230, 230)
        filterButton.TextSize = 9
        filterButton.Text = "This Place: OFF"
        filterButton.Parent = main
        local filterStroke = Instance.new("UIStroke", filterButton)
        filterStroke.Color = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
        filterStroke.Thickness = 0.7
        registerThemeElement(filterStroke, "Color", filterStroke.Color)
        themeImportElement(filterStroke, "Color")
        Instance.new("UICorner", filterButton).CornerRadius = UDim.new(0, 6)
        UI.RegisterButtonEffect(filterButton)

        local topRow = Instance.new("Frame")
        topRow.Name = "SearchRefreshRow"
        topRow.Size = UDim2.new(1, -12, 0, 20)
        topRow.Position = UDim2.new(0, 6, 0, 66)
        topRow.BackgroundTransparency = 1
        topRow.Parent = main

        local searchBox = Instance.new("TextBox")
        searchBox.Name = "SearchBox"
        searchBox.Size = UDim2.new(1, -45, 1, 0)
        searchBox.Position = UDim2.new(0, 0, 0, 0)
        searchBox.BackgroundTransparency = 1
        searchBox.ClearTextOnFocus = false
        searchBox.Font = Enum.Font.SourceSans
        searchBox.PlaceholderText = "Cari..."
        searchBox.Text = ""
        searchBox.TextColor3 = Color3.fromRGB(225, 225, 225)
        searchBox.PlaceholderColor3 = Color3.fromRGB(145, 145, 145)
        searchBox.TextSize = 10
        searchBox.TextXAlignment = Enum.TextXAlignment.Left
        searchBox.Parent = topRow
        local searchPadding = Instance.new("UIPadding", searchBox)
        searchPadding.PaddingLeft = UDim.new(0, 6)
        local searchStroke = Instance.new("UIStroke", searchBox)
        searchStroke.Color = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
        searchStroke.Thickness = 0.7
        registerThemeElement(searchStroke, "Color", searchStroke.Color)
        themeImportElement(searchStroke, "Color")
        Instance.new("UICorner", searchBox).CornerRadius = UDim.new(0, 6)

        local refreshButton = Instance.new("TextButton")
        refreshButton.Name = "RefreshButton"
        refreshButton.Size = UDim2.new(0, 39, 1, 0)
        refreshButton.Position = UDim2.new(1, -39, 0, 0)
        refreshButton.BackgroundTransparency = 1
        refreshButton.BorderSizePixel = 0
        refreshButton.Font = Enum.Font.SourceSansBold
        refreshButton.Text = ""
        refreshButton.TextColor3 = Color3.fromRGB(255, 255, 255)
        refreshButton.TextSize = 9
        refreshButton.Parent = topRow
        local refreshStroke = Instance.new("UIStroke", refreshButton)
        refreshStroke.Color = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
        refreshStroke.Thickness = 0.7
        registerThemeElement(refreshStroke, "Color", refreshStroke.Color)
        themeImportElement(refreshStroke, "Color")
        Instance.new("UICorner", refreshButton).CornerRadius = UDim.new(0, 6)
        if UI.applyIcon then
            refreshButton.Text = ""
            UI.applyIcon(refreshButton, UI.Icons.Refresh or "R", Color3.fromRGB(255, 255, 255))
            local img = refreshButton:FindFirstChild("ArexansIconImage")
            if img then
                img.Size = UDim2.new(0, 12, 0, 12)
                img.Position = UDim2.new(0.5, 0, 0.5, 0)
                pcall(function() img:SetAttribute("ArexansAllowDeveloperIconGradient", true); img:SetAttribute("ArexansAllowDeveloperGradient", true); img:SetAttribute("ArexansNoDeveloperGradient", false) end)
                if isGradientRole() then pcall(function() applyDeveloperGradient(img) end) end
            end
        end
        pcall(function()
            refreshButton:SetAttribute("ArexansAllowDeveloperIconGradient", true)
            refreshButton:SetAttribute("ArexansAllowDeveloperGradient", true)
            refreshButton:SetAttribute("ArexansNoDeveloperGradient", false)
        end)
        UI.RegisterButtonEffect(refreshButton)

        local statusLabel = Instance.new("TextLabel")
        statusLabel.Name = "StatusLabel"
        statusLabel.Size = UDim2.new(1, -12, 0, 13)
        statusLabel.Position = UDim2.new(0, 6, 0, 88)
        statusLabel.BackgroundTransparency = 1
        statusLabel.Font = Enum.Font.SourceSansItalic
        statusLabel.Text = "Diperbarui --:-- • 0 item"
        statusLabel.TextColor3 = Color3.fromRGB(185, 185, 185)
        statusLabel.TextSize = 8
        statusLabel.TextXAlignment = Enum.TextXAlignment.Left
        statusLabel.Parent = main

        local bulkRow = Instance.new("Frame")
        bulkRow.Name = "BulkDeleteRow"
        bulkRow.Size = UDim2.new(1, -12, 0, 18)
        bulkRow.Position = UDim2.new(0, 6, 0, 102)
        bulkRow.BackgroundTransparency = 1
        bulkRow.Parent = main

        local function makeBulkButton(name, text, x, w)
            local btn = Instance.new("TextButton")
            btn.Name = name
            btn.Size = UDim2.new(w, -2, 1, 0)
            btn.Position = UDim2.new(x, 0, 0, 0)
            btn.BackgroundTransparency = 1
            btn.BorderSizePixel = 0
            btn.Font = Enum.Font.SourceSansBold
            btn.Text = text
            btn.TextColor3 = Color3.fromRGB(235, 235, 235)
            btn.TextSize = 9
            btn.Parent = bulkRow
            local stroke = Instance.new("UIStroke", btn)
            stroke.Color = importAccent
            stroke.Thickness = 0.7
            stroke.Transparency = 0.46
            themeImportElement(stroke, "Color")
            Instance.new("UICorner", btn).CornerRadius = UDim.new(0, 6)
            UI.RegisterButtonEffect(btn)
            return btn
        end

        bulkSelectButton = makeBulkButton("SelectAllButton", "Pilih Semua", 0, 0.5)
        bulkDeleteButton = makeBulkButton("DeleteSelectedButton", "Hapus (0)", 0.5, 0.5)
        bulkSelectButton.MouseButton1Click:Connect(function()
            if toggleVisiblePickerSelection then toggleVisiblePickerSelection() end
        end)
        bulkDeleteButton.MouseButton1Click:Connect(function()
            if deleteSelectedPickerEntries then deleteSelectedPickerEntries() end
        end)

        local list = Instance.new("ScrollingFrame")
        list.Name = "FileList"
        list.Size = UDim2.new(1, -12, 1, -126)
        list.Position = UDim2.new(0, 6, 0, 123)
        list.BackgroundTransparency = 1
        list.BorderSizePixel = 0
        list.CanvasSize = UDim2.new(0, 0, 0, 0)
        list.ScrollBarThickness = 2
        list.ScrollBarImageColor3 = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
        list.Parent = main
        registerThemeElement(list, "ScrollBarImageColor3", list.ScrollBarImageColor3)
        themeImportElement(list, "ScrollBarImageColor3")
        local listLayout = Instance.new("UIListLayout", list)
        listLayout.Padding = UDim.new(0, 3)
        listLayout.SortOrder = Enum.SortOrder.LayoutOrder

        local resizeHandle = Instance.new("TextButton")
        resizeHandle.Name = "ResizeHandle"
        resizeHandle.Size = UDim2.new(0, 15, 0, 15)
        resizeHandle.Position = UDim2.new(1, -15, 1, -15)
        resizeHandle.BackgroundColor3 = importAccent
        resizeHandle.BackgroundTransparency = 0.45
        resizeHandle.BorderSizePixel = 0
        resizeHandle.AutoButtonColor = false
        resizeHandle.Text = ""
        resizeHandle.ZIndex = 8
        resizeHandle.Parent = main
        themeImportElement(resizeHandle, "BackgroundColor3")
        Instance.new("UICorner", resizeHandle).CornerRadius = UDim.new(0, 4)

        local minImportSize = Vector2.new(220, 160)
        local isImportResizing = false
        local importResizeStartMouse, importResizeStartSize

        local function updateCanvas()
            if list and list.Parent and listLayout then
                list.CanvasSize = UDim2.new(0, 0, 0, listLayout.AbsoluteContentSize.Y + 8)
            end
        end
        listLayout:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(updateCanvas)
        main:GetPropertyChangedSignal("AbsoluteSize"):Connect(updateCanvas)

        resizeHandle.InputBegan:Connect(function(input)
            if not UserInputService then return end
            if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
                isImportResizing = true
                importResizeStartMouse = UserInputService:GetMouseLocation()
                importResizeStartSize = main.AbsoluteSize
            end
        end)
        UserInputService.InputChanged:Connect(function(input)
            if not isImportResizing or not importResizeStartMouse or not importResizeStartSize then return end
            if input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch then
                local delta = UserInputService:GetMouseLocation() - importResizeStartMouse
                local newWidth = math.max(minImportSize.X, importResizeStartSize.X + delta.X)
                local newHeight = math.max(minImportSize.Y, importResizeStartSize.Y + delta.Y)
                main.Size = UDim2.new(0, newWidth, 0, newHeight)
                updateCanvas()
            end
        end)
        UserInputService.InputEnded:Connect(function(input)
            if isImportResizing and (input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch) then
                isImportResizing = false
                importResizeStartMouse = nil
                importResizeStartSize = nil
            end
        end)

        local filterThisPlace = false
        local refreshSerial = 0

        local function setStatus(text)
            if statusLabel and statusLabel.Parent then statusLabel.Text = text end
        end

        local function clearRows()
            for _, child in ipairs(list:GetChildren()) do
                if child:IsA("Frame") or child:IsA("TextLabel") then child:Destroy() end
            end
        end

        local function makeInfoRow(text)
            clearRows()
            local info = Instance.new("TextLabel")
            info.Name = "InfoRow"
            info.Size = UDim2.new(1, 0, 0, 24)
            info.BackgroundTransparency = 1
            info.Font = Enum.Font.SourceSansItalic
            info.Text = text
            info.TextColor3 = Color3.fromRGB(190, 190, 190)
            info.TextSize = 9
            info.TextWrapped = true
            info.Parent = list
            updateCanvas()
        end

        local function makeSmallIcon(parent, icon, color, fallback)
            local btn = Instance.new("TextButton")
            btn.Size = UDim2.new(0, 18, 0, 18)
            btn.BackgroundTransparency = 1
            btn.BorderSizePixel = 0
            btn.Font = Enum.Font.SourceSansBold
            btn.Text = fallback or ""
            btn.TextColor3 = color or Color3.fromRGB(255, 255, 255)
            btn.TextSize = 9
            btn.Parent = parent
            pcall(function()
                btn:SetAttribute("ArexansAllowDeveloperIconGradient", true)
                btn:SetAttribute("ArexansAllowDeveloperGradient", true)
                btn:SetAttribute("ArexansNoDeveloperGradient", false)
            end)
            local stroke = Instance.new("UIStroke", btn)
            stroke.Color = importAccent
            stroke.Thickness = 0.7
            stroke.Transparency = 0.42
            themeImportElement(stroke, "Color")
            Instance.new("UICorner", btn).CornerRadius = UDim.new(0, 6)
            if UI.applyIcon then
                UI.applyIcon(btn, icon, color or Color3.fromRGB(255, 255, 255))
                local img = btn:FindFirstChild("ArexansIconImage")
                if img then
                    img.Size = UDim2.new(0, 12, 0, 12)
                    img.Position = UDim2.new(0.5, 0, 0.5, 0)
                    pcall(function()
                        img:SetAttribute("ArexansAllowDeveloperIconGradient", true)
                        img:SetAttribute("ArexansAllowDeveloperGradient", true)
                        img:SetAttribute("ArexansNoDeveloperGradient", false)
                    end)
                    if isGradientRole() then pcall(function() applyDeveloperGradient(img) end) end
                end
            end
            UI.RegisterButtonEffect(btn)
            return btn
        end

        local function getLocalEntries()
            local entries = {}
            safeMakeFolder(folderPath)
            if not listfiles then return entries, "Executor tidak mendukung listfiles." end
            local ok, files = pcall(listfiles, folderPath)
            if not ok or type(files) ~= "table" then return entries, "Gagal membaca folder rekaman." end
            local query = tostring(searchBox.Text or ""):lower()
            for _, path in ipairs(files) do
                local fullPath = tostring(path or "")
                local fileName = getFileNameFromPath(fullPath)
                if fullPath ~= "" and not fullPath:find("/", 1, true) and not fullPath:find("\\", 1, true) then fullPath = folderPath .. "/" .. fullPath end
                if tostring(fileName):lower():match("%.json$") then
                    local titleName = tostring(fileName):gsub("%.json$", "")
                    local haystack = (titleName .. " " .. fileName):lower()
                    if query == "" or haystack:find(query, 1, true) then
                        table.insert(entries, {kind = "local", title = titleName, fileName = fileName, path = fullPath})
                    end
                end
            end
            table.sort(entries, function(a, b) return tostring(a.title):lower() < tostring(b.title):lower() end)
            return entries
        end

        local function renameLocalEntry(entry, newName)
            if type(entry) ~= "table" then return false, "File tidak valid" end
            newName = tostring(newName or ""):gsub("%.json$", "")
            newName = sanitizeFileComponent(newName)
            if newName == "" then return false, "Nama baru kosong" end
            local newFileName = newName .. ".json"
            local newPath = folderPath .. "/" .. newFileName
            local oldPath = entry.path or (folderPath .. "/" .. tostring(entry.fileName or ""))
            if isfile and isfile(newPath) then return false, "File dengan nama itu sudah ada" end
            if not readfile or not writefile or not delfile then return false, "Executor tidak mendukung rename file" end
            local okRead, content = pcall(readfile, oldPath)
            if not okRead or not content then return false, "Gagal membaca file lama" end
            local okWrite, writeErr = pcall(writefile, newPath, content)
            if not okWrite then return false, tostring(writeErr or "Gagal menulis file baru") end
            pcall(delfile, oldPath)
            return true
        end

        local function deleteLocalEntry(entry)
            if type(entry) ~= "table" then return false, "File tidak valid" end
            if not delfile then return false, "Executor tidak mendukung hapus file" end
            local oldPath = entry.path or (folderPath .. "/" .. tostring(entry.fileName or ""))
            local decodedPayload = nil
            if readfile then
                pcall(function()
                    local content = readfile(oldPath)
                    if type(content) == "string" and content ~= "" then
                        local okDecode, decoded = pcall(function() return HttpService:JSONDecode(content) end)
                        if okDecode and type(decoded) == "table" then decodedPayload = decoded end
                    end
                end)
            end
            local okDelete, deleteErr = pcall(delfile, oldPath)
            if not okDelete then return false, tostring(deleteErr or "Gagal menghapus file") end

            local webOk, webMsg, webCount = true, "", 0
            if type(deleteMatchingLocalRecordingFromWeb) == "function" then
                local okSync, resultOk, resultMsg, resultCount = pcall(deleteMatchingLocalRecordingFromWeb, entry, decodedPayload)
                if okSync then
                    webOk, webMsg, webCount = resultOk ~= false, tostring(resultMsg or ""), tonumber(resultCount) or 0
                else
                    webOk, webMsg, webCount = false, tostring(resultOk or "Gagal sinkron hapus web."), 0
                end
            end
            return true, nil, webOk, webMsg, webCount
        end

        local function createRow(entry, orderIndex)
            local isLocal = entry.kind == "local"
            local entryKey = makePickerSelectionKey(entry)
            local isSelectableForDelete = isEntryBulkDeletable(entry)
            local row = Instance.new("Frame")
            row.Name = "RecordingRow"
            row.Size = UDim2.new(1, -1, 0, 66)
            row.BackgroundColor3 = Color3.fromRGB(12, 14, 22)
            row.BackgroundTransparency = 0.64
            row.BorderSizePixel = 0
            row.LayoutOrder = orderIndex
            row.Parent = list
            local rowCorner = Instance.new("UICorner", row)
            rowCorner.CornerRadius = UDim.new(0, 5)
            local rowStroke = Instance.new("UIStroke", row)
            rowStroke.Color = importAccent
            rowStroke.Thickness = 0.65
            rowStroke.Transparency = 0.58
            themeImportElement(rowStroke, "Color")

            local contentX = isSelectableForDelete and 28 or 7
            local contentCut = isSelectableForDelete and 78 or 56
            local selectBtn
            local function refreshSelectionVisual()
                local selected = selectedPickerEntries[entryKey] == true
                if selectBtn then
                    selectBtn.Text = selected and "✓" or ""
                    selectBtn.BackgroundTransparency = selected and 0.46 or 1
                end
                rowStroke.Transparency = selected and 0.2 or 0.58
            end
            if isSelectableForDelete then
                selectBtn = Instance.new("TextButton")
                selectBtn.Name = "SelectFileButton"
                selectBtn.Size = UDim2.new(0, 18, 0, 18)
                selectBtn.Position = UDim2.new(0, 5, 0.5, -9)
                selectBtn.BackgroundTransparency = 1
                selectBtn.BorderSizePixel = 0
                selectBtn.Font = Enum.Font.SourceSansBold
                selectBtn.Text = ""
                selectBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
                selectBtn.TextSize = 12
                selectBtn.Parent = row
                local selectStroke = Instance.new("UIStroke", selectBtn)
                selectStroke.Color = importAccent
                selectStroke.Thickness = 0.7
                selectStroke.Transparency = 0.38
                themeImportElement(selectStroke, "Color")
                Instance.new("UICorner", selectBtn).CornerRadius = UDim.new(0, 6)
                UI.RegisterButtonEffect(selectBtn)
                selectBtn.MouseButton1Click:Connect(function()
                    selectedPickerEntries[entryKey] = not selectedPickerEntries[entryKey]
                    refreshSelectionVisual()
                    updateBulkControls()
                end)
            end
            refreshSelectionVisual()

            if not _G.ArexansWebGameNameCache then _G.ArexansWebGameNameCache = {} end
            local function _resolveGameName(placeId, cb)
                if not placeId or placeId == "" then cb("") return end
                local cache = _G.ArexansWebGameNameCache
                if cache[placeId] then cb(cache[placeId]) return end
                task.spawn(function()
                    local ok, result = pcall(function()
                        local resp = game:HttpGet("https://apis.roproxy.com/universes/v1/places/" .. placeId .. "/universe")
                        local uid = tostring(resp):match('"universeId"%s*:%s*(%d+)')
                        if not uid then return nil end
                        local resp2 = game:HttpGet("https://games.roproxy.com/v1/games?universeIds=" .. uid)
                        return tostring(resp2):match('"name"%s*:%s*"([^"]+)"')
                    end)
                    if ok and result and result ~= "" then
                        cache[placeId] = result
                        cb(result)
                    else
                        cb("")
                    end
                end)
            end
            local function _formatDate(iso)
                if not iso or iso == "" then return "" end
                local y, mo, d, h, mi, s = tostring(iso):match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
                if not y then return tostring(iso) end
                return string.format("%d/%d/%s, %s.%s.%s", tonumber(d), tonumber(mo), y, h, mi, s)
            end

            local gameLabel = Instance.new("TextLabel")
            gameLabel.Name = "GameLine"
            gameLabel.Size = UDim2.new(1, -contentCut, 0, 13)
            gameLabel.Position = UDim2.new(0, contentX, 0, 5)
            gameLabel.BackgroundTransparency = 1
            gameLabel.Font = Enum.Font.SourceSansBold
            gameLabel.TextColor3 = importAccent
            gameLabel.TextSize = 10
            gameLabel.TextXAlignment = Enum.TextXAlignment.Left
            gameLabel.TextTruncate = Enum.TextTruncate.AtEnd
            gameLabel.Text = ""
            gameLabel.Parent = row
            themeImportElement(gameLabel, "TextColor3")

            local nameLabel = Instance.new("TextLabel")
            nameLabel.Name = "Name"
            nameLabel.Size = UDim2.new(1, -contentCut, 0, 15)
            nameLabel.Position = UDim2.new(0, contentX, 0, 23)
            nameLabel.BackgroundTransparency = 1
            nameLabel.Font = Enum.Font.SourceSansBold
            nameLabel.TextColor3 = Color3.fromRGB(240, 240, 240)
            nameLabel.TextSize = 11
            nameLabel.TextXAlignment = Enum.TextXAlignment.Left
            nameLabel.TextTruncate = Enum.TextTruncate.AtEnd
            nameLabel.Parent = row

            local metaLabel = Instance.new("TextLabel")
            metaLabel.Name = "Meta"
            metaLabel.Size = UDim2.new(1, -contentCut, 0, 13)
            metaLabel.Position = UDim2.new(0, contentX, 0, 43)
            metaLabel.BackgroundTransparency = 1
            metaLabel.Font = Enum.Font.SourceSansItalic
            metaLabel.TextColor3 = Color3.fromRGB(165, 165, 165)
            metaLabel.TextSize = 9
            metaLabel.TextXAlignment = Enum.TextXAlignment.Left
            metaLabel.TextTruncate = Enum.TextTruncate.AtEnd
            metaLabel.Parent = row

            if isLocal then
                gameLabel.Text = "Local File"
                local fname = tostring(entry.fileName or ((entry.title or "Rekaman") .. ".json"))
                nameLabel.Text = fname
                metaLabel.Text = "My Files"
            else
                local raw = entry.raw or {}
                local placeId = getWebRecordingPlaceId(raw)
                local owner = getWebRecordingOwnerName(raw)
                if owner == "" then owner = "Unknown" end
                local fileTitle = tostring(raw.title or raw.name or raw.file_name or raw.fileName or "Rekaman")
                if not fileTitle:lower():match("%.json$") then fileTitle = fileTitle .. ".json" end
                nameLabel.Text = fileTitle
                local dateStr = _formatDate(raw.updated_at or raw.updatedAt or raw.created_at or raw.createdAt or "")
                metaLabel.Text = owner .. (dateStr ~= "" and (" • " .. dateStr) or "")
                local gameTitle = (type(getWebRecordingGameName) == "function" and getWebRecordingGameName(raw)) or ""
                if placeId ~= "" then
                    if gameTitle ~= "" then
                        gameLabel.Text = gameTitle .. " • " .. placeId
                    else
                        gameLabel.Text = "Place " .. placeId
                    end
                    if gameTitle == "" or gameTitle == ("Place " .. placeId) then
                        _resolveGameName(placeId, function(name)
                            if gameLabel and gameLabel.Parent then
                                if name ~= "" then
                                    gameLabel.Text = name .. " • " .. placeId
                                else
                                    gameLabel.Text = "Place " .. placeId
                                end
                            end
                        end)
                    end
                elseif gameTitle ~= "" then
                    gameLabel.Text = gameTitle
                else
                    gameLabel.Text = "Map/Game tidak terbaca"
                end
            end

            local actions = Instance.new("Frame")
            actions.Name = "Actions"
            actions.Size = UDim2.new(0, 42, 0, 58)
            actions.Position = UDim2.new(1, -47, 0.5, -29)
            actions.BackgroundTransparency = 1
            actions.Parent = row

            local function placeActionButton(btn, column, rowIndex)
                if not btn then return end
                local x = column == 2 and 22 or 0
                local y = math.max(0, (tonumber(rowIndex) or 1) - 1) * 20
                btn.Position = UDim2.new(0, x, 0, y)
            end

            local copyLinkBtn = makeSmallIcon(actions, UI.Icons.Link or UI.Icons.ConnectorRecord or "112308837443850", Color3.fromRGB(255, 255, 255), "L")
            local visitBtn = makeSmallIcon(actions, UI.Icons.PlayButton or UI.Icons.Game or UI.Icons.Location or "6724789060", Color3.fromRGB(255, 255, 255), ">")
            local importBtn = makeSmallIcon(actions, UI.Icons.ImportFile or "99385102861455", Color3.fromRGB(255, 255, 255), "I")
            local editBtn = makeSmallIcon(actions, UI.Icons.Edit or UI.Icons.Pencil or "88134306391339", Color3.fromRGB(255, 255, 255), "E")
            local deleteBtn = makeSmallIcon(actions, UI.Icons.DeleteRecord or UI.Icons.Wastebasket or "82033033854562", Color3.fromRGB(255, 255, 255), "X")

            -- 3 baris sejajar: baris 1 link + kunjungi, baris 2 import + edit, baris 3 hapus.
            -- Icon kunjungi sengaja ditempatkan tepat di sebelah icon salin link Roblox.
            placeActionButton(copyLinkBtn, 1, 1)
            placeActionButton(visitBtn, 2, 1)
            placeActionButton(importBtn, 1, 2)
            placeActionButton(editBtn, 2, 2)
            placeActionButton(deleteBtn, 2, 3)

            if isLocal or getWebRecordingPlaceId(entry.raw) == "" then
                copyLinkBtn.Visible = false
                visitBtn.Visible = false
            end

            if not isLocal and not canManageWebRecording(entry.raw) then
                editBtn.Visible = false
                deleteBtn.Visible = false
            end

            copyLinkBtn.MouseButton1Click:Connect(function()
                if not isLocal then
                    copyWebRecordingPlaceLink(entry.raw)
                end
            end)

            visitBtn.MouseButton1Click:Connect(function()
                if not isLocal then
                    visitWebRecordingPlace(entry.raw)
                end
            end)

            importBtn.MouseButton1Click:Connect(function()
                if isLocal then
                    if type(localImportCallback) == "function" then localImportCallback(entry.fileName or entry.title) end
                    if gui and gui.Parent then gui:Destroy() end
                else
                    setStatus("Mengimpor rekaman web...")
                    task.spawn(function()
                        local raw = entry.raw
                        if type(fetchWebRecordingDetail) == "function" then
                            raw = fetchWebRecordingDetail(raw, entry.scope)
                        end
                        local okImport = importSingleRecordingFromWeb(raw, entry.scope)
                        if okImport and gui and gui.Parent then gui:Destroy() end
                        if gui and gui.Parent then refreshPickerList(false) end
                    end)
                end
            end)

            editBtn.MouseButton1Click:Connect(function()
                local oldTitle = tostring(entry.title or "")
                local newTitle = UI.promptInput("Masukkan nama baru untuk '" .. oldTitle .. "':")
                if not newTitle or tostring(newTitle):gsub("%s+", "") == "" then return end
                if isLocal then
                    local okRename, errRename = renameLocalEntry(entry, newTitle)
                    if okRename then
                        showNotification("Nama file diubah.", Color3.fromRGB(50, 200, 50))
                        refreshPickerList(true)
                    else
                        showNotification(tostring(errRename or "Gagal mengubah nama file."), Color3.fromRGB(200, 50, 50))
                    end
                else
                    if not canManageWebRecording(entry.raw) then
                        showNotification("Hanya Developer atau pemilik file yang bisa mengedit.", Color3.fromRGB(200, 150, 50))
                        return
                    end
                    setStatus("Mengubah nama rekaman web...")
                    task.spawn(function()
                        local okRename, errRename = renameRecordingOnWeb(entry.raw, newTitle, entry.scope)
                        if okRename then
                            showNotification("Nama rekaman web diubah.", Color3.fromRGB(50, 200, 50))
                            refreshPickerList(true)
                        else
                            showNotification(tostring(errRename or "Gagal mengubah nama rekaman web."), Color3.fromRGB(200, 50, 50))
                            refreshPickerList(false)
                        end
                    end)
                end
            end)

            deleteBtn.MouseButton1Click:Connect(function()
                local function doDelete()
                    if isLocal then
                        setStatus("Menghapus file lokal dan sinkron web...")
                        task.spawn(function()
                            local okDelete, errDelete, webOk, webMsg, webCount = deleteLocalEntry(entry)
                            if okDelete then
                                if webOk == false then
                                    showNotification("File lokal dihapus, sinkron web gagal: " .. tostring(webMsg or "unknown"), Color3.fromRGB(200, 150, 50))
                                elseif tonumber(webCount or 0) > 0 then
                                    showNotification("File rekaman dan data Public web dihapus.", Color3.fromRGB(50, 200, 50))
                                else
                                    showNotification("File rekaman dihapus.", Color3.fromRGB(50, 200, 50))
                                end
                                if removeEntryFromCaches then removeEntryFromCaches(entry) end
                                if renderCurrentEntries then renderCurrentEntries(currentPickerEntries, "Tidak ada file rekaman lokal.") end
                            else
                                showNotification(tostring(errDelete or "Gagal menghapus file."), Color3.fromRGB(200, 50, 50))
                                if renderCurrentEntries then renderCurrentEntries(currentPickerEntries, "Tidak ada file rekaman lokal.") end
                            end
                        end)
                    else
                        if not canManageWebRecording(entry.raw) then
                            showNotification("Hanya Developer atau pemilik file yang bisa menghapus.", Color3.fromRGB(200, 150, 50))
                            return
                        end
                        setStatus("Menghapus rekaman web...")
                        task.spawn(function()
                            local okDelete, errDelete = deleteRecordingFromWeb(entry.raw, entry.scope)
                            if okDelete then
                                showNotification("Rekaman web dihapus.", Color3.fromRGB(50, 200, 50))
                                if removeEntryFromCaches then removeEntryFromCaches(entry) end
                                if renderCurrentEntries then renderCurrentEntries(currentPickerEntries, "Tidak ada rekaman web pada tab ini.") end
                            else
                                showNotification(tostring(errDelete or "Gagal menghapus rekaman web."), Color3.fromRGB(200, 50, 50))
                                if renderCurrentEntries then renderCurrentEntries(currentPickerEntries, "Tidak ada rekaman web pada tab ini.") end
                            end
                        end)
                    end
                end
                if UI.showConfirmationPrompt then
                    UI.showConfirmationPrompt("Yakin ingin menghapus '" .. tostring(entry.title or "Rekaman") .. "'?", function(confirmed)
                        if confirmed then doDelete() end
                    end)
                else
                    doDelete()
                end
            end)
        end

        local function samePickerEntry(a, b)
            local ak, bk = makePickerSelectionKey(a), makePickerSelectionKey(b)
            return ak ~= "" and ak == bk
        end

        local function getPickerEmptyText()
            return currentTab == "myfiles" and "Tidak ada file rekaman lokal." or "Tidak ada rekaman web pada tab ini."
        end

        removeEntryFromCaches = function(entry)
            local key = makePickerSelectionKey(entry)
            if key ~= "" then selectedPickerEntries[key] = nil end
            for i = #(currentPickerEntries or {}), 1, -1 do
                if samePickerEntry(currentPickerEntries[i], entry) then table.remove(currentPickerEntries, i) end
            end
            if type(webPickerCache) == "table" then
                for _, cached in pairs(webPickerCache) do
                    if type(cached) == "table" and type(cached.entries) == "table" then
                        for i = #cached.entries, 1, -1 do
                            if samePickerEntry(cached.entries[i], entry) then table.remove(cached.entries, i) end
                        end
                    end
                end
            end
            updateBulkControls()
        end

        renderCurrentEntries = function(entries, emptyText)
            currentPickerEntries = entries or currentPickerEntries or {}
            clearRows()
            if #currentPickerEntries == 0 then
                makeInfoRow(emptyText or getPickerEmptyText())
            else
                for i, entry in ipairs(currentPickerEntries) do createRow(entry, i) end
            end
            updateBulkControls()
            updateCanvas()
        end

        toggleVisiblePickerSelection = function()
            local selectedCount, selectableCount = getPickerVisibleCounts()
            if selectableCount <= 0 then
                showNotification("Tidak ada file yang bisa dipilih untuk dihapus.", Color3.fromRGB(200, 150, 50))
                updateBulkControls()
                return
            end
            local shouldSelect = selectedCount < selectableCount
            for _, entry in ipairs(currentPickerEntries or {}) do
                if isEntryBulkDeletable(entry) then
                    selectedPickerEntries[makePickerSelectionKey(entry)] = shouldSelect or nil
                end
            end
            renderCurrentEntries(currentPickerEntries, getPickerEmptyText())
        end

        deleteSelectedPickerEntries = function()
            local targets = {}
            for _, entry in ipairs(currentPickerEntries or {}) do
                if selectedPickerEntries[makePickerSelectionKey(entry)] and isEntryBulkDeletable(entry) then
                    table.insert(targets, entry)
                end
            end
            if #targets == 0 then
                showNotification("Pilih file yang ingin dihapus dulu.", Color3.fromRGB(200, 150, 50))
                updateBulkControls()
                return
            end

            local function doBulkDelete()
                setStatus("Menghapus " .. tostring(#targets) .. " file terpilih...")
                task.spawn(function()
                    local deletedCount, failedCount, webDeletedCount, webFailedCount = 0, 0, 0, 0
                    for _, entry in ipairs(targets) do
                        local okDelete, errDelete = false, nil
                        if entry.kind == "local" then
                            local webOk, webMsg, webCount
                            okDelete, errDelete, webOk, webMsg, webCount = deleteLocalEntry(entry)
                            if okDelete then
                                deletedCount = deletedCount + 1
                                webDeletedCount = webDeletedCount + (tonumber(webCount) or 0)
                                if webOk == false then webFailedCount = webFailedCount + 1 end
                                if removeEntryFromCaches then removeEntryFromCaches(entry) end
                            else
                                failedCount = failedCount + 1
                            end
                        elseif entry.kind == "web" and canManageWebRecording(entry.raw) then
                            okDelete, errDelete = deleteRecordingFromWeb(entry.raw, entry.scope, true)
                            if okDelete then
                                deletedCount = deletedCount + 1
                                if removeEntryFromCaches then removeEntryFromCaches(entry) end
                            else
                                failedCount = failedCount + 1
                            end
                        else
                            failedCount = failedCount + 1
                        end
                    end

                    renderCurrentEntries(currentPickerEntries, getPickerEmptyText())
                    if deletedCount > 0 and failedCount == 0 then
                        local extra = webDeletedCount > 0 and (" dan " .. tostring(webDeletedCount) .. " data web") or ""
                        showNotification(tostring(deletedCount) .. " file berhasil dihapus" .. extra .. ".", Color3.fromRGB(50, 200, 50))
                    elseif deletedCount > 0 then
                        showNotification(tostring(deletedCount) .. " file dihapus, " .. tostring(failedCount) .. " gagal.", Color3.fromRGB(200, 150, 50))
                    else
                        showNotification("Gagal menghapus file terpilih.", Color3.fromRGB(200, 50, 50))
                    end
                    if webFailedCount > 0 then
                        showNotification("Sebagian sinkron hapus web gagal, file lokal tetap diproses.", Color3.fromRGB(200, 150, 50))
                    end
                    setStatus("Diperbarui " .. os.date("%H:%M") .. " • " .. tostring(#currentPickerEntries) .. " item")
                end)
            end

            if UI.showConfirmationPrompt then
                UI.showConfirmationPrompt("Yakin ingin menghapus " .. tostring(#targets) .. " file terpilih?", function(confirmed)
                    if confirmed then doBulkDelete() end
                end)
            else
                doBulkDelete()
            end
        end

        updatePickerTabs = function()
            for key, data in pairs(tabButtons) do
                local active = key == currentTab
                data.button.BackgroundColor3 = Color3.fromRGB(9, 10, 13)
                data.button.BackgroundTransparency = active and 0.46 or 0.82
                data.button.TextColor3 = active and Color3.fromRGB(255, 255, 255) or Color3.fromRGB(185, 185, 185)
                data.stroke.Color = active and importAccent or Color3.fromRGB(58, 60, 68)
                data.stroke.Transparency = active and 0.28 or 0.62
                themeImportElement(data.stroke, "Color")
            end
            filterButton.Text = "This Place: " .. (filterThisPlace and "ON" or "OFF")
            filterButton.TextColor3 = filterThisPlace and Color3.fromRGB(255, 255, 255) or Color3.fromRGB(210, 210, 210)
        end

        refreshPickerList = function(force)
            refreshSerial = refreshSerial + 1
            local serial = refreshSerial
            clearRows()
            setStatus("Memuat daftar...")
            if currentTab == "myfiles" then
                local entries, err = getLocalEntries()
                if serial ~= refreshSerial then return end
                if err then setStatus(err) end
                renderCurrentEntries(entries, err or "Tidak ada file rekaman lokal.")
                setStatus("Diperbarui " .. os.date("%H:%M") .. " • " .. tostring(#entries) .. " item")
                return
            end

            local scope = currentTab == "all" and "all" or "public"
            local cacheKey = tostring(scope) .. "|" .. tostring(searchBox.Text or ""):lower() .. "|" .. tostring(filterThisPlace == true)
            local cached = webPickerCache[cacheKey]
            if not force and type(cached) == "table" and type(cached.entries) == "table" then
                renderCurrentEntries(cached.entries, "Tidak ada rekaman web pada tab ini.")
                setStatus("Cache " .. os.date("%H:%M", cached.time or os.time()) .. " • " .. tostring(#cached.entries) .. " item")
                return
            end

            makeInfoRow("Mengambil rekaman dari database web...")
            task.spawn(function()
                local webRecords, err = fetchRecordingsFromWeb(scope, searchBox.Text, filterThisPlace)
                if serial ~= refreshSerial then return end
                if not webRecords then
                    renderCurrentEntries({}, tostring(err or "Gagal mengambil rekaman web."))
                    setStatus("Gagal memuat daftar web")
                    return
                end
                local entries = {}
                for _, rec in ipairs(webRecords) do
                    table.insert(entries, {kind = "web", title = getWebRecordingTitle(rec), raw = rec, scope = scope})
                end
                table.sort(entries, function(a, b) return tostring(a.title):lower() < tostring(b.title):lower() end)
                webPickerCache[cacheKey] = {
                    entries = entries,
                    scope = scope,
                    search = tostring(searchBox.Text or ""),
                    thisPlace = filterThisPlace == true,
                    time = os.time(),
                }
                renderCurrentEntries(entries, "Tidak ada rekaman web pada tab ini.")
                setStatus("Diperbarui " .. os.date("%H:%M") .. " • " .. tostring(#entries) .. " item")
            end)
        end

        filterButton.MouseButton1Click:Connect(function()
            filterThisPlace = not filterThisPlace
            updatePickerTabs()
            refreshPickerList(true)
        end)
        refreshButton.MouseButton1Click:Connect(function() refreshPickerList(true) end)
        local searchDebounce = 0
        searchBox:GetPropertyChangedSignal("Text"):Connect(function()
            searchDebounce = searchDebounce + 1
            local myDebounce = searchDebounce
            task.delay(0.35, function()
                if myDebounce == searchDebounce and gui and gui.Parent then refreshPickerList(false) end
            end)
        end)

        updatePickerTabs()
        updateBulkControls()
        refreshPickerList(true)
        if UI.MakeDraggable then UI.MakeDraggable(main, titleBar, function() return true end, nil) end
        if isGradientRole() then pcall(function() refreshRoleGradientUI(gui) end) end
    end

    function saveUniversalKeybinds()
        if not writefile then return end
        local data = {}
        for k, v in pairs(Keybinds) do
            if v and typeof(v) == "EnumItem" then 
                data[k] = v.Name 
            end
        end
        pcall(function()
            writefile(UNIVERSAL_KEYBINDS_FILE, HttpService:JSONEncode(data))
        end)
    end

    function loadUniversalKeybinds()
        if not readfile or not isfile or not isfile(UNIVERSAL_KEYBINDS_FILE) then return end
        
        local success, result = pcall(function()
            local content = readfile(UNIVERSAL_KEYBINDS_FILE)
            local data = HttpService:JSONDecode(content)
            
            if type(data) == "table" then
                for k, v in pairs(data) do
                    if Enum.KeyCode[v] then
                        Keybinds[k] = Enum.KeyCode[v]
                    end
                end
            end
        end)
        
        if not success then
            warn("Gagal memuat universal keybinds:", result)
        end
    end

    saveFeatureStates = function()
        if not writefile then return end
        
        -- VIP/Normal/Lifetime/Developer memakai default role, tetapi warna HSV custom tetap disimpan.
        local statesToSave = {
            WalkSpeed = false, -- runtime feature: jangan auto aktif saat execute ulang
            Fly = false,
            Noclip = false,
            InfinityJump = false,
            GodMode = false,
            AntiFling = false,
            AntiLag = false,
            BoostFPS = false,
            FEInvisible = false,
            ShiftLock = false,
            EmoteVIP = false,
            AnimationVIP = false,
            EmoteTransparent = false,
            AnimationTransparent = false,
            ESPName = false,
            ESPBody = false,
            ESPLine = false,
            ESPHealthBar = false,
            TeamColor = {teamColor.r, teamColor.g, teamColor.b},
            EnemyColor = {enemyColor.r, enemyColor.g, enemyColor.b},
            BrightnessValue = Settings.Brightness,
            WalkSpeedValue = Settings.WalkSpeed,
            FlySpeedValue = Settings.FlySpeed,
            FEInvisibleTransparencyValue = Settings.FEInvisibleTransparency,
            SpeedLockEnabled = false,
            SpeedLockValue = speedLock_currentSpeed,
            ShowCopyMovementIcon = showCopyMovementIcon,
            ShowFlingIcon = showFlingIcon,
            ShowTeleportIcon = showTeleportIcon,
            CopyMovementDelay = copyMovementDelay,
            CopyMovementBypassAnimation = copyMovementBypassAnimation,
            FlingInvisible = flingInvisible,
            SpectateCameraSensitivity = Settings.SpectateCameraSensitivity,
            SpectateCameraSpeed = Settings.SpectateCameraSpeed,
            AntiTeleport = false,
            OptimizedGame = false,
            DarkTexture = false,
            MiniToggleDraggable = true, -- toggle Kunci Bar Tombol tetap OFF saat execute ulang
            HSVThemeModeVersion = 11,
            -- ThemeColorValue lama tetap dipakai untuk non-role.
            -- Untuk VIP/Normal/Developer disimpan terpisah supaya warna HSV custom tidak tertimpa default/biru lama.
            ThemeActive = UI.isThemeManagerActive,
            ThemeColorValue = {
                (UI.currentThemeColor or UI.defaultThemeColor or getRoleDefaultThemeColor()).r,
                (UI.currentThemeColor or UI.defaultThemeColor or getRoleDefaultThemeColor()).g,
                (UI.currentThemeColor or UI.defaultThemeColor or getRoleDefaultThemeColor()).b
            },
            RoleThemeColorValue = ((UI._ArexansIsRoleThemeCustomizable and UI._ArexansIsRoleThemeCustomizable()) and (UI._ArexansPendingThemeColor or UI.currentThemeColor)) and {
                (UI._ArexansPendingThemeColor or UI.currentThemeColor).r,
                (UI._ArexansPendingThemeColor or UI.currentThemeColor).g,
                (UI._ArexansPendingThemeColor or UI.currentThemeColor).b
            } or nil,
            RoleThemeCustomActive = (UI._ArexansIsRoleThemeCustomizable and UI._ArexansIsRoleThemeCustomizable()) and (UI.isThemeManagerActive == true) or nil
        }
        
        pcall(function()
            writefile(FEATURE_STATES_SAVE_FILE, HttpService:JSONEncode(statesToSave))
        end)
    end
    
    function loadFeatureStates()
        if not readfile or not isfile or not isfile(FEATURE_STATES_SAVE_FILE) then return end
        
        local success, result = pcall(function()
            local fileContent = readfile(FEATURE_STATES_SAVE_FILE)
            local decodedData = HttpService:JSONDecode(fileContent)
            
            if type(decodedData) == "table" then
                IsWalkSpeedEnabled = decodedData.WalkSpeed or false
                IsFlying = decodedData.Fly or false
                IsNoclipEnabled = decodedData.Noclip or false
                IsInfinityJumpEnabled = decodedData.InfinityJump or false
                IsGodModeEnabled = decodedData.GodMode or false
                antifling_enabled = decodedData.AntiFling or false
                IsAntiLagEnabled = decodedData.AntiLag or false
                IsBoostFPSEnabled = decodedData.BoostFPS or false
                IsFEInvisibleEnabled = decodedData.FEInvisible or false
                IsShiftLockEnabled = decodedData.ShiftLock or false
                isEmoteEnabled = decodedData.EmoteVIP or false
                isAnimationEnabled = decodedData.AnimationVIP or false
                isEmoteTransparent = decodedData.EmoteTransparent ~= false
                isAnimationTransparent = decodedData.AnimationTransparent or false
                
                IsEspNameEnabled = decodedData.ESPName or false
                IsEspBodyEnabled = decodedData.ESPBody or false
                IsEspLineEnabled = decodedData.ESPLine or false
                IsEspHealthBarEnabled = decodedData.ESPHealthBar or false
                if decodedData.TeamColor then teamColor = Color3.new(unpack(decodedData.TeamColor)) end
                if decodedData.EnemyColor then enemyColor = Color3.new(unpack(decodedData.EnemyColor)) end

                Settings.Brightness = decodedData.BrightnessValue or Settings.Brightness
                Settings.WalkSpeed = decodedData.WalkSpeedValue or 16
                Settings.FlySpeed = decodedData.FlySpeedValue or 1
                Settings.FEInvisibleTransparency = decodedData.FEInvisibleTransparencyValue or 0.75
                speedLock_isEnforced = decodedData.SpeedLockEnabled or false
                speedLock_currentSpeed = decodedData.SpeedLockValue or 16
                showCopyMovementIcon = decodedData.ShowCopyMovementIcon ~= false
                showFlingIcon = decodedData.ShowFlingIcon ~= false
                showTeleportIcon = decodedData.ShowTeleportIcon ~= false
                copyMovementDelay = decodedData.CopyMovementDelay or 0.1
                copyMovementBypassAnimation = decodedData.CopyMovementBypassAnimation or false
                flingInvisible = decodedData.FlingInvisible or false
                Settings.SpectateCameraSensitivity = decodedData.SpectateCameraSensitivity or 0.004
                Settings.SpectateCameraSpeed = decodedData.SpectateCameraSpeed or 50
                IsAntiTeleportEnabled = decodedData.AntiTeleport or false
                IsOptimizedGameEnabled = decodedData.OptimizedGame or false
                darkActive = decodedData.DarkTexture or false
                if decodedData.MiniToggleDraggable ~= nil then isMiniToggleDraggable = decodedData.MiniToggleDraggable end

                -- Jangan pulihkan fitur aktif dari file lama/profile. Setiap execute harus mulai bersih/OFF.
                IsWalkSpeedEnabled = false
                IsFlying = false
                IsNoclipEnabled = false
                IsInfinityJumpEnabled = false
                IsGodModeEnabled = false
                antifling_enabled = false
                IsAntiLagEnabled = false
                IsBoostFPSEnabled = false
                IsFEInvisibleEnabled = false
                IsShiftLockEnabled = false
                IsAntiAFKEnabled = false
                IsAntiTeleportEnabled = false
                IsOptimizedGameEnabled = false
                darkActive = false
                IsEspNameEnabled = false
                IsEspBodyEnabled = false
                IsEspLineEnabled = false
                IsEspHealthBarEnabled = false
                speedLock_isEnforced = false
                isEmoteEnabled = false
                isAnimationEnabled = false
                isEmoteTransparent = false
        isMusicPlayerEnabled = false
                isAnimationTransparent = false
                isMiniToggleDraggable = true

                if UI._ArexansIsRoleThemeCustomizable and UI._ArexansIsRoleThemeCustomizable() then
                    -- Patch v20: ThemeColorValue lama/blue tidak boleh menyalakan HSV otomatis.
                    -- Role default selalu aktif; HSV custom hanya aktif jika disimpan oleh v10 saat toggle ON.
                    UI.defaultThemeColor = getRoleDefaultThemeColor()
                    UI.currentThemeColor = UI.defaultThemeColor
                    UI._ArexansPendingThemeColor = UI.defaultThemeColor
                    if decodedData.RoleThemeColorValue then
                        UI._ArexansPendingThemeColor = Color3.new(unpack(decodedData.RoleThemeColorValue))
                    end
                    UI.isThemeManagerActive = (decodedData.HSVThemeModeVersion == 11 and decodedData.RoleThemeCustomActive == true)
                    if UI.isThemeManagerActive then
                        UI.currentThemeColor = UI._ArexansPendingThemeColor
                    end
                else
                    if decodedData.ThemeColorValue then UI.currentThemeColor = Color3.new(unpack(decodedData.ThemeColorValue)) end
                    if decodedData.ThemeActive ~= nil then UI.isThemeManagerActive = decodedData.ThemeActive end
                    UI._ArexansPendingThemeColor = UI.currentThemeColor
                end
                if decodedData.Keybinds then 
                    for k, v in pairs(decodedData.Keybinds) do
                        Keybinds[k] = v
                    end
                end
            end
        end)
        if not success then
            warn("Gagal memuat status fitur:", result)
        end
    end


    
    
    function addTeleportLocation(name, cframe)
        for _, loc in pairs(savedTeleportLocations) do if loc.Name == name then return end end
        table.insert(savedTeleportLocations, {Name = name, CFrame = cframe}); table.sort(savedTeleportLocations, naturalCompare); saveTeleportData(); if updateTeleportList then updateTeleportList() end
    end
    
    -- [[ PERUBAHAN BARU: Deklarasi awal untuk fungsi spectate ]]
    startLocationSpectate = nil;
    
    -- [[ PERBAIKAN 1: Fungsi untuk memperbarui visibilitas ikon DAN ukuran tombol ]]
    function updateTeleportIconVisibility()
        local listContainer = TeleportTabContent:FindFirstChild("TeleportListContainer")
        if not listContainer then return end
    
        for _, child in pairs(listContainer:GetChildren()) do
            if child.Name == "TeleportLocationFrame" then
                local actionsFrame = child:FindFirstChild("ActionsFrame")
                local tpButton = child:FindFirstChildOfClass("TextButton")

                if actionsFrame and tpButton then
                    actionsFrame.Visible = areTeleportIconsVisible
                    if areTeleportIconsVisible then
                        tpButton.Size = UDim2.new(1, -65, 1, 0)
                    else
                        tpButton.Size = UDim2.new(1, 0, 1, 0)
                    end
                end
            end
        end
    end
    
    -- [[ PERBAIKAN 1: Fungsi updateTeleportList dirombak untuk menangani ukuran awal tombol ]]
    updateTeleportList = function()
        -- Dapatkan kontainer list yang benar, yang sekarang berada di dalam TeleportTabContent
        local listContainer = TeleportTabContent:FindFirstChild("TeleportListContainer")
        if not listContainer then return end -- Guard clause
    
        -- Hapus hanya item lokasi teleport dari kontainer list
        for _, child in pairs(listContainer:GetChildren()) do 
            if child.Name == "TeleportLocationFrame" then 
                child:Destroy() 
            end 
        end
    
        local layoutOrderOffset = 5 -- Urutan setelah tombol utama
    
        for i, locData in ipairs(savedTeleportLocations) do
            local locFrame = Instance.new("Frame")
            locFrame.Name = "TeleportLocationFrame"
            locFrame.Size = UDim2.new(1, 0, 0, 22) -- Disesuaikan dengan createButton
            locFrame.BackgroundTransparency = 1
            locFrame.Parent = listContainer -- Parent diubah ke listContainer
            locFrame.LayoutOrder = i + layoutOrderOffset
            locFrame.ZIndex = 2
    
            local tpButton = UI.createButton(locFrame, locData.Name, function() 
                if LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("HumanoidRootPart") then 
                    LocalPlayer.Character.HumanoidRootPart.CFrame = locData.CFrame * CFrame.new(0, 3, 0) 
                end 
            end)
            -- Atur ukuran awal tombol berdasarkan status visibilitas ikon
            tpButton.Size = areTeleportIconsVisible and UDim2.new(1, -65, 1, 0) or UDim2.new(1, 0, 1, 0)
            tpButton.TextSize = 10
            tpButton.TextXAlignment = Enum.TextXAlignment.Left
            local pad = Instance.new("UIPadding", tpButton)
            pad.PaddingLeft = UDim.new(0, 5)
    
            -- Frame untuk tombol aksi (View, Rename, Delete)
            local actionsFrame = Instance.new("Frame")
            actionsFrame.Name = "ActionsFrame"
            actionsFrame.Size = UDim2.new(0, 62, 1, 0)
            actionsFrame.Position = UDim2.new(1, -62, 0, 0)
            actionsFrame.BackgroundTransparency = 1
            actionsFrame.Parent = locFrame
            actionsFrame.Visible = areTeleportIconsVisible -- Atur visibilitas frame
    
            local actionsLayout = Instance.new("UIListLayout")
            actionsLayout.FillDirection = Enum.FillDirection.Horizontal
            actionsLayout.HorizontalAlignment = Enum.HorizontalAlignment.Right
            actionsLayout.VerticalAlignment = Enum.VerticalAlignment.Center
            actionsLayout.SortOrder = Enum.SortOrder.LayoutOrder
            actionsLayout.Padding = UDim.new(0, 2)
            actionsLayout.Parent = actionsFrame
            
            -- Helper function for Wireframe Icon Buttons
            local function createWireframeButton(parent, text, color, callback)
                local isAssetId = (UI.isAssetIcon and UI.isAssetIcon(text)) or string.match(tostring(text), "^%d+$") or string.match(tostring(text), "^rbxassetid://")
                local btn
                if isAssetId then
                    btn = Instance.new("ImageButton")
                    btn.Image = (UI.toAssetIcon and UI.toAssetIcon(text)) or (string.match(tostring(text), "^rbxassetid://") and text or "rbxassetid://" .. text)
                    btn.ImageColor3 = color
                    btn.ScaleType = Enum.ScaleType.Fit
                    local pad = Instance.new("UIPadding", btn)
                    pad.PaddingTop = UDim.new(0,2); pad.PaddingBottom = UDim.new(0,2)
                    pad.PaddingLeft = UDim.new(0,2); pad.PaddingRight = UDim.new(0,2)
                else
                    btn = Instance.new("TextButton")
                    btn.Text = text
                    btn.TextSize = 12
                    btn.TextColor3 = color
                    btn.Font = Enum.Font.SourceSansBold
                end
                
                btn.Size = UDim2.new(0, 18, 0, 18)
                btn.BackgroundTransparency = 1
                btn.BorderSizePixel = 0
                btn.Parent = parent
                
                local stroke = Instance.new("UIStroke", btn)
                stroke.Color = color
                stroke.Thickness = 1
                stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
                
                -- Check if it's blue-ish to apply theme
                if color.B > 0.5 and color.B > color.R and color.B > color.G then
                    if isAssetId then
                        UI.registerThemeElement(btn, "ImageColor3", btn.ImageColor3)
                    else
                        UI.registerThemeElement(btn, "TextColor3", btn.TextColor3)
                    end
                    UI.registerThemeElement(stroke, "Color", stroke.Color)
                end

                local corner = Instance.new("UICorner", btn)
                corner.CornerRadius = UDim.new(0, 4)
                
                btn.MouseButton1Click:Connect(callback)
                UI.RegisterButtonEffect(btn)
                return btn
            end

            -- Tombol View (asset icon)
            local viewButton = createWireframeButton(actionsFrame, UI.Icons.Eye, Color3.fromRGB(50, 150, 200), function()
                startLocationSpectate(locData.CFrame)
            end)
    
            -- Tombol Rename (R)
            local renameButton = createWireframeButton(actionsFrame, "R", Color3.fromRGB(255, 255, 255), function() 
                UI.showGenericRenamePrompt(locData.Name, function(newName) 
                    if newName and newName ~= "" and newName ~= savedTeleportLocations[i].Name then 
                        savedTeleportLocations[i].Name = newName
                        table.sort(savedTeleportLocations, naturalCompare)
                        saveTeleportData()
                        updateTeleportList() 
                    end 
                end) 
            end)
    
            -- Tombol Delete (X)
            local deleteButton = createWireframeButton(actionsFrame, "X", Color3.fromRGB(200, 50, 50), function() 
                table.remove(savedTeleportLocations, i)
                saveTeleportData()
                updateTeleportList() 
            end)
        end
    end

    function updateSinglePlayerButton(player)
        -- Guard: Players:GetPlayerByUserId(...) bisa return nil kalau player sudah leave,
        -- sementara PlayerButtons masih menyimpan UserId lama sampai cleanup selesai.
        if not player or not player.UserId then return end

        local button = PlayerButtons[player.UserId]
        if not button or not button.Parent then return end
    
        local distLabel = button:FindFirstChild("DistanceLabel", true)
        if distLabel then
            local localHRP = LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")
            local targetHRP = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
            distLabel.Text = (localHRP and targetHRP) and tostring(math.floor((localHRP.Position - targetHRP.Position).Magnitude)) .. "m" or "..."
        end
    
        local avatarImgBtn = button:FindFirstChild("AvatarImageButton")
        if avatarImgBtn then
            local stroke = avatarImgBtn:FindFirstChild("SpectateStroke")
            if stroke then
                stroke.Transparency = (IsViewingPlayer and currentlyViewedPlayer == player) and 0 or 1
            end
        end
    
        local flingButton = button:FindFirstChild("FlingButton", true)
        if flingButton then
            flingButton.BackgroundColor3 = (currentFlingTarget == player) and Color3.fromRGB(200, 50, 50) or Color3.fromRGB(80, 80, 80)
            flingButton.Visible = showFlingIcon
        end
    
        local recButton = button:FindFirstChild("RecordPlayerButton", true)
        if recButton then
            local isCurrentlyRecordingThisPlayer = isRecording and currentRecordingTarget == player
            if UI.applyIcon then UI.applyIcon(recButton, isCurrentlyRecordingThisPlayer and UI.Icons.StopSquare or UI.Icons.RedCircle, Color3.fromRGB(255, 255, 255)) else recButton.Text = isCurrentlyRecordingThisPlayer and UI.Icons.StopSquare or UI.Icons.RedCircle end
            recButton.BackgroundColor3 = isCurrentlyRecordingThisPlayer and Color3.fromRGB(80, 80, 80) or getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
            if not isCurrentlyRecordingThisPlayer and isGradientRole() then pcall(function() applyDeveloperGradient(recButton) end) end
        end
    
        local copyMovementButton = button:FindFirstChild("CopyMovementButton", true)
        if copyMovementButton then
            local isCopyingThisPlayer = isCopyingMovement and copiedPlayer == player
            copyMovementButton.BackgroundColor3 = isCopyingThisPlayer and Color3.fromRGB(40, 200, 40) or Color3.fromRGB(80, 80, 80)
            copyMovementButton.Visible = showCopyMovementIcon
        end

        local teleportButton = button:FindFirstChild("TeleportButton", true)
        if teleportButton then
            teleportButton.Visible = showTeleportIcon
        end
    end
    
    updatePlayerList = function()
        local playerCountLabel = PlayerTabContent:FindFirstChild("PlayerCountLabel", true)
        if not (MainFrame.Visible and PlayerTabContent.Visible) or not playerCountLabel then return end
    
        playerCountLabel.Text = "Pemain Online: " .. #Players:GetPlayers()
    
        for _, player in ipairs(Players:GetPlayers()) do
            if player ~= LocalPlayer then
                local passesFilter = (CurrentPlayerFilter == "" or CurrentPlayerFilter == "Cari Pemain..." or player.Name:lower():find(CurrentPlayerFilter:lower(), 1, true) or player.DisplayName:lower():find(CurrentPlayerFilter:lower(), 1, true))
                local existingButton = PlayerButtons[player.UserId]
                
                if existingButton then
                    existingButton.Visible = passesFilter
                    updateSinglePlayerButton(player)
                end
            end
        end
    end
    
    tabButtons = {} -- Simpan referensi tombol tab
    currentActiveTabName = "Player"

    function switchTab(tabName)
        currentActiveTabName = tabName
        PlayerTabContent.Visible = (tabName == "Player")
        GeneralTabContent.Visible = (tabName == "Umum")
        TeleportTabContent.Visible = (tabName == "Teleport")
        VipTabContent.Visible = (tabName == "VIP")
        SettingsTabContent.Visible = (tabName == "Pengaturan")
        RekamanTabContent.Visible = (tabName == "Rekaman")
        GameTabContent.Visible = (tabName == "Script")
        ServerTabContent.Visible = (tabName == "Server")
        
        -- Update visual tombol tab: compact, clean, tanpa background biru besar untuk role Developer.
        for name, btn in pairs(tabButtons) do
            local stroke = btn:FindFirstChild("TabButtonStroke") or btn:FindFirstChildOfClass("UIStroke")
            local accentLine = btn:FindFirstChild("TabButtonAccentLine")
            local isActive = (name == tabName)
            local developerTabs = isGradientRole()
            local accentColor = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))

            btn.TextColor3 = isActive and Color3.fromRGB(245, 250, 255) or Color3.fromRGB(178, 184, 196)
            btn.TextStrokeTransparency = isActive and 0.72 or 1
            btn.BackgroundColor3 = developerTabs and Color3.fromRGB(18, 20, 28) or (isActive and accentColor or Color3.fromRGB(35, 35, 55))
            TweenService:Create(btn, TweenInfo.new(0.2), {BackgroundTransparency = developerTabs and (isActive and 0.48 or 0.88) or (isActive and 0.28 or 0.78)}):Play()

            if stroke then
                pcall(function() stroke:SetAttribute("ArexansActiveTab", isActive) end)
                stroke.Color = isActive and accentColor or Color3.fromRGB(72, 76, 92)
                TweenService:Create(stroke, TweenInfo.new(0.2), {Transparency = isActive and 0.10 or 0.58}):Play()
            end

            if accentLine then
                accentLine.Visible = isActive
                accentLine.BackgroundColor3 = accentColor
                TweenService:Create(accentLine, TweenInfo.new(0.18), {BackgroundTransparency = isActive and 0 or 1}):Play()
            end

            pcall(function() btn:SetAttribute("ArexansThemeAccent", false) end)
            if btn:FindFirstChild("DeveloperGradient") then btn.DeveloperGradient:Destroy() end

            if isActive and developerTabs then
                if stroke then applyDeveloperGradient(stroke) end
                if accentLine then applyDeveloperGradient(accentLine) end
            else
                if stroke and stroke:FindFirstChild("DeveloperGradient") then stroke.DeveloperGradient:Destroy() end
                if accentLine and accentLine:FindFirstChild("DeveloperGradient") then accentLine.DeveloperGradient:Destroy() end
            end
        end

        if tabName == "Player" and updatePlayerList then updatePlayerList() end
    end
    
    function createTabButton(name, parent)
        local button = Instance.new("TextButton")
        button.Size = UDim2.new(1, 0, 0, 24)
        button.BackgroundColor3 = Color3.fromRGB(18, 20, 28)
        button.BackgroundTransparency = 0.88 -- Default compact, tanpa background biru mencolok
        button.BorderSizePixel = 0
        button.AutoButtonColor = false
        button.Text = name
        button.TextColor3 = Color3.fromRGB(178, 184, 196)
        button.TextSize = 10
        button.TextTruncate = Enum.TextTruncate.AtEnd
        button.Font = Enum.Font.SourceSansBold
        pcall(function() button:SetAttribute("ArexansNoDeveloperGradient", true) end)
        button.Parent = parent
        
        local btnCorner = Instance.new("UICorner", button)
        btnCorner.CornerRadius = UDim.new(0, 6)

        local accentLine = Instance.new("Frame")
        accentLine.Name = "TabButtonAccentLine"
        accentLine.Size = UDim2.new(0, 2, 1, -8)
        accentLine.Position = UDim2.new(0, 4, 0, 4)
        accentLine.BackgroundColor3 = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
        accentLine.BackgroundTransparency = 1
        accentLine.BorderSizePixel = 0
        accentLine.Visible = false
        accentLine.Parent = button

        local accentCorner = Instance.new("UICorner", accentLine)
        accentCorner.CornerRadius = UDim.new(1, 0)
        
        local btnStroke = Instance.new("UIStroke", button)
        btnStroke.Name = "TabButtonStroke"
        btnStroke.Color = Color3.fromRGB(72, 76, 92)
        btnStroke.Thickness = 1
        btnStroke.Transparency = 0.58
        btnStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
        btnStroke:SetAttribute("ArexansActiveTab", false)
        
        button.MouseButton1Click:Connect(function() switchTab(name) end)
        
        -- Custom Tab Button Effect
        local uiScale = Instance.new("UIScale")
        uiScale.Name = "ButtonScaleEffect"
        uiScale.Parent = button
        
        local function getTargetTransparency()
            return isGradientRole() and ((currentActiveTabName == name) and 0.48 or 0.88) or ((currentActiveTabName == name) and 0.28 or 0.78)
        end

        local function getTargetStrokeTransparency()
            return (currentActiveTabName == name) and 0.10 or 0.58
        end

        button.MouseButton1Down:Connect(function()
            TweenService:Create(uiScale, TweenInfo.new(0.1), {Scale = 0.95}):Play()
            -- Flash background visible when pressed
            TweenService:Create(button, TweenInfo.new(0.1), {BackgroundTransparency = isGradientRole() and 0.55 or 0.35}):Play()
        end)
        
        local function restore()
            TweenService:Create(uiScale, TweenInfo.new(0.1), {Scale = 1}):Play()
            -- Restore to correct state (Active or Inactive)
            TweenService:Create(button, TweenInfo.new(0.2), {BackgroundTransparency = getTargetTransparency()}):Play()
            TweenService:Create(btnStroke, TweenInfo.new(0.2), {Transparency = getTargetStrokeTransparency()}):Play()
        end
        
        button.MouseButton1Up:Connect(restore)
        button.MouseLeave:Connect(restore)
        
        tabButtons[name] = button -- Simpan ke tabel
        return button
    end

    -- Special handler untuk update aksen tab tanpa mengubah background Developer menjadi biru.
    registerThemeElement(TabsFrame, "ScrollBarImageColor3", getResolvedThemeColor(Color3.fromRGB(0, 150, 255)), function(_, newColor)
        for name, btn in pairs(tabButtons) do
            local isActive = (name == currentActiveTabName)
            local stroke = btn:FindFirstChild("TabButtonStroke") or btn:FindFirstChildOfClass("UIStroke")
            local accentLine = btn:FindFirstChild("TabButtonAccentLine")
            if isActive then
                if not isGradientRole() then
                    btn.BackgroundColor3 = newColor
                    btn.TextColor3 = getResolvedThemeColor(Color3.fromRGB(0, 200, 255))
                else
                    btn.BackgroundColor3 = Color3.fromRGB(18, 20, 28)
                    btn.TextColor3 = Color3.fromRGB(245, 250, 255)
                end
                if stroke then stroke.Color = newColor end
                if accentLine then accentLine.BackgroundColor3 = newColor end
            end
        end
    end)
    
    -- Urutan pembuatan tombol
    createTabButton("Player", TabsFrame)
    createTabButton("Umum", TabsFrame)
    createTabButton("Teleport", TabsFrame)
    createTabButton("Rekaman", TabsFrame)
    createTabButton("Script", TabsFrame)
    createTabButton("VIP", TabsFrame)
    createTabButton("Server", TabsFrame)
    createTabButton("Pengaturan", TabsFrame)
    

    
    -- ====================================================================
    -- == BAGIAN FUNGSI ANIMASI (INTEGRASI DARI animation.lua)         ==
    -- ====================================================================
    applyEmoteTransparency = nil
    applyAnimationTransparency = nil

    function destroyAnimationGUI()
        if AnimationScreenGui and AnimationScreenGui.Parent then
            AnimationScreenGui:Destroy()
        end
        AnimationScreenGui = nil
    end

    function destroyEmoteGUI()
        if EmoteScreenGui and EmoteScreenGui.Parent then
            EmoteScreenGui:Destroy()
            EmoteScreenGui = nil
        end
        -- Also destroy the new window if it exists
        local existingGui = CoreGui:FindFirstChild("EmoteWindowGUI")
        if existingGui then
            existingGui:Destroy()
        end
    end

    applyEmoteTransparency = function(isTransparent)
        local frame = EmoteScreenGui and EmoteScreenGui:FindFirstChild("MainFrame")
        if not frame then return end

        local baseTransparency = isTransparent and 0.85 or 0
        local handleTransparency = isTransparent and 0.85 or 0.5

        -- Helper to apply transparency
        local function applyTo(element, transparency)
            if element then
                element.BackgroundTransparency = transparency
            end
        end

        applyTo(frame, baseTransparency)
        applyTo(frame:FindFirstChild("Header"), baseTransparency)
        applyTo(frame:FindFirstChild("SearchBox"), baseTransparency)
        applyTo(frame:FindFirstChild("EmoteResizeHandle"), handleTransparency)

        local filterFrame = frame:FindFirstChild("FilterFrame")
        if filterFrame then
            for _, button in ipairs(filterFrame:GetChildren()) do
                if button:IsA("TextButton") then
                    applyTo(button, baseTransparency)
                end
            end
        end
        
        local emoteArea = frame:FindFirstChild("EmoteArea")
        if emoteArea then
            for _, container in ipairs(emoteArea:GetChildren()) do
                if container:IsA("Frame") then
                    local emoteButton = container:FindFirstChild("EmoteImageButton")
                    local starButton = container:FindFirstChild("FavoriteButton")
                    applyTo(emoteButton, baseTransparency)
                    applyTo(starButton, baseTransparency)
                end
            end
        end
    end

    function initializeEmoteGUI()
        if not hasPermission("VIP") then
            showNotification("Silahkan upgrade ke VIP terlebih dahulu, Terimakasih", Color3.fromRGB(255,100,0))
            return
        end
        if EmoteScreenGui and EmoteScreenGui.Parent then
            destroyEmoteGUI()
            return
        end

        loadFavorites()

        EmoteScreenGui = Instance.new("ScreenGui")
        EmoteScreenGui.Name = "EmoteWindowGUI"
        EmoteScreenGui.Parent = CoreGui
        EmoteScreenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
        EmoteScreenGui.DisplayOrder = 11

        local EmoteMainFrame = Instance.new("Frame")
        EmoteMainFrame.Name = "MainFrame"
        EmoteMainFrame.AnchorPoint = Vector2.new(0.5, 0.5)
        EmoteMainFrame.Size = UDim2.new(0, 160, 0, 180)
        EmoteMainFrame.Position = UDim2.new(0.5, 0, 0.5, 0)
        
        if loadedGuiPositions and loadedGuiPositions.EmoteFrame then
            local posData = loadedGuiPositions.EmoteFrame
            pcall(function() 
                EmoteMainFrame.Position = UDim2.new(posData.XScale, posData.XOffset, posData.YScale, posData.YOffset)
                EmoteMainFrame.Size = UDim2.new(0, posData.SizeX or 160, 0, posData.SizeY or 180)
            end)
        end
        
        EmoteMainFrame.BackgroundColor3 = Color3.fromRGB(28, 43, 70)
        EmoteMainFrame.BackgroundTransparency = 0.2
        EmoteMainFrame.BorderSizePixel = 0
        local EmoteStroke = Instance.new("UIStroke", EmoteMainFrame)
        EmoteStroke.Name = "EmoteBorderStroke"
        EmoteStroke.Color = Color3.fromRGB(0, 150, 255)
        EmoteStroke.Thickness = 1
        EmoteStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
        if UI.registerThemeElement then UI.registerThemeElement(EmoteStroke, "Color", EmoteStroke.Color) else registerThemeElement(EmoteStroke, "Color", EmoteStroke.Color) end
        if isGradientRole() then applyDeveloperGradient(EmoteStroke) end
        EmoteMainFrame.ClipsDescendants = true
        EmoteMainFrame.Parent = EmoteScreenGui
        EmoteMainFrame.Visible = true

        local UICorner = Instance.new("UICorner", EmoteMainFrame)
        UICorner.CornerRadius = UDim.new(0, 8)

        local Header = Instance.new("TextButton") 
        Header.Name = "Header"
        Header.Size = UDim2.new(1, 0, 0, 30)
        Header.BackgroundColor3 = Color3.fromRGB(48, 63, 90)
        Header.BorderSizePixel = 0
        Header.Text = "" 
        Header.AutoButtonColor = false 
        Header.Parent = EmoteMainFrame

        local Title = Instance.new("TextLabel")
        Title.Name = "Title"
        Title.Size = UDim2.new(1, -40, 1, 0)
        Title.Position = UDim2.new(0, 10, 0, 0)
        Title.BackgroundTransparency = 1
        Title.Font = Enum.Font.GothamBold
        Title.Text = "Arexans Emotes [VIP]"
        Title.TextColor3 = Color3.fromRGB(255, 255, 255)
        Title.TextXAlignment = Enum.TextXAlignment.Left
        Title.Parent = Header

        local CloseButton = Instance.new("TextButton")
        CloseButton.Name = "CloseButton"
        CloseButton.Size = UDim2.new(0, 26, 0, 26)
        CloseButton.Position = UDim2.new(1, -18, 0.5, 0)
        CloseButton.AnchorPoint = Vector2.new(0.5, 0.5)
        CloseButton.BackgroundTransparency = 1
        CloseButton.Font = Enum.Font.GothamBold
        CloseButton.Text = ""
        CloseButton.TextColor3 = Color3.fromRGB(255, 255, 255)
        CloseButton.TextSize = 18
        CloseButton.Parent = Header
        pcall(function() CloseButton:SetAttribute("ArexansNoDeveloperGradient", true); CloseButton:SetAttribute("ArexansAllowDeveloperIconGradient", true) end)
        if UI.applyIcon then
            UI.applyIcon(CloseButton, UI.Icons.DeleteRecord or UI.Icons.Wastebasket, getResolvedThemeColor(Color3.fromRGB(255, 255, 255)))
            local closeIconImg = CloseButton:FindFirstChild("ArexansIconImage")
            if closeIconImg then
                closeIconImg.Size = UDim2.new(1, 0, 1, 0)
                pcall(function() closeIconImg:SetAttribute("ArexansAllowDeveloperIconGradient", true); closeIconImg:SetAttribute("ArexansAllowDeveloperGradient", true); closeIconImg:SetAttribute("ArexansNoDeveloperGradient", false) end)
                if isGradientRole() then applyDeveloperGradient(closeIconImg) end
            end
        end
        CloseButton.MouseButton1Click:Connect(destroyEmoteGUI) 
        
        UI.MakeDraggable(EmoteMainFrame, Header, function() return true end, nil)

        local EmoteResizeHandle = Instance.new("TextButton")
        EmoteResizeHandle.Name = "EmoteResizeHandle"
        EmoteResizeHandle.Text = ""
        EmoteResizeHandle.Size = UDim2.new(0, 15, 0, 15)
        EmoteResizeHandle.Position = UDim2.new(1, -15, 1, -15)
        EmoteResizeHandle.BackgroundColor3 = Color3.fromRGB(90, 150, 255)
        EmoteResizeHandle.BorderSizePixel = 0
        EmoteResizeHandle.ZIndex = 2
        EmoteResizeHandle.Parent = EmoteMainFrame

        EmoteResizeHandle.InputBegan:Connect(function(input)
            if not (input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch) then return end
            local isResizing = true
            local initialMousePosition = UserInputService:GetMouseLocation()
            local initialFrameSize = EmoteMainFrame.AbsoluteSize
            local inputChangedConnection, inputEndedConnection
            inputChangedConnection = UserInputService.InputChanged:Connect(function(changedInput)
                if isResizing and (changedInput.UserInputType == Enum.UserInputType.MouseMovement or changedInput.UserInputType == Enum.UserInputType.Touch) then
                    local delta = UserInputService:GetMouseLocation() - initialMousePosition
                    local newSizeX = math.max(160, initialFrameSize.X + delta.X)
                    local newSizeY = math.max(180, initialFrameSize.Y + delta.Y)
                    EmoteMainFrame.Size = UDim2.new(0, newSizeX, 0, newSizeY)
                end
            end)
            inputEndedConnection = UserInputService.InputEnded:Connect(function(endedInput)
                if endedInput.UserInputType == input.UserInputType then
                    isResizing = false
                    if inputChangedConnection then inputChangedConnection:Disconnect() end
                    if inputEndedConnection then inputEndedConnection:Disconnect() end
                    saveGuiPositions()
                end
            end)
        end)

        local SearchBox = Instance.new("TextBox")
        SearchBox.Name = "SearchBox"
        SearchBox.Size = UDim2.new(1, -20, 0, 25)
        SearchBox.Position = UDim2.new(0, 10, 0, 35)
        SearchBox.BackgroundTransparency = 1
        SearchBox.PlaceholderText = "Cari emote..."
        SearchBox.Text = ""
        SearchBox.PlaceholderColor3 = Color3.fromRGB(180, 190, 210)
        SearchBox.Font = Enum.Font.Gotham
        SearchBox.TextColor3 = Color3.fromRGB(255, 255, 255)
        SearchBox.ClearTextOnFocus = false
        SearchBox.Parent = EmoteMainFrame
        local SearchCorner = Instance.new("UICorner", SearchBox); SearchCorner.CornerRadius = UDim.new(0, 6)
        local SearchStroke = Instance.new("UIStroke", SearchBox)
        SearchStroke.Color = Color3.fromRGB(0, 150, 255)
        SearchStroke.Thickness = 1
        SearchStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
        registerThemeElement(SearchStroke, "Color", SearchStroke.Color)
        local SearchPadding = Instance.new("UIPadding", SearchBox); SearchPadding.PaddingLeft = UDim.new(0, 10); SearchPadding.PaddingRight = UDim.new(0, 10)

        local FilterFrame = Instance.new("Frame")
        FilterFrame.Name = "FilterFrame"
        FilterFrame.Size = UDim2.new(1, -20, 0, 25)
        FilterFrame.Position = UDim2.new(0, 10, 0, 65)
        FilterFrame.BackgroundTransparency = 1
        FilterFrame.Parent = EmoteMainFrame

        local FilterLayout = Instance.new("UIListLayout", FilterFrame)
        FilterLayout.FillDirection = Enum.FillDirection.Horizontal
        FilterLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
        FilterLayout.VerticalAlignment = Enum.VerticalAlignment.Center
        FilterLayout.Padding = UDim.new(0, 5)

        local filterButtons = {}
        local favoriteFilterState = 1
        local function createFilterButton(text, state)
            local button = Instance.new("TextButton", FilterFrame)
            button.Name = text .. "FilterButton"
            button.Size = UDim2.new(0.33, -5, 1, 0)
            button.Font = Enum.Font.SourceSansBold
            button.Text = text
            button.TextSize = 12
            local btnCorner = Instance.new("UICorner", button); btnCorner.CornerRadius = UDim.new(0, 4)
            table.insert(filterButtons, {button=button, state=state})
            UI.RegisterButtonEffect(button)
            return button
        end

        local favButton = createFilterButton("Favorite", 2)
        local allButton = createFilterButton("Semua", 1)
        local unfavButton = createFilterButton("Unfavorite", 3)

        local function updateFilterButtons()
            for _, btnInfo in ipairs(filterButtons) do
                local isActive = (btnInfo.state == favoriteFilterState)
                btnInfo.button.BackgroundColor3 = isActive and Color3.fromRGB(90, 150, 255) or Color3.fromRGB(48, 63, 90)
                btnInfo.button.TextColor3 = isActive and Color3.fromRGB(255, 255, 255) or Color3.fromRGB(180, 190, 210)
            end
        end
        
        local EmoteArea = Instance.new("ScrollingFrame")
        EmoteArea.Name = "EmoteArea"
        EmoteArea.Size = UDim2.new(1, 0, 1, -100)
        EmoteArea.Position = UDim2.new(0, 0, 0, 95)
        EmoteArea.BackgroundTransparency = 1
        EmoteArea.BorderSizePixel = 0
        EmoteArea.ScrollBarImageColor3 = Color3.fromRGB(90, 150, 255)
        EmoteArea.ScrollBarThickness = 5
        EmoteArea.ScrollingDirection = Enum.ScrollingDirection.Y
        EmoteArea.Parent = EmoteMainFrame
        local UIPadding = Instance.new("UIPadding", EmoteArea); UIPadding.PaddingLeft = UDim.new(0, 10); UIPadding.PaddingRight = UDim.new(0, 10); UIPadding.PaddingTop = UDim.new(0, 5); UIPadding.PaddingBottom = UDim.new(0, 10)

        local UIGridLayout = Instance.new("UIGridLayout")
        UIGridLayout.CellPadding = UDim2.new(0, 4, 0, 4)
        UIGridLayout.CellSize = UDim2.new(0, 32, 0, 44)
        UIGridLayout.SortOrder = Enum.SortOrder.Name
        UIGridLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
        UIGridLayout.Parent = EmoteArea
        
        local function populateEmotes(filter)
            filter = filter and filter:lower() or ""
            for _, container in pairs(EmoteArea:GetChildren()) do
                if container:IsA("Frame") and container:FindFirstChild("EmoteImageButton") then
                    local isFavorite = favoriteEmotes[container.Name] == true
                    local passesSearch = (filter == "" or container.Name:lower():find(filter, 1, true))
                    
                    local passesFavoriteFilter = false
                    if favoriteFilterState == 1 then passesFavoriteFilter = true
                    elseif favoriteFilterState == 2 then if isFavorite then passesFavoriteFilter = true end
                    elseif favoriteFilterState == 3 then if not isFavorite then passesFavoriteFilter = true end
                    end
                    
                    container.Visible = passesSearch and passesFavoriteFilter
                end
            end
            task.wait()
            EmoteArea.CanvasSize = UDim2.new(0, 0, 0, UIGridLayout.AbsoluteContentSize.Y)
        end
        
        for _, btnInfo in ipairs(filterButtons) do
            btnInfo.button.MouseButton1Click:Connect(function()
                favoriteFilterState = btnInfo.state
                updateFilterButtons()
                loadFavorites() 
                populateEmotes(SearchBox.Text)
            end)
        end
        
        updateFilterButtons()

        local function toggleAnimation(animId)
            local char = LocalPlayer.Character
            if not char or not char:FindFirstChild("Humanoid") then return end
            local humanoid = char.Humanoid
            local animator = humanoid:FindFirstChildOfClass("Animator") or humanoid

            -- Cari dan hentikan emote yang sedang berjalan
            for _, playingTrack in ipairs(animator:GetPlayingAnimationTracks()) do
                if playingTrack.Name == "ArexansEmoteTrack" then
                    playingTrack:Stop(0.2)
                    -- Jika emote yang sama diklik lagi, kita hanya menghentikannya.
                    if playingTrack.Animation.AnimationId == animId then
                        return
                    end
                end
            end

            -- Mainkan emote baru
            local anim = Instance.new("Animation")
            anim.AnimationId = animId
            
            local okLoad, newTrack = pcall(function()
                return animator:LoadAnimation(anim)
            end)
            if not okLoad or not newTrack then
                anim:Destroy()
                showNotification("Animasi gagal dimuat / tidak tersedia.", Color3.fromRGB(200, 80, 80))
                return
            end
            newTrack.Name = "ArexansEmoteTrack" -- Beri nama khusus untuk identifikasi
            newTrack:Play(0.1)

            anim:Destroy()
        end

        local function createEmoteButton(emoteData)
            local container = Instance.new("Frame")
            container.Name = emoteData.name
            container.Size = UDim2.new(0, 32, 0, 44)
            container.BackgroundTransparency = 1
            container.Parent = EmoteArea

            local button = Instance.new("ImageButton", container)
            button.Name = "EmoteImageButton"
            button.BackgroundColor3 = Color3.fromRGB(48, 63, 90)
            button.BackgroundTransparency = isEmoteTransparent and 0.85 or 0
            button.Size = UDim2.new(1, 0, 1, 0)
            local corner = Instance.new("UICorner", button); corner.CornerRadius = UDim.new(0, 6)

            local image = Instance.new("ImageLabel", button)
            image.Size = UDim2.new(1, -4, 0, 30)
            image.Position = UDim2.new(0.5, 0, 0, 2)
            image.AnchorPoint = Vector2.new(0.5, 0)
            image.BackgroundTransparency = 1
            image.Image = "rbxthumb://type=Asset&id=" .. tostring(emoteData.id) .. "&w=420&h=420"

            local nameLabel = Instance.new("TextLabel", button)
            nameLabel.Size = UDim2.new(1, -4, 0, 10)
            nameLabel.Position = UDim2.new(0, 2, 1, -11)
            nameLabel.BackgroundTransparency = 1
            nameLabel.Font = Enum.Font.Gotham
            nameLabel.Text = emoteData.name
            nameLabel.TextScaled = true
            nameLabel.TextColor3 = Color3.fromRGB(255, 255, 255)

            button.MouseButton1Click:Connect(function() toggleAnimation(emoteData.animationid) end)
            UI.RegisterButtonEffect(button)

            local starButton = Instance.new("TextButton", container)
            starButton.Name = "FavoriteButton"
            starButton.Size = UDim2.new(0, 16, 0, 16)
            starButton.Position = UDim2.new(1, 0, 0, 0)
            starButton.AnchorPoint = Vector2.new(1, 0)
            starButton.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
        starButton.BackgroundTransparency = isEmoteTransparent and 0.85 or 0
            starButton.Font = Enum.Font.SourceSansBold
            starButton.Text = UI.Icons.Heart
            starButton.TextSize = 12
            starButton.ZIndex = 2
            local starCorner = Instance.new("UICorner", starButton); starCorner.CornerRadius = UDim.new(0, 4)

            local function updateStarVisual()
                local isFavorite = favoriteEmotes[emoteData.name] == true
                starButton.TextColor3 = isFavorite and Color3.fromRGB(255, 80, 120) or Color3.fromRGB(150, 150, 150)
            end

            starButton.MouseButton1Click:Connect(function()
                favoriteEmotes[emoteData.name] = not favoriteEmotes[emoteData.name]
                saveFavorites()
                updateStarVisual()
                populateEmotes(SearchBox.Text)
            end)
            UI.RegisterButtonEffect(starButton)
            updateStarVisual()
        end

        task.spawn(function()
            local success, result = pcall(function() return HttpService:JSONDecode(game:HttpGet("https://raw.githubusercontent.com/AREXANS/emoteff/refs/heads/main/emote.json")) end)
            if success and type(result) == "table" then
                local existingEmotes = {}
                for _, emote in pairs(result) do
                    if emote.name and emote.animationid and emote.id and not existingEmotes[emote.name:lower()] then
                        createEmoteButton(emote); existingEmotes[emote.name:lower()] = true
                    end
                end
            else
                warn("Gagal mengambil daftar emote:", result)
            end
            populateEmotes("")
        end)
        SearchBox:GetPropertyChangedSignal("Text"):Connect(function() populateEmotes(SearchBox.Text) end)

        -- Apply initial transparency
        applyEmoteTransparency(isEmoteTransparent)
    end

    local ANIM_PRESETS = {
    {name="Adidas Community",  idle1=122257458498464,  idle2=102357151005774,  walk=122150855457006,   run=82598234841035,     jump=75290611992385,    fall=98600215928904,    climb=88763136693023,   swimidle=109346520324160, swim=133308483266208, useGetObjects=true},
    {name="Glow Motion",       idle1=72213510878866,   idle2=72213510878866,   walk=124733969277188,   run=91745899537026,     jump=126137138096765,   fall=76868289213402,    climb=122281742555667,  swimidle=78813763153341,  swim=78813763153341,    useGetObjects=true},
    {name="Billie Eilish",     idle1=82009039247070,   idle2=82009039247070,   walk=74056522836252,    run=107895705891639,    jump=114806832298003,   fall=132771121298158,   climb=95937554524959,   swimidle=78340083978503,  swim=78340083978503,    useGetObjects=true},
    {name="Handstand Animation Pack", idle1=135575165028849, idle2=135575165028849, walk=117765825848453, run=99875831172373, jump=128965057150875, fall=111831828617770, climb=112505979110458, swimidle=82730580219519, swim=82730580219519, useGetObjects=true},
    {name="Dog Bunny Animation Pack", idle1=136322765510200, idle2=136322765510200, walk=93195124672420, run=80744014032460, jump=91689511109384, fall=138712913675658, climb=139564919712366, swimidle=88811196999845, swim=88811196999845, useGetObjects=true},
    {name="Hoverboard Animation Pack", idle1=93616657066536, idle2=93616657066536, walk=97065248057640, run=89532448464946, jump=102860697251632, fall=90353939293034, climb=128257589957243, swimidle=133596372835000, swim=133596372835000, useGetObjects=true},
    {name="Sprinter Animation Pack", idle1=129794821448421, idle2=129794821448421, walk=102423799534100, run=120741731730819, jump=139321637247351, fall=76408670644983, climb=123076402162196, swimidle=94399444567795, swim=94399444567795, useGetObjects=true},
    {name="Fighter Animation Pack", idle1=88016093360951, idle2=88016093360951, walk=82280787041246, run=74327884548186, jump=131675266554473, fall=134961140457349, climb=136141293963563, swimidle=96909954438932, swim=96909954438932, useGetObjects=true},
    {name="Moonwalker Animation Pack", idle1=92710716765283, idle2=92710716765283, walk=114763801999339, run=101531926378460, jump=104533631513747, fall=70566441403811, climb=79306475091221, swimidle=98563274763262, swim=98563274763262, useGetObjects=true},
    {name="Bruiser Animation Pack", idle1=91486182566842, idle2=91486182566842, walk=110119880881706, run=136670254583990, jump=110949855044563, fall=114388482037548, climb=113866830860789, swimidle=113544566765768, swim=113544566765768, useGetObjects=true},
    {name="Angel Animation Pack", idle1=106617557168449, idle2=106617557168449, walk=129380445505644, run=110540935388974, jump=117028353539960, fall=137098035754306, climb=72948750270080, swimidle=125903638047924, swim=125903638047924, useGetObjects=true},
    {name="Aura Animation Pack", idle1=103073671112449, idle2=103073671112449, walk=107974792006222, run=126690709549004, jump=131932286655764, fall=74746323396145, climb=103443334658077, swimidle=128846499821276, swim=128846499821276, useGetObjects=true},
    {name="Floating & Hovering In The Air", idle1=115906557603671, idle2=115906557603671, walk=119786323122017, run=129278715401446, jump=112005766742735, fall=72058760380261, climb=106619418917040, swimidle=94244427859958, swim=94244427859958, useGetObjects=true},
    {name="Underwater Siren Mermaid", idle1=72100162263901, idle2=72100162263901, walk=139341244827854, run=73336016052986, jump=75942009951199, fall=70703952625242, climb=102631234037365, swimidle=135995507444253, swim=135995507444253, useGetObjects=true},
    {name="Riding On My Bike", idle1=132700029208610, idle2=132700029208610, walk=93570377820495, run=73184418176779, jump=86465002608207, fall=133447118806772, climb=123731540239693, swimidle=137128132254475, swim=137128132254475, useGetObjects=true},
    {name="Effortless Aura", idle1=106390953994044, idle2=106390953994044, walk=111484087971615, run=112515971043909, jump=89547925261998, fall=135065867268215, climb=116904502538281, swimidle=133821165523889, swim=133821165523889, useGetObjects=true},
    {name="Bicyclist / Bike",  idle1=110301614683999, idle2=110301614683999, walk=78201729008814, run=82563400820481, jump=107759406184171, fall=116348378285841, climb=106713991255001, swimidle=77327275394482, swim=77327275394482, useGetObjects=true},
    {name="Cute Sit", idle1=110542674051174, idle2=110542674051174, walk=118167050072619, run=113254670339077, jump=124327113511763, fall=99664258493491, climb=125102831404256, swimidle=112149520105094, swim=112149520105094, useGetObjects=true},
    {name="Cute Bouncy", idle1=112758171987743, idle2=112758171987743, walk=105398643971664, run=81980688988481, jump=95845383984913, fall=91206221270256, climb=77455242814172, swimidle=137674505873151, swim=137674505873151, useGetObjects=true},
    {name="Astronaut",         idle1=891621366,        idle2=891633237,        walk=891667138,         run=10921039308,        jump=891627522,         fall=891617961,         climb=10921032124,      swimidle=891663592,     swim=891663592},
    {name="Bold",              idle1=16738333868,      idle2=16738334710,      walk=16738340646,       run=16738337225,        jump=16738336650,       fall=16738333171,       climb=16738332169,      swimidle=16738339817,   swim=16738339158},
    {name="Bubbly",            idle1=910004836,        idle2=910009958,        walk=910034870,         run=10921057244,        jump=910016857,         fall=910001910,         climb=nil,              swimidle=910030921,     swim=910028158},
    {name="Cartoony",          idle1=742637544,        idle2=742638445,        walk=742640026,         run=10921076136,        jump=742637942,         fall=742637151,         climb=742636889,        swimidle=10921079380,   swim=10921079380},
    {name="Elder",             idle1=10921101664,      idle2=10921102574,      walk=10921111375,       run=10921104374,        jump=10921107367,       fall=10921105765,       climb=845392038,        swimidle=10921110146,   swim=10921108971},
    {name="Knight",            idle1=657595757,        idle2=657568135,        walk=10921127095,       run=10921121197,        jump=910016857,         fall=10921122579,       climb=10921125160,      swimidle=10921125935,   swim=10921125160},
    {name="Levitation",        idle1=616006778,        idle2=616008087,        walk=616013216,         run=616010382,          jump=616008936,         fall=616005863,         climb=10921132092,      swimidle=10921139478,   swim=10921138209},
    {name="Mage",              idle1=707742142,        idle2=707855907,        walk=707897309,         run=10921148209,        jump=10921149743,       fall=707829716,         climb=707826056,        swimidle=707894699,     swim=707876443},
    {name="Ninja",             idle1=656117400,        idle2=656118341,        walk=656121766,         run=656118852,          jump=656117878,         fall=656115606,         climb=656114359,        swimidle=656118341,     swim=nil},
    {name="OldSchool",         idle1=10921230744,      idle2=10921232093,      walk=10921244891,       run=10921240218,        jump=10921242013,       fall=10921241244,       climb=10921229866,      swimidle=10921244018,   swim=10921243048},
    {name="Pirate",            idle1=750781874,        idle2=750782770,        walk=750785693,         run=750783738,          jump=750782230,         fall=750780242,         climb=750779899,        swimidle=750785176,     swim=750784579},
    {name="Robot",             idle1=616088211,        idle2=616089559,        walk=616095330,         run=10921250460,        jump=616090535,         fall=616087089,         climb=616086039,        swimidle=10921253767,   swim=10921253142},
    {name="Stylish",           idle1=616136790,        idle2=616138447,        walk=616146177,         run=10921276116,        jump=616139451,         fall=616134815,         climb=10921271391,      swimidle=10921281964,   swim=10921281000},
    {name="SuperHero",         idle1=10921288909,      idle2=10921290167,      walk=10921298616,       run=10921291831,        jump=10921294559,       fall=10921293373,       climb=10921286911,      swimidle=10921297391,   swim=10921295495},
    {name="Toy",               idle1=782841498,        idle2=782845736,        walk=782843345,         run=10921306285,        jump=10921308158,       fall=782846423,         climb=10921300839,      swimidle=10921310341,   swim=10921309319},
    {name="Vampire",           idle1=1083445855,       idle2=1083450166,       walk=1083473930,        run=10921320299,        jump=1083455352,        fall=1083443587,        climb=1083439238,       swimidle=10921325443,   swim=10921324408},
    {name="Werewolf",          idle1=1083195517,       idle2=1083214717,       walk=1083178339,        run=10921336997,        jump=1083218792,        fall=1083189019,        climb=10921329322,      swimidle=10921341319,   swim=10921340419},
    {name="Cowboy",            idle1=1014390418,       idle2=1014398616,       walk=1014421541,        run=1014401683,         jump=1014394726,        fall=1014384571,        climb=1014380606,       swimidle=1014411816,    swim=1014406523},
    {name="Ghost",             idle1=616006778,        idle2=616008087,        walk=616013216,         run=616013216,          jump=616008936,         fall=616005863,         climb=616003713,        swimidle=616012453,     swim=616011509},
    {name="Patrol",            idle1=1149612882,       idle2=1150842221,       walk=1151231493,        run=1150967949,         jump=1148811837,        fall=1148863382,        climb=1148811837,       swimidle=1151221899,    swim=1151204998},
    {name="Sneaky",            idle1=1132473842,       idle2=1132477671,       walk=1132510133,        run=1132494274,         jump=1132489853,        fall=1132469004,        climb=1132461372,       swimidle=1132506407,    swim=1132500520},
    {name="Sports (Adidas)",   idle1=18537376492,      idle2=18537371272,      walk=18537392113,       run=18537384940,        jump=18537380791,        fall=18537367238,       climb=18537363391,      swimidle=18537387180,   swim=18537389531},
    {name="Wicked Dancing",    idle1=92849173543269,   idle2=132238900951109,  walk=73718308412641,    run=135515454877967,    jump=78508480717326,    fall=78147885297412,    climb=129447497744818,  swimidle=129183123083281, swim=110657013921774, useGetObjects=true},
    {name="Adidas Aura",       idle1=110211186840347,  idle2=114191137265065,  walk=83842218823011,    run=118320322718866,    jump=109996626521204,   fall=95603166884636,    climb=97824616490448,   swimidle=94922130551805,  swim=134530128383903,  useGetObjects=true},
    {name="None (Reset)",      idle1=0,                idle2=0,                walk=0,                 run=0,                  jump=0,                 fall=0,                 climb=nil,              swimidle=0,             swim=0},
}

    function initializeAnimationGUI()
        if isGameAnimationOverrideActive then
            showNotification("Fitur animasi dinonaktifkan oleh game ini.", Color3.fromRGB(255, 150, 0))
            return
        end
        if not hasPermission("VIP") then
            showNotification("Silahkan upgrade ke VIP terlebih dahulu, Terimakasih", Color3.fromRGB(255,100,0))
            return
        end
        destroyAnimationGUI()

        pcall(function()
            local GazeGoGui = CoreGui or Players.LocalPlayer:WaitForChild("PlayerGui")

            local guiName = "GazeVerificator"
            if GazeGoGui:FindFirstChild(guiName) then return end

            AnimationScreenGui = Instance.new("ScreenGui")
            AnimationScreenGui.Name = guiName
            AnimationScreenGui.Parent = GazeGoGui
            AnimationScreenGui.DisplayOrder = 10 -- [PERBAIKAN] Atur agar selalu di depan

            local camera = workspace.CurrentCamera
            local function getScaledSize(relativeWidth, relativeHeight)
                local viewportSize = camera.ViewportSize
                return UDim2.new(0, viewportSize.X * relativeWidth, 0, viewportSize.Y * relativeHeight)
            end
            
            local frame = Instance.new("Frame")
            frame.Name = "GazeBro"
            frame.Size = getScaledSize(0.15, 0.25) -- Ukuran relatif diperkecil
            frame.Position = UDim2.new(1, -(frame.Size.X.Offset + 20), 0.6, 0) -- Pindahkan ke kanan (bawah)
            if loadedGuiPositions and loadedGuiPositions.Animationframe then
                local posData = loadedGuiPositions.Animationframe
                pcall(function() frame.Position = UDim2.new(posData.XScale, posData.XOffset, posData.YScale, posData.YOffset) end)
            end
            frame.BackgroundColor3 = Color3.fromRGB(25, 28, 40)
            frame.BackgroundTransparency = 0.2
            frame.BorderSizePixel = 0
            
            local AnimStroke = Instance.new("UIStroke", frame)
            AnimStroke.Name = "AnimBorderStroke"
            AnimStroke.Color = Color3.fromRGB(0, 120, 255)
            AnimStroke.Thickness = 2
            AnimStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
            if UI.registerThemeElement then
                UI.registerThemeElement(AnimStroke, "Color", AnimStroke.Color)
            end
            if isGradientRole() then applyDeveloperGradient(AnimStroke) end
            frame.Visible = false 
            frame.Parent = AnimationScreenGui

            local animHeader = Instance.new("TextButton", frame)
            animHeader.Name = "AnimHeader"
            animHeader.Text = ""
            animHeader.Size = UDim2.new(1, 0, 0.15, 0)
            animHeader.Position = UDim2.new(0, 0, 0, 0)
            animHeader.BackgroundColor3 = Color3.fromRGB(25, 28, 40)
            animHeader.BorderSizePixel = 0
            animHeader.AutoButtonColor = false
            UI.MakeDraggable(frame, animHeader, function() return true end, nil)


            local labelSize = UDim2.new(1, 0, 1, 0)
            local gazeLabel = Instance.new("TextLabel", animHeader)
            gazeLabel.Name = "GazeLabel"
            gazeLabel.Text = "Arexans Anim [VIP]"
            gazeLabel.Font = Enum.Font.SourceSansBold
            gazeLabel.TextScaled = true
            gazeLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
            gazeLabel.BackgroundTransparency = 1
            gazeLabel.Size = labelSize
            gazeLabel.Position = UDim2.new(0, 0, 0, 0)

            local hideButton = Instance.new("TextButton", animHeader)
            hideButton.Name = "HideButton"
            hideButton.Text = ""
            hideButton.Font = Enum.Font.SourceSansBold
            hideButton.TextScaled = true
            hideButton.TextColor3 = Color3.fromRGB(255, 255, 255)
            hideButton.BackgroundTransparency = 1
            hideButton.BorderSizePixel = 0
            hideButton.AnchorPoint = Vector2.new(1, 0.5)
            hideButton.Size = UDim2.new(0, 26, 0, 26)
            hideButton.Position = UDim2.new(1, -6, 0.5, 0)
            pcall(function() hideButton:SetAttribute("ArexansNoDeveloperGradient", true); hideButton:SetAttribute("ArexansAllowDeveloperIconGradient", true) end)
            if UI.applyIcon then
                UI.applyIcon(hideButton, UI.Icons.DeleteRecord or UI.Icons.Wastebasket, getResolvedThemeColor(Color3.fromRGB(255, 255, 255)))
                local hideIconImg = hideButton:FindFirstChild("ArexansIconImage")
                if hideIconImg then
                    hideIconImg.Size = UDim2.new(1, 0, 1, 0)
                    pcall(function() hideIconImg:SetAttribute("ArexansAllowDeveloperIconGradient", true); hideIconImg:SetAttribute("ArexansAllowDeveloperGradient", true); hideIconImg:SetAttribute("ArexansNoDeveloperGradient", false) end)
                    if isGradientRole() then applyDeveloperGradient(hideIconImg) end
                end
            end
            hideButton.MouseButton1Click:Connect(function()
                frame.Visible = false
                AnimationShowButton.Visible = true
            end)

            local searchBar = Instance.new("TextBox", frame)
            searchBar.Name = "SearchBar"
            searchBar.PlaceholderText = "Search..."
            searchBar.Text = ""
            searchBar.Font = Enum.Font.SourceSans
            searchBar.TextScaled = true
            searchBar.TextColor3 = Color3.fromRGB(200, 200, 200)
            searchBar.BackgroundTransparency = 1
            searchBar.BorderSizePixel = 0
            searchBar.Size = UDim2.new(0.9, 0, 0.1, 0)
            searchBar.Position = UDim2.new(0.05, 0, 0.17, 0)
            searchBar.ClearTextOnFocus = true
            
            local searchCorner = Instance.new("UICorner", searchBar)
            searchCorner.CornerRadius = UDim.new(0, 6)
            local searchStroke = Instance.new("UIStroke", searchBar)
            searchStroke.Color = Color3.fromRGB(0, 150, 255)
            searchStroke.Thickness = 1
            searchStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
            registerThemeElement(searchStroke, "Color", searchStroke.Color)

            local scrollFrame = Instance.new("ScrollingFrame", frame)
            scrollFrame.Name = "ScrollFrame"
            scrollFrame.Size = UDim2.new(0.9, 0, 0.7, 0)
            scrollFrame.Position = UDim2.new(0.05, 0, 0.28, 0)
            scrollFrame.BackgroundColor3 = Color3.fromRGB(35, 40, 55)
            scrollFrame.BorderSizePixel = 0
            scrollFrame.ScrollBarThickness = 6
            scrollFrame.ScrollingDirection = Enum.ScrollingDirection.Y
            scrollFrame.CanvasSize = UDim2.new(0, 0, 0, 0)
            scrollFrame.ScrollBarImageColor3 = Color3.fromRGB(0, 120, 255)

            local resizeHandle = Instance.new("TextButton", frame)
            resizeHandle.Name = "ResizeHandle"
            resizeHandle.Text = ""
            resizeHandle.Size = UDim2.new(0, 15, 0, 15)
            resizeHandle.Position = UDim2.new(1, -15, 1, -15)
            resizeHandle.BackgroundColor3 = Color3.fromRGB(0, 120, 255)
            resizeHandle.BackgroundTransparency = 0.5
            resizeHandle.BorderSizePixel = 0
            resizeHandle.ZIndex = 2
            
            task.spawn(function()
                local buttons = {}
                local activeAnimationButtons = {}
                local defaultButtonColor = Color3.fromRGB(0, 120, 255)
                local activeButtonColor = Color3.fromRGB(28, 184, 88) -- Warna hijau untuk tombol aktif

                local function createTheButton(text, callback)
                    local button = Instance.new("TextButton", scrollFrame)
                    button.Text = text
                    button.Font = Enum.Font.SourceSans
                    button.TextScaled = false 
                    button.TextSize = 9 -- Diperkecil
                    button.TextColor3 = Color3.fromRGB(255, 255, 255)
                    button.BackgroundColor3 = defaultButtonColor -- Menggunakan warna default
                    button.Size = UDim2.new(1, 0, 0, 22) -- Diperkecil
                    button.Position = UDim2.new(1, 0, 0, #buttons * 26) -- Disesuaikan
                    button.BackgroundTransparency = 1
                    button.BorderSizePixel = 0
                    button.MouseButton1Click:Connect(callback)
                    UI.RegisterButtonEffect(button)
                    local tweenInfo = TweenInfo.new(0.1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
                    local targetTransparency = isAnimationTransparent and 0.85 or 0.3
                    local goal = {Position = UDim2.new(0, 0, 0, #buttons * 26), BackgroundTransparency = targetTransparency} 
                    TweenService:Create(button, tweenInfo, goal):Play()
                    table.insert(buttons, button)
                    scrollFrame.CanvasSize = UDim2.new(0, 0, 0, #buttons * 26)
                    return button -- Mengembalikan instance tombol
                end

                searchBar:GetPropertyChangedSignal("Text"):Connect(function()
                    local searchText = searchBar.Text:lower()
                    local order = 0
                    for _, button in ipairs(buttons) do
                        if searchText == "" or button.Text:lower():find(searchText) then
                            button.Visible = true
                            button.Position = UDim2.new(0, 0, 0, order * 30) 
                            order = order + 1
                        else
                            button.Visible = false
                        end
                    end
                    scrollFrame.CanvasSize = UDim2.new(0, 0, 0, order * 30)
                end)
                
                local isResizing = false
                local initialMousePosition, initialFrameSize
                resizeHandle.InputBegan:Connect(function(input) if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then isResizing = true; initialMousePosition = UserInputService:GetMouseLocation(); initialFrameSize = frame.AbsoluteSize; end end)
                UserInputService.InputChanged:Connect(function(input) if isResizing and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then local delta = UserInputService:GetMouseLocation() - initialMousePosition; local newSizeX = math.max(100, initialFrameSize.X + delta.X); local newSizeY = math.max(100, initialFrameSize.Y + delta.Y); frame.Size = UDim2.new(0, newSizeX, 0, newSizeY); frame.Position = UDim2.new(frame.Position.X.Scale, frame.Position.X.Offset, frame.Position.Y.Scale, frame.Position.Y.Offset) end end)
                UserInputService.InputEnded:Connect(function(input) if isResizing and (input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch) then isResizing = false; end end)
                
                local speaker = Players.LocalPlayer
                
                -- [[ PERUBAHAN DIMULAI: Memuat animasi dari JSON ]]
                local Animations = {}
                local success, animData = pcall(function()
                    return HttpService:JSONDecode(game:HttpGet("https://raw.githubusercontent.com/AREXANS/emoteff/refs/heads/main/animation.json"))
                end)

                if not success or type(animData) ~= "table" then
                    warn("ArexansTools - Gagal memuat data animasi:", animData)
                    showNotification("Gagal memuat animasi VIP.", Color3.fromRGB(200, 50, 50))
                    return -- Hentikan fungsi jika data tidak bisa dimuat
                end
                
                                Animations = animData
                -- Tambahkan animasi dari ANIM_PRESETS ke dalam data GazeVerificator
                if ANIM_PRESETS then
                    if not Animations.Idle then Animations.Idle = {} end
                    if not Animations.Walk then Animations.Walk = {} end
                    if not Animations.Run then Animations.Run = {} end
                    if not Animations.Jump then Animations.Jump = {} end
                    if not Animations.Fall then Animations.Fall = {} end
                    if not Animations.SwimIdle then Animations.SwimIdle = {} end
                    if not Animations.Swim then Animations.Swim = {} end
                    if not Animations.Climb then Animations.Climb = {} end

                    for _, preset in ipairs(ANIM_PRESETS) do
                        if preset.name and not Animations.Idle[preset.name] then
                            if preset.idle1 and preset.idle2 then Animations.Idle[preset.name] = {preset.idle1, preset.idle2} end
                            if preset.walk then Animations.Walk[preset.name] = preset.walk end
                            if preset.run then Animations.Run[preset.name] = preset.run end
                            if preset.jump then Animations.Jump[preset.name] = preset.jump end
                            if preset.fall then Animations.Fall[preset.name] = preset.fall end
                            if preset.swimidle then Animations.SwimIdle[preset.name] = preset.swimidle end
                            if preset.swim then Animations.Swim[preset.name] = preset.swim end
                            if preset.climb then Animations.Climb[preset.name] = preset.climb end
                        end
                    end
                end

                -- [[ PERUBAHAN SELESAI ]]

                local function loadAnimation(animationId)
                    local char = speaker.Character or speaker.CharacterAdded:Wait()
                    local humanoid = char and char:FindFirstChildOfClass("Humanoid")
                    if not humanoid then return nil end
                    local anim = Instance.new("Animation")
                    anim.AnimationId = "rbxassetid://" .. tostring(animationId)
                    local okTrack, track = pcall(function()
                        return humanoid:LoadAnimation(anim)
                    end)
                    anim:Destroy()
                    if okTrack then return track end
                    return nil
                end
                -- v10: jangan preload semua animasi remote. Beberapa asset private/invalid (mis. 750782776)
                -- memicu error Roblox saat execute. Animasi baru dimuat saat benar-benar dipilih.

                local function Buy(gamePassID)
                    pcall(function() game:GetService("MarketplaceService"):PromptGamePassPurchase(speaker, gamePassID) end)
                end
                
                -- [[ FUNGSI PENERAPAN ANIMASI (DIPERBAIKI) ]]
                local function setAnimation(animationType, animationId)
                    if isGameAnimationOverrideActive then return end
                    local function saveLastAnimations() 
                        if writefile then 
                            pcall(function() 
                                local data = HttpService:JSONEncode(lastAnimations)
                                writefile(ANIMATION_SAVE_FILE, data) 
                            end) 
                        end 
                    end

                    local char = speaker.Character
                    if not char then return end
                    local animateScript = char:FindFirstChild("Animate")
                    if not animateScript then return end

                    -- Helper function to replace an animation for smoother replication
                    local function replaceAnimation(parent, animName, newId)
                        if not parent then return end
                        -- Destroy the old animation object if it exists
                        local oldAnim = parent:FindFirstChild(animName)
                        if oldAnim then
                            oldAnim:Destroy()
                        end
                        -- Create a new animation instance
                        local newAnim = Instance.new("Animation")
                        newAnim.Name = animName
                        newAnim.AnimationId = "http://www.roblox.com/asset/?id=" .. tostring(newId)
                        newAnim.Parent = parent
                    end

                    if animationType == "Idle" then 
                        lastAnimations.Idle = animationId
                        replaceAnimation(animateScript.idle, "Animation1", animationId[1])
                        replaceAnimation(animateScript.idle, "Animation2", animationId[2])
                    elseif animationType == "Walk" then 
                        lastAnimations.Walk = animationId
                        replaceAnimation(animateScript.walk, "WalkAnim", animationId)
                    elseif animationType == "Run" then 
                        lastAnimations.Run = animationId
                        replaceAnimation(animateScript.run, "RunAnim", animationId)
                    elseif animationType == "Jump" then 
                        lastAnimations.Jump = animationId
                        replaceAnimation(animateScript.jump, "JumpAnim", animationId)
                    elseif animationType == "Fall" then 
                        lastAnimations.Fall = animationId
                        replaceAnimation(animateScript.fall, "FallAnim", animationId)
                    elseif animationType == "Swim" and animateScript.swim then 
                        lastAnimations.Swim = animationId
                        replaceAnimation(animateScript.swim, "Swim", animationId)
                    elseif animationType == "SwimIdle" and animateScript.swimidle then 
                        lastAnimations.SwimIdle = animationId
                        replaceAnimation(animateScript.swimidle, "SwimIdle", animationId)
                    elseif animationType == "Climb" then 
                        lastAnimations.Climb = animationId
                        replaceAnimation(animateScript.climb, "ClimbAnim", animationId)
                    end
                    saveLastAnimations()
                end
                
                local function PlayEmote(animationId) 
                    local char = speaker.Character; if not char or not char:FindFirstChildOfClass("Humanoid") then return end
                    local Hum = char:FindFirstChildOfClass("Humanoid")
                    for _, v in next, Hum:GetPlayingAnimationTracks() do v:Stop() end
                    local track = loadAnimation(animationId); track:Play()
                    local conn; conn = RunService.RenderStepped:Connect(function() if speaker.Character:WaitForChild("Humanoid").MoveDirection.Magnitude > 0 then track:Stop(); conn:Disconnect() end end) 
                end
                local function ZeroPlayEmote(animationId) 
                    local char = speaker.Character; if not char or not char:FindFirstChildOfClass("Humanoid") then return end
                    local Hum = char:FindFirstChildOfClass("Humanoid")
                    for _, v in next, Hum:GetPlayingAnimationTracks() do v:Stop() end
                    local track = loadAnimation(animationId); track:Play(); track:AdjustSpeed(0)
                    local conn; conn = RunService.RenderStepped:Connect(function() if speaker.Character:WaitForChild("Humanoid").MoveDirection.Magnitude > 0 then track:Stop(); conn:Disconnect() end end) 
                end
                local function FPlayEmote(animationId) 
                    local char = speaker.Character; if not char or not char:FindFirstChildOfClass("Humanoid") then return end
                    local Hum = char:FindFirstChildOfClass("Humanoid")
                    for _, v in next, Hum:GetPlayingAnimationTracks() do v:Stop() end
                    local track = loadAnimation(animationId); track:Play(); task.delay(track.Length * 0.9, function() track:AdjustSpeed(0) end)
                    local conn; conn = RunService.RenderStepped:Connect(function() if speaker.Character:WaitForChild("Humanoid").MoveDirection.Magnitude > 0 then track:Stop(); conn:Disconnect() end end) 
                end
                
                local function AddEmote(name, id) createTheButton(name.." - Emote", function() PlayEmote(id) end) end
                local function ZeroAddEmote(name, id) createTheButton(name.." - Emote", function() ZeroPlayEmote(id) end) end
                local function AddFEmote(name, id) createTheButton(name.." - Emote", function() FPlayEmote(id) end) end
                local function AddDonate(Price, Id) createTheButton("Donate "..Price.." Robux", function() Buy(Id) end) end
                
                -- [PERBAIKAN DIMULAI]
                -- Fungsi bantuan untuk membandingkan ID animasi (termasuk yang berbentuk tabel seperti Idle)
                local function areAnimIdsEqual(id1, id2)
                    if type(id1) ~= type(id2) then return false end
                    if type(id1) == "table" then
                        if #id1 ~= #id2 then return false end
                        for i = 1, #id1 do
                            if id1[i] ~= id2[i] then return false end
                        end
                        return true
                    else
                        return id1 == id2
                    end
                end

                local function createAnimationButton(text, animType, animId)
                    local btn
                    btn = createTheButton(text.." - "..animType, function()
                        -- Saat tombol diklik, warnai ulang tombol aktif sebelumnya menjadi biru
                        if activeAnimationButtons[animType] and activeAnimationButtons[animType] ~= btn then
                            activeAnimationButtons[animType].BackgroundColor3 = defaultButtonColor
                        end
                        -- Warnai tombol yang baru diklik menjadi hijau
                        btn.BackgroundColor3 = activeButtonColor
                        -- Simpan tombol ini sebagai tombol yang aktif untuk tipe animasi ini
                        activeAnimationButtons[animType] = btn
                        -- Terapkan dan simpan animasi
                        setAnimation(animType, animId)
                    end)
                    
                    -- Cek apakah animasi ini adalah yang terakhir digunakan saat GUI dibuat
                    if lastAnimations[animType] and areAnimIdsEqual(lastAnimations[animType], animId) then
                        -- Jika ya, langsung warnai hijau dan tandai sebagai aktif
                        btn.BackgroundColor3 = activeButtonColor
                        activeAnimationButtons[animType] = btn
                    end
                end
                -- [PERBAIKAN SELESAI]
                
                local function resetToRthroPack()
                    local anims = Animations
                    if anims.Idle["Rthro"] then setAnimation("Idle", anims.Idle["Rthro"]) end
                    if anims.Walk["Rthro"] then setAnimation("Walk", anims.Walk["Rthro"]) end
                    if anims.Run["Rthro"] then setAnimation("Run", anims.Run["Rthro"]) end
                    if anims.Jump["Rthro"] then setAnimation("Jump", anims.Jump["Rthro"]) end
                    if anims.Fall["Rthro"] then setAnimation("Fall", anims.Fall["Rthro"]) end
                    if anims.SwimIdle["Rthro"] then setAnimation("SwimIdle", anims.SwimIdle["Rthro"]) end
                    if anims.Swim["Rthro"] then setAnimation("Swim", anims.Swim["Rthro"]) end
                    if anims.Climb["Rthro"] then setAnimation("Climb", anims.Climb["Rthro"]) end

                    for animType, button in pairs(activeAnimationButtons) do
                        if button and button.Parent then
                            button.BackgroundColor3 = defaultButtonColor
                        end
                    end
                    activeAnimationButtons = {}
                    
                    showNotification("Semua animasi direset ke Rthro Pack", Color3.fromRGB(50, 150, 255))
                end

                local resetButton = createTheButton("Reset Semua Animasi Rthro", resetToRthroPack)
                resetButton.BackgroundColor3 = Color3.fromRGB(200, 70, 70)

                local function resetToAdidasSport()
                    local anims = Animations
                    if anims.Walk["Sports (Adidas)"] then setAnimation("Walk", anims.Walk["Sports (Adidas)"]) end
                    if anims.Run["Sports (Adidas)"] then setAnimation("Run", anims.Run["Sports (Adidas)"]) end
                    if anims.Jump["Sports (Adidas)"] then setAnimation("Jump", anims.Jump["Sports (Adidas)"]) end
                    if anims.Fall["Sports (Adidas)"] then setAnimation("Fall", anims.Fall["Sports (Adidas)"]) end
                    if anims.Swim["Sports (Adidas)"] then setAnimation("Swim", anims.Swim["Sports (Adidas)"]) end
                    if anims.SwimIdle["Sports (Adidas)"] then setAnimation("SwimIdle", anims.SwimIdle["Sports (Adidas)"]) end
                    if anims.Climb["Sports (Adidas)"] then setAnimation("Climb", anims.Climb["Sports (Adidas)"]) end
                end
                createTheButton("Reset to Adidas Sport", resetToAdidasSport)
                
                for name, ids in pairs(Animations.Idle) do task.wait(); createAnimationButton(name, "Idle", ids) end
                for name, id in pairs(Animations.Walk) do task.wait(); createAnimationButton(name, "Walk", id) end
                for name, id in pairs(Animations.Run) do task.wait(); createAnimationButton(name, "Run", id) end
                for name, id in pairs(Animations.Jump) do task.wait(); createAnimationButton(name, "Jump", id) end
                for name, id in pairs(Animations.Fall) do task.wait(); createAnimationButton(name, "Fall", id) end
                for name, id in pairs(Animations.SwimIdle) do task.wait(); createAnimationButton(name, "SwimIdle", id) end
                for name, id in pairs(Animations.Swim) do task.wait(); createAnimationButton(name, "Swim", id) end
                for name, id in pairs(Animations.Climb) do task.wait(); createAnimationButton(name, "Climb", id) end

                AddDonate(20, 1131371530); AddDonate(200, 1131065702); AddDonate(183, 1129915318); AddDonate(2000, 1128299749)
                AddEmote("Dance 1", 12521009666); AddEmote("Dance 2", 12521169800); AddEmote("Dance 3", 12521178362); AddEmote("Cheer", 12521021991); AddEmote("Laugh", 12521018724); AddEmote("Point", 12521007694); AddEmote("Wave", 12521004586)
                AddFEmote("Soldier - Assault Fire", 4713811763); AddEmote("Soldier - Assault Aim", 4713633512); AddEmote("Zombie - Attack", 3489169607); AddFEmote("Zombie - Death", 3716468774); AddEmote("Roblox - Sleep", 2695918332); AddEmote("Roblox - Quake", 2917204509); AddEmote("Roblox - Rifle Reload", 3972131105)
                ZeroAddEmote("Accurate T Pose", 2516930867)
            end)

            if applyAnimationTransparency then
                applyAnimationTransparency(isAnimationTransparent)
            end
        end)
    end
    
    applyAnimationTransparency = function(isTransparent)
        if not AnimationScreenGui then return end
        local frame = AnimationScreenGui:FindFirstChild("GazeBro", true)
        
        local transValue = 0.85

        if frame then
            local searchBar = frame:FindFirstChild("SearchBar")
            local scrollFrame = frame:FindFirstChild("ScrollFrame")
            local resizeHandle = frame:FindFirstChild("ResizeHandle")
            
            frame.BackgroundTransparency = isTransparent and transValue or 0.2
            AnimationShowButton.BackgroundTransparency = isTransparent and transValue or 0.3
            if searchBar then searchBar.BackgroundTransparency = isTransparent and transValue or 0 end
            if scrollFrame then scrollFrame.BackgroundTransparency = isTransparent and transValue or 0 end
            if resizeHandle then resizeHandle.BackgroundTransparency = isTransparent and 0.9 or 0.5 end

            if scrollFrame then
                for _, button in ipairs(scrollFrame:GetChildren()) do
                    if button:IsA("TextButton") then
                        local targetTransparency = isTransparent and transValue or 0.3
                        TweenService:Create(button, TweenInfo.new(0.1), {BackgroundTransparency = targetTransparency}):Play()
                    end
                end
            end
        end
    end

    function cleanupPlayerESP(userId)
        local elements = espCache[userId]
        if elements then
            if elements.billboard then pcall(function() elements.billboard:Destroy() end) end
            if elements.highlight then pcall(function() elements.highlight:Destroy() end) end
            if elements.beam then pcall(function() elements.beam:Destroy() end) end
            if elements.attachment0 then pcall(function() elements.attachment0:Destroy() end) end
            if elements.attachment1 then pcall(function() elements.attachment1:Destroy() end) end
            espCache[userId] = nil
        end
    end

    function cleanupAllESP()
        if EspRenderConnection then
            EspRenderConnection:Disconnect()
            EspRenderConnection = nil
        end
        for userId, _ in pairs(espCache) do
            cleanupPlayerESP(userId)
        end
    end

    function UpdateESP()
        local isAnyEspActive = IsEspNameEnabled or IsEspBodyEnabled or IsEspLineEnabled or IsEspHealthBarEnabled
        if not isAnyEspActive then return end

        local localPlayerTeam = LocalPlayer.Team
        local localCharacter = LocalPlayer.Character
        local localRoot = localCharacter and localCharacter:FindFirstChild("HumanoidRootPart")
        local camera = Workspace.CurrentCamera
        if not localRoot or not camera then return end

        for _, player in ipairs(Players:GetPlayers()) do
            if player ~= LocalPlayer then
                local char = player.Character
                local head = char and char:FindFirstChild("Head")
                local hrp = char and char:FindFirstChild("HumanoidRootPart")
                local humanoid = char and char:FindFirstChildOfClass("Humanoid")

                if head and hrp and humanoid and humanoid.Health > 0 then
                    local espElements = espCache[player.UserId]
                    if not espElements then
                        espElements = {}
                        espCache[player.UserId] = espElements
                    end

                    local isTeam = (player.Team == localPlayerTeam and localPlayerTeam ~= nil)
                    local espColor = isTeam and teamColor or enemyColor
                    local distance = (localRoot.Position - head.Position).Magnitude
                    local isBillboardNeeded = IsEspNameEnabled or IsEspHealthBarEnabled

                    if isBillboardNeeded then
                        if not espElements.billboard then
                            local billboardGui = Instance.new("BillboardGui")
                            billboardGui.Name = "PlayerESP_Billboard"
                            billboardGui.AlwaysOnTop = true
                            billboardGui.Size = UDim2.new(0, 150, 0, 45)
                            billboardGui.StudsOffset = Vector3.new(0, 2.5, 0)

                            local nameLabel = Instance.new("TextLabel", billboardGui)
                            nameLabel.Name = "NameLabel"
                            nameLabel.Size = UDim2.new(1, 0, 0.4, 0)
                            nameLabel.Position = UDim2.new(0, 0, 0, 0)
                            nameLabel.BackgroundTransparency = 1
                            nameLabel.Font = Enum.Font.SourceSansBold
                            nameLabel.TextSize = 14
                            nameLabel.Text = player.DisplayName
                            nameLabel.TextXAlignment = Enum.TextXAlignment.Center

                            local distLabel = Instance.new("TextLabel", billboardGui)
                            distLabel.Name = "DistanceLabel"
                            distLabel.Size = UDim2.new(1, 0, 0.3, 0)
                            distLabel.Position = UDim2.new(0, 0, 0.4, 0)
                            distLabel.BackgroundTransparency = 1
                            distLabel.Font = Enum.Font.SourceSans
                            distLabel.TextSize = 12
                            distLabel.TextColor3 = Color3.fromRGB(220, 220, 220)
                            distLabel.TextXAlignment = Enum.TextXAlignment.Center

                            local healthFrame = Instance.new("Frame", billboardGui)
                            healthFrame.Name = "HealthBackground"
                            healthFrame.Size = UDim2.new(1, -10, 0, 8)
                            healthFrame.Position = UDim2.new(0.5, -70, 0.7, 0)
                            healthFrame.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
                            healthFrame.BorderSizePixel = 1
                            healthFrame.BorderColor3 = Color3.fromRGB(0, 0, 0)

                            local healthFill = Instance.new("Frame", healthFrame)
                            healthFill.Name = "HealthFill"
                            healthFill.Size = UDim2.new(1, 0, 1, 0)
                            healthFill.Position = UDim2.new(0, 0, 0, 0)
                            healthFill.BackgroundColor3 = espColor
                            healthFill.BorderSizePixel = 0

                            espElements.billboard = billboardGui
                        end

                        espElements.billboard.Adornee = head
                        espElements.billboard.Parent = CoreGui
                        espElements.billboard.NameLabel.Visible = IsEspNameEnabled
                        espElements.billboard.NameLabel.TextColor3 = espColor
                        espElements.billboard.DistanceLabel.Visible = IsEspNameEnabled
                        espElements.billboard.DistanceLabel.Text = "[" .. tostring(math.floor(distance)) .. "m]"

                        local healthBackground = espElements.billboard:FindFirstChild("HealthBackground")
                        if healthBackground then
                            healthBackground.Visible = IsEspHealthBarEnabled
                            if IsEspHealthBarEnabled then
                                local MaxDistance = 150
                                local MinScaleFactor = 0.3
                                local BaseBarWidth = 140
                                local scaleFactor = math.max(MinScaleFactor, 1 - (distance / MaxDistance))
                                local scaledWidth = BaseBarWidth * scaleFactor
                                healthBackground.Size = UDim2.new(0, scaledWidth, 0, 8)
                                local centerOffset = (150 - scaledWidth) / 2
                                healthBackground.Position = UDim2.new(0, centerOffset, 0.7, 0)
                                local healthPercentage = humanoid.Health / humanoid.MaxHealth
                                local healthFillFrame = healthBackground.HealthFill
                                healthFillFrame.Size = UDim2.new(healthPercentage, 0, 1, 0)
                                healthFillFrame.BackgroundColor3 = espColor
                            end
                        end
                    elseif espElements.billboard then
                        espElements.billboard:Destroy()
                        espElements.billboard = nil
                    end

                    if IsEspBodyEnabled then
                        if not espElements.highlight then
                            local highlight = Instance.new("Highlight")
                            highlight.Name = "ESPHighlight"
                            highlight.FillTransparency = 0.7
                            highlight.OutlineTransparency = 0.5
                            highlight.Parent = char
                            espElements.highlight = highlight
                        end
                        if espElements.highlight.Parent ~= char then espElements.highlight.Parent = char end
                        espElements.highlight.FillColor = espColor
                        espElements.highlight.OutlineColor = espColor
                    elseif espElements.highlight then
                        espElements.highlight:Destroy()
                        espElements.highlight = nil
                    end

                    if IsEspLineEnabled then
                        if not espElements.attachment0 then
                            local att0 = Instance.new("Attachment")
                            att0.Name = "ESPGarisAtt0_Origin"
                            att0.Parent = camera
                            espElements.attachment0 = att0
                        end
                        if not espElements.attachment1 then
                            local att1 = Instance.new("Attachment")
                            att1.Name = "ESPGarisAtt1_Target"
                            att1.Parent = hrp
                            espElements.attachment1 = att1
                        end
                        if not espElements.beam then
                            local beam = Instance.new("Beam")
                            beam.Name = "ESPBeam"
                            beam.Attachment0 = espElements.attachment0
                            beam.Attachment1 = espElements.attachment1
                            beam.Width0 = 0.01
                            beam.Width1 = 0.01
                            beam.FaceCamera = true
                            beam.Transparency = NumberSequence.new(0.5)
                            beam.Parent = espElements.attachment0
                            espElements.beam = beam
                        end
                        local viewportSize = camera.ViewportSize
                        local screenBottom = Vector2.new(viewportSize.X / 2, viewportSize.Y * 0.95)
                        local ray = camera:ViewportPointToRay(screenBottom.X, screenBottom.Y)
                        espElements.attachment0.WorldPosition = ray.Origin + ray.Direction
                        if espElements.attachment1.Parent ~= hrp then espElements.attachment1.Parent = hrp end
                        espElements.beam.Color = ColorSequence.new(espColor)
                        espElements.beam.Enabled = true
                    elseif espElements.beam then
                        if espElements.beam then espElements.beam:Destroy(); espElements.beam = nil end
                        if espElements.attachment0 then espElements.attachment0:Destroy(); espElements.attachment0 = nil end
                        if espElements.attachment1 then espElements.attachment1:Destroy(); espElements.attachment1 = nil end
                    end
                else
                    if espCache[player.UserId] then
                        cleanupPlayerESP(player.UserId)
                    end
                end
            end
        end
    end

    function manageEspConnection()
        local isAnyEspActive = IsEspNameEnabled or IsEspBodyEnabled or IsEspLineEnabled or IsEspHealthBarEnabled
        if isAnyEspActive and not EspRenderConnection then
            EspRenderConnection = RunService.RenderStepped:Connect(UpdateESP)
        elseif not isAnyEspActive and EspRenderConnection then
            cleanupAllESP()
        end
    end

    function ToggleESPName(enabled)
        IsEspNameEnabled = enabled
        saveFeatureStates()
        manageEspConnection()
    end

    function ToggleESPBody(enabled)
        IsEspBodyEnabled = enabled
        saveFeatureStates()
        manageEspConnection()
    end

    function ToggleESPLine(enabled)
        IsEspLineEnabled = enabled
        saveFeatureStates()
        manageEspConnection()
    end

    function ToggleESPHealthBar(enabled)
        IsEspHealthBarEnabled = enabled
        saveFeatureStates()
        manageEspConnection()
    end

    -- ====================================================================
    -- == BAGIAN FUNGSI UTAMA (PLAYER, COMBAT, DLL)                      ==
    -- ====================================================================

    -- [[ FUNGSI UNTUK FITUR KUNCI KECEPATAN ]] --
    speedLock_disconnectAll, speedLock_bindHumanoid = nil, nil
    
    function speedLock_canonicalDefault()
        local ok, val = pcall(function() return game:GetService("StarterPlayer").CharacterWalkSpeed end)
        if ok and typeof(val) == "number" and val > 0 then return val end
        return 16
    end

    function speedLock_setWalkSpeed(humanoid, speed)
        if humanoid and humanoid.Parent then
            pcall(function() humanoid.WalkSpeed = speed end)
        end
    end

    function speedLock_canEnforce()
        local h = speedLock_humanoid
        if not speedLock_isEnforced then return false end
        if not h or not h.Parent then return false end
        if speedLock_isPaused then return false end
        if h.Health <= 0 then return false end
        if h.PlatformStand or h.Sit then return false end
        local st = h:GetState()
        if st == Enum.HumanoidStateType.Ragdoll or st == Enum.HumanoidStateType.FallingDown or st == Enum.HumanoidStateType.Physics or st == Enum.HumanoidStateType.GettingUp or st == Enum.HumanoidStateType.Seated then return false end
        local hrp = h.Parent:FindFirstChild("HumanoidRootPart")
        if hrp and hrp.Anchored then return false end
        return true
    end

    function speedLock_heartbeat()
        if not speedLock_humanoid then return end
        local t = tick()
        if t - speedLock_lastTick < speedLock_tickInterval then return end
        speedLock_lastTick = t
        if not speedLock_canEnforce() then return end
        if speedLock_humanoid.WalkSpeed ~= speedLock_currentSpeed then
            speedLock_setWalkSpeed(speedLock_humanoid, speedLock_currentSpeed)
        end
    end

    speedLock_disconnectAll = function()
        for _, conn in ipairs(speedLock_connections) do
            if conn then conn:Disconnect() end
        end
        speedLock_connections = {}
    end
    
    function speedLock_captureServerBaseline()
        task.spawn(function()
            local h = speedLock_humanoid
            if not h or not h.Parent then return end
            local start = tick()
            local last = h.WalkSpeed
            while tick() - start < 0.6 do
                last = h.WalkSpeed
                task.wait(0.1)
            end
            if typeof(last) == "number" and last > 0 then
                speedLock_serverBaseline = last
            end
        end)
    end

    function speedLock_applyDisabledState()
        local h = speedLock_humanoid
        if not h or not h.Parent then return end
        local target = speedLock_serverBaseline or speedLock_canonicalDefault()
        speedLock_setWalkSpeed(h, target)
        speedLock_captureServerBaseline()
    end

    speedLock_bindHumanoid = function(humanoid)
        if not humanoid then return end
        speedLock_humanoid = humanoid
        speedLock_disconnectAll()

        table.insert(speedLock_connections, humanoid:GetPropertyChangedSignal("WalkSpeed"):Connect(function()
            if speedLock_isEnforced and speedLock_canEnforce() and humanoid.WalkSpeed ~= speedLock_currentSpeed then
                speedLock_setWalkSpeed(humanoid, speedLock_currentSpeed)
            end
        end))

        table.insert(speedLock_connections, humanoid.StateChanged:Connect(function(_, new)
            if new == Enum.HumanoidStateType.Ragdoll or new == Enum.HumanoidStateType.FallingDown or new == Enum.HumanoidStateType.Physics or new == Enum.HumanoidStateType.GettingUp or new == Enum.HumanoidStateType.Seated then
                speedLock_isPaused = true
                task.delay(1.0, function() speedLock_isPaused = false end)
            end
        end))
        
        table.insert(speedLock_connections, humanoid:GetPropertyChangedSignal("PlatformStand"):Connect(function() 
            speedLock_isPaused = humanoid.PlatformStand 
        end))

        table.insert(speedLock_connections, humanoid.AncestryChanged:Connect(function(_, parent)
            if not parent then speedLock_disconnectAll() end
        end))

        if speedLock_isEnforced then
            if not table.find(speedLock_connections, "heartbeat") then
                speedLock_lastTick = 0
                local conn = ConnectEvent(RunService.Heartbeat, speedLock_heartbeat)
                table.insert(speedLock_connections, conn)
            end
            if speedLock_canEnforce() then speedLock_setWalkSpeed(humanoid, speedLock_currentSpeed) end
        else
            speedLock_applyDisabledState()
        end
    end
    -- [[ AKHIR FUNGSI KUNCI KECEPATAN ]]

    stopSpectate = nil; -- Deklarasi awal
    cycleSpectate = nil;
    startSpectate = nil; -- Deklarasi awal

    -- [[ FUNGSI UNTUK FITUR COPY MOVEMENT ]] --
    startCopyMovement, stopCopyMovement, toggleCopyMovement = nil, nil, nil

    stopCopyMovement = function()
        if not isCopyingMovement then return end

        isCopyingMovement = false
        if copyMovementConnection then
            copyMovementConnection:Disconnect()
            copyMovementConnection = nil
        end

        -- Hancurkan physics movers
        for _, mover in pairs(copyMovementMovers) do
            if mover and mover.Parent then pcall(function() mover:Destroy() end) end
        end
        copyMovementMovers = {}

        -- Reset buffer dan cache
        copyMovementBuffer = {}
        copyAnimationCache = {}
        
        -- Reset state karakter lokal
        local char = LocalPlayer.Character
        if char then
            local humanoid = char:FindFirstChildOfClass("Humanoid")
            if humanoid then
                -- Hentikan semua animasi yang sedang berjalan dari fitur ini
                for _, track in ipairs(humanoid:GetPlayingAnimationTracks()) do
                    if track.Name == "CopyMovementAnim" then
                        track:Stop(0.1)
                    end
                end
                -- Kembalikan state normal
                humanoid.PlatformStand = false -- [PERBAIKAN] Kembalikan physics humanoid
                humanoid.AutoRotate = true
                humanoid.WalkSpeed = OriginalWalkSpeed
            end
        end

        local previousCopiedPlayer = copiedPlayer
        copiedPlayer = nil

        if previousCopiedPlayer then
            showNotification("Berhenti mengikuti " .. previousCopiedPlayer.DisplayName, Color3.fromRGB(200, 150, 50))
        end
        
        if updatePlayerList then updatePlayerList() end
    end

    startCopyMovement = function(targetPlayer)
        if isCopyingMovement then
            stopCopyMovement()
            task.wait(0.1) 
        end

        local localChar = LocalPlayer.Character
        local localHrp = localChar and localChar:FindFirstChild("HumanoidRootPart")
        local localHumanoid = localChar and localChar:FindFirstChildOfClass("Humanoid")

        local targetChar = targetPlayer.Character
        local targetHrp = targetChar and targetChar:FindFirstChild("HumanoidRootPart")
        local targetHumanoid = targetChar and targetChar:FindFirstChildOfClass("Humanoid")

        if not (localHrp and localHumanoid and targetHrp and targetHumanoid) then
            showNotification("Target atau karakter Anda tidak valid.", Color3.fromRGB(200, 50, 50))
            return
        end

        isCopyingMovement = true
        copiedPlayer = targetPlayer
        copyMovementBuffer = {} 
        
        -- [PERBAIKAN BARU] Teleport awal ke belakang target
        if localHrp and targetHrp then
            localHrp.CFrame = targetHrp.CFrame * CFrame.new(0, 0, 2)
        end

        -- [PERBAIKAN] Nonaktifkan physics humanoid agar tidak konflik dengan AlignPosition
        if localHumanoid then
            localHumanoid.PlatformStand = true
        end
        
        pcall(function()
            local attachment = Instance.new("Attachment", localHrp)
            attachment.Name = "CopyMovementAttachment"
            local alignPos = Instance.new("AlignPosition", attachment)
            alignPos.Attachment0 = attachment
            alignPos.Mode = Enum.PositionAlignmentMode.OneAttachment
            alignPos.Responsiveness = 200
            alignPos.MaxForce = math.huge -- [PERBAIKAN] Gunakan math.huge
            local alignOrient = Instance.new("AlignOrientation", attachment)
            alignOrient.Attachment0 = attachment
            alignOrient.Mode = Enum.OrientationAlignmentMode.OneAttachment
            alignOrient.Responsiveness = 200
            alignOrient.MaxTorque = math.huge -- [PERBAIKAN] Gunakan math.huge
            copyMovementMovers = {attachment = attachment, alignPos = alignPos, alignOrient = alignOrient}
        end)

        showNotification("Mulai mengikuti " .. targetPlayer.DisplayName, Color3.fromRGB(50, 150, 255))
        if updatePlayerList then updatePlayerList() end

        local lastTeleportTime = 0
        local TELEPORT_COOLDOWN = 1.0

        copyMovementConnection = ConnectEvent(RunService.Heartbeat, function()
            if not isCopyingMovement or not copiedPlayer or not copiedPlayer.Parent then
                stopCopyMovement()
                return
            end

            local lChar = LocalPlayer.Character
            local lHrp = lChar and lChar:FindFirstChild("HumanoidRootPart")
            local lHumanoid = lChar and lChar:FindFirstChildOfClass("Humanoid")
            local tChar = copiedPlayer.Character
            local tHrp = tChar and tChar:FindFirstChild("HumanoidRootPart")
            local tHumanoid = tChar and tChar:FindFirstChildOfClass("Humanoid")

            if not (lHrp and lHumanoid and tHrp and tHumanoid and tHumanoid.Health > 0 and copyMovementMovers.alignPos and copyMovementMovers.alignOrient) then
                stopCopyMovement()
                return
            end

            local currentTime = tick()
            local targetTime = currentTime - copyMovementDelay

            local latestFrame = {
                time = currentTime,
                cframe = tHrp.CFrame,
                state = tHumanoid:GetState(),
                jump = tHumanoid.Jump,
                anims = {}
            }
            if not copyMovementBypassAnimation then
                for _, track in ipairs(tHumanoid:GetPlayingAnimationTracks()) do
                    table.insert(latestFrame.anims, {id = track.Animation.AnimationId, time = track.TimePosition, speed = track.Speed})
                end
            end
            table.insert(copyMovementBuffer, latestFrame)

            while #copyMovementBuffer > 0 and copyMovementBuffer[1].time < targetTime - 1 do
                table.remove(copyMovementBuffer, 1)
            end

            local frame1, frame2
            for i = 1, #copyMovementBuffer do
                if copyMovementBuffer[i].time >= targetTime then
                    frame2 = copyMovementBuffer[i]
                    frame1 = copyMovementBuffer[i-1] or frame2
                    break
                end
            end

            if not frame1 then return end

            local timeDiff = frame2.time - frame1.time
            local alpha = (timeDiff > 0.001) and math.clamp((targetTime - frame1.time) / timeDiff, 0, 1) or 1
            
            local distanceBetweenFrames = (frame2.cframe.Position - frame1.cframe.Position).Magnitude
            if distanceBetweenFrames > 50 and currentTime > lastTeleportTime + TELEPORT_COOLDOWN then
                lChar:SetPrimaryPartCFrame(frame2.cframe)
                lastTeleportTime = currentTime
                return -- Skip physics interpolation for this frame
            end

            local interpolatedCFrame = frame1.cframe:Lerp(frame2.cframe, alpha)
            
            -- [PERBAIKAN BARU] Offset posisi agar mengikuti dari belakang
            local targetCFrame = interpolatedCFrame * CFrame.new(0, 0, 2)

            copyMovementMovers.alignPos.Position = targetCFrame.Position
            copyMovementMovers.alignOrient.CFrame = targetCFrame

            if copyMovementBypassAnimation then
                local stateToApply = frame1.state
                if lHumanoid:GetState() ~= stateToApply then
                    lHumanoid:ChangeState(stateToApply)
                end
                if frame1.jump then
                    lHumanoid.Jump = true
                end
                
                for id, track in pairs(copyAnimationCache) do
                    if track.IsPlaying then track:Stop(0.1) end
                end
                copyAnimationCache = {}
            else
                local requiredAnims = {}
                for _, animData in ipairs(frame1.anims) do
                    requiredAnims[animData.id] = true
                    if not copyAnimationCache[animData.id] then
                        local anim = Instance.new("Animation")
                        anim.AnimationId = animData.id
                        local okLoadedTrack, loadedTrack = pcall(function() return lHumanoid:LoadAnimation(anim) end)
                        if okLoadedTrack and loadedTrack then
                            loadedTrack.Name = "CopyMovementAnim"
                            copyAnimationCache[animData.id] = loadedTrack
                        end
                    end
                    local localTrack = copyAnimationCache[animData.id]
                    if localTrack then
                        if not localTrack.IsPlaying then localTrack:Play(0.1) end
                        localTrack.TimePosition = animData.time
                        localTrack:AdjustSpeed(animData.speed)
                    end
                end
                for id, track in pairs(copyAnimationCache) do
                    if not requiredAnims[id] and track.IsPlaying then track:Stop(0.1) end
                end
            end
        end)
    end

    toggleCopyMovement = function(targetPlayer)
        if not hasPermission("Normal") then
            showNotification("Tingkatkan ke Normal/VIP untuk menggunakan fitur ini.", Color3.fromRGB(255,100,0))
            return
        end
        if isCopyingMovement and copiedPlayer == targetPlayer then
            stopCopyMovement()
        else
            startCopyMovement(targetPlayer)
        end
    end
    
    function SkidFling(TargetPlayer)
        local Character = LocalPlayer.Character
        local Humanoid = Character and Character:FindFirstChildOfClass("Humanoid")
        local RootPart = Humanoid and Humanoid.RootPart
        if not (Character and Humanoid and RootPart) then return end

        -- [PERBAIKAN] Gunakan PlatformStand
        Humanoid.PlatformStand = true

        local TCharacter = TargetPlayer.Character
        if not TCharacter then return end
        
        local THumanoid = TCharacter:FindFirstChildOfClass("Humanoid")
        local TRootPart = THumanoid and THumanoid.RootPart
        local THead = TCharacter:FindFirstChild("Head")
        local Accessory = TCharacter:FindFirstChildOfClass("Accessory")
        local Handle = Accessory and Accessory:FindFirstChild("Handle")

        if RootPart.Velocity.Magnitude < 50 then
            getgenv().OldPos = RootPart.CFrame
        end
        if THumanoid and THumanoid.Sit then
            return showNotification("Target is sitting", Color3.fromRGB(255,100,0))
        end
        
        -- [PERBAIKAN] Hanya ubah kamera jika tidak sedang dalam mode spectate
        if not IsViewingPlayer then
            if THead then
                workspace.CurrentCamera.CameraSubject = THead
            elseif not THead and Handle then
                workspace.CurrentCamera.CameraSubject = Handle
            elseif THumanoid and TRootPart then
                workspace.CurrentCamera.CameraSubject = THumanoid
            end
        end
        
        if not TCharacter:FindFirstChildWhichIsA("BasePart") then
            return
        end
        
        local FPos = function(BasePart, Pos, Ang)
            -- [PERBAIKAN] Hapus pengecekan .Parent agar Fling berfungsi saat spectate (karakter disembunyikan)
            if not (RootPart and Character) then return end
            RootPart.CFrame = CFrame.new(BasePart.Position) * Pos * Ang
            Character:SetPrimaryPartCFrame(CFrame.new(BasePart.Position) * Pos * Ang)
            RootPart.Velocity = Vector3.new(9e8, 9e8 * 10, 9e8)
            RootPart.RotVelocity = Vector3.new(9e9, 9e9, 9e9)
        end
        
        local SFBasePart = function(BasePart)
            local TimeToWait = 2
            local Time = tick()
            local Angle = 0

            repeat
                if RootPart and THumanoid and BasePart and BasePart.Parent then
                    if BasePart.Velocity.Magnitude < 50 then
                        Angle = Angle + 100
                        FPos(BasePart, CFrame.new(0, 1.5, 0) + THumanoid.MoveDirection * BasePart.Velocity.Magnitude / 1.25, CFrame.Angles(math.rad(Angle),0 ,0)); task.wait()
                        FPos(BasePart, CFrame.new(0, -1.5, 0) + THumanoid.MoveDirection * BasePart.Velocity.Magnitude / 1.25, CFrame.Angles(math.rad(Angle), 0, 0)); task.wait()
                        FPos(BasePart, CFrame.new(2.25, 1.5, -2.25) + THumanoid.MoveDirection * BasePart.Velocity.Magnitude / 1.25, CFrame.Angles(math.rad(Angle), 0, 0)); task.wait()
                        FPos(BasePart, CFrame.new(-2.25, -1.5, 2.25) + THumanoid.MoveDirection * BasePart.Velocity.Magnitude / 1.25, CFrame.Angles(math.rad(Angle), 0, 0)); task.wait()
                        FPos(BasePart, CFrame.new(0, 1.5, 0) + THumanoid.MoveDirection,CFrame.Angles(math.rad(Angle), 0, 0)); task.wait()
                        FPos(BasePart, CFrame.new(0, -1.5, 0) + THumanoid.MoveDirection,CFrame.Angles(math.rad(Angle), 0, 0)); task.wait()
                    else
                        FPos(BasePart, CFrame.new(0, 1.5, THumanoid.WalkSpeed), CFrame.Angles(math.rad(90), 0, 0)); task.wait()
                        FPos(BasePart, CFrame.new(0, -1.5, -THumanoid.WalkSpeed), CFrame.Angles(0, 0, 0)); task.wait()
                        FPos(BasePart, CFrame.new(0, 1.5, THumanoid.WalkSpeed), CFrame.Angles(math.rad(90), 0, 0)); task.wait()
                        FPos(BasePart, CFrame.new(0, 1.5, TRootPart.Velocity.Magnitude / 1.25), CFrame.Angles(math.rad(90), 0, 0)); task.wait()
                        FPos(BasePart, CFrame.new(0, -1.5, -TRootPart.Velocity.Magnitude / 1.25), CFrame.Angles(0, 0, 0)); task.wait()
                        FPos(BasePart, CFrame.new(0, 1.5, TRootPart.Velocity.Magnitude / 1.25), CFrame.Angles(math.rad(90), 0, 0)); task.wait()
                        FPos(BasePart, CFrame.new(0, -1.5, 0), CFrame.Angles(math.rad(90), 0, 0)); task.wait()
                        FPos(BasePart, CFrame.new(0, -1.5, 0), CFrame.Angles(0, 0, 0)); task.wait()
                        FPos(BasePart, CFrame.new(0, -1.5 ,0), CFrame.Angles(math.rad(-90), 0, 0)); task.wait()
                        FPos(BasePart, CFrame.new(0, -1.5, 0), CFrame.Angles(0, 0, 0)); task.wait()
                    end
                else
                    break
                end
            until not (BasePart and BasePart.Parent) or BasePart.Velocity.Magnitude > 500 or BasePart.Parent ~= TargetPlayer.Character or TargetPlayer.Parent ~= Players or not TargetPlayer.Character == TCharacter or THumanoid.Sit or Humanoid.Health <= 0 or tick() > Time + TimeToWait
        end
        
        workspace.FallenPartsDestroyHeight = 0/0
        
        -- [PERBAIKAN] Set Network Owner
        pcall(function()
            RootPart:SetNetworkOwner(game:GetService("Players").LocalPlayer)
        end)

        local BV = Instance.new("BodyVelocity")
        BV.Name = "EpixVel"
        BV.Parent = RootPart
        BV.Velocity = Vector3.new(9e8, 9e8, 9e8)
        BV.MaxForce = Vector3.new(math.huge, math.huge, math.huge) -- [PERBAIKAN] Gunakan math.huge
        
        Humanoid:SetStateEnabled(Enum.HumanoidStateType.Seated, false)
        
        if TRootPart and THead then
            if (TRootPart.CFrame.p - THead.CFrame.p).Magnitude > 5 then
                SFBasePart(THead)
            else
                SFBasePart(TRootPart)
            end
        elseif TRootPart and not THead then
            SFBasePart(TRootPart)
        elseif not TRootPart and THead then
            SFBasePart(THead)
        elseif not TRootPart and not THead and Accessory and Handle then
            SFBasePart(Handle)
        end
        
        BV:Destroy()
        Humanoid:SetStateEnabled(Enum.HumanoidStateType.Seated, true)
        
        -- [PERBAIKAN] Hanya kembalikan kamera ke player lokal jika tidak sedang spectate
        if not IsViewingPlayer then
            workspace.CurrentCamera.CameraSubject = Humanoid
        end
        
        repeat
            if not (RootPart and RootPart.Parent and Character and Character.Parent) then break end
            RootPart.CFrame = getgenv().OldPos * CFrame.new(0, .5, 0)
            Character:SetPrimaryPartCFrame(getgenv().OldPos * CFrame.new(0, .5, 0))
            Humanoid:ChangeState("GettingUp")
            table.foreach(Character:GetChildren(), function(_, x)
                if x:IsA("BasePart") then
                    x.Velocity, x.RotVelocity = Vector3.new(), Vector3.new()
                end
            end)
            task.wait()
        until not RootPart or not RootPart.Parent or (RootPart.Position - getgenv().OldPos.p).Magnitude < 25
        workspace.FallenPartsDestroyHeight = getgenv().FPDH
    end

    ToggleFlingOnPlayer = nil

    function createOrUpdateFlingStatusBar(targetPlayer)
        if flingStatusGui and flingStatusGui.Parent then
            flingStatusGui:Destroy()
            flingStatusGui = nil
        end
    
        if not targetPlayer then
            return
        end
    
        flingStatusGui = Instance.new("ScreenGui")
        flingStatusGui.Name = "FlingStatusGUI"
        flingStatusGui.Parent = CoreGui
        flingStatusGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
        flingStatusGui.ResetOnSpawn = false
        flingStatusGui.DisplayOrder = 5 -- [PERBAIKAN] Atur agar di bawah menu utama
    
        local FlingBar = Instance.new("Frame")
        FlingBar.Name = "FlingBar"
        FlingBar.Size = UDim2.new(0, 250, 0, 35)
        FlingBar.Position = UDim2.new(0.5, -125, 0, 15)
        FlingBar.BackgroundColor3 = Color3.fromRGB(200, 50, 50)
        FlingBar.BackgroundTransparency = 0.2
        FlingBar.BorderSizePixel = 0
        FlingBar.Parent = flingStatusGui
    
        local UICorner = Instance.new("UICorner", FlingBar)
        UICorner.CornerRadius = UDim.new(0, 8)
        local UIStroke = Instance.new("UIStroke", FlingBar)
        UIStroke.Color = Color3.fromRGB(255, 100, 100)
        UIStroke.Thickness = 1
        UIStroke.Transparency = 0.5
    
        local DisableButton = Instance.new("TextButton")
        DisableButton.Name = "DisableButton"
        DisableButton.Size = UDim2.new(1, 0, 1, 0)
        DisableButton.BackgroundTransparency = 1
        DisableButton.Font = Enum.Font.SourceSansBold
        DisableButton.TextColor3 = Color3.fromRGB(255, 255, 255)
        DisableButton.TextSize = 14
        DisableButton.Text = "Hentikan Fling: " .. targetPlayer.DisplayName
        DisableButton.Parent = FlingBar
    
        DisableButton.MouseButton1Click:Connect(function()
            if currentFlingTarget then
                ToggleFlingOnPlayer(currentFlingTarget)
            end
        end)
    end
    
    ToggleFlingOnPlayer = function(targetPlayer)
        if not hasPermission("VIP") then
            showNotification("Silahkan upgrade ke VIP terlebih dahulu, Terimakasih", Color3.fromRGB(255,100,0))
            return
        end
        if flingLoopConnection then
            flingLoopConnection:Disconnect()
            flingLoopConnection = nil
        end
    
        if currentFlingTarget == targetPlayer then
            currentFlingTarget = nil
            showNotification("Fling dihentikan.", Color3.fromRGB(200, 150, 50))
            
            createOrUpdateFlingStatusBar(nil)
            
            local Character = LocalPlayer.Character
            if Character and flingStartPosition then
                local Humanoid = Character:FindFirstChildOfClass("Humanoid")
                local RootPart = Humanoid and Humanoid.RootPart
                
                if RootPart and Humanoid then
                    -- [PERBAIKAN] Hanya kembalikan kamera jika tidak sedang spectate
                    if not IsViewingPlayer then
                        workspace.CurrentCamera.CameraSubject = Humanoid
                    end
                    -- [PERBAIKAN] Matikan PlatformStand saat berhenti
                    Humanoid.PlatformStand = false
                    
                    repeat
                        if not RootPart or not RootPart.Parent then break end
                        RootPart.CFrame = flingStartPosition * CFrame.new(0, 0.5, 0)
                        Character:SetPrimaryPartCFrame(flingStartPosition * CFrame.new(0, 0.5, 0))
                        Humanoid:ChangeState("GettingUp")
                        for _, x in ipairs(Character:GetChildren()) do
                            if x:IsA("BasePart") then
                                x.Velocity, x.RotVelocity = Vector3.new(), Vector3.new()
                            end
                        end
                        task.wait()
                    until not RootPart or not RootPart.Parent or (RootPart.Position - flingStartPosition.p).Magnitude < 25
                end
                flingStartPosition = nil 
            end
        else
            local char = LocalPlayer.Character
            local root = char and char:FindFirstChild("HumanoidRootPart")
            if root then
                flingStartPosition = root.CFrame 
            else
                showNotification("Karakter Anda tidak dapat ditemukan untuk memulai fling.", Color3.fromRGB(255, 100, 0))
                return
            end
    
            currentFlingTarget = targetPlayer
            showNotification("Mengaktifkan fling pada " .. targetPlayer.Name, Color3.fromRGB(200, 50, 50))
            
            createOrUpdateFlingStatusBar(targetPlayer)

            flingLoopConnection = ConnectEvent(RunService.Heartbeat, function()
                if currentFlingTarget and currentFlingTarget.Parent == Players and currentFlingTarget.Character then
                    pcall(SkidFling, currentFlingTarget)
                else
                    ToggleFlingOnPlayer(currentFlingTarget)
                end
            end)
        end
        if updatePlayerList then updatePlayerList() end
    end
    function PlayAnim(id, time, speed)
        pcall(function()
            local char = LocalPlayer.Character
            if not (char and char:FindFirstChild("Animate") and char:FindFirstChildOfClass("Humanoid")) then return end
            
            local humanoid = char:FindFirstChildOfClass("Humanoid")
            
            -- Stop previous custom animations to prevent overlap
            for _, track in ipairs(humanoid:GetPlayingAnimationTracks()) do
                if track.Name == "CustomFlyAnim" then
                    track:Stop(0.1)
                end
            end

            -- Ensure default animations are off
            char.Animate.Disabled = true

            local anim = Instance.new("Animation")
            anim.Name = "CustomFlyAnim" -- Give it a name to identify it later
            anim.AnimationId = "rbxassetid://" .. tostring(id)
            
            local okFlyAnim, loadanim = pcall(function() return humanoid:LoadAnimation(anim) end)
            if not okFlyAnim or not loadanim then return end
            loadanim:Play(0.1)
            loadanim.Looped = true -- Fly animations should loop
            
            -- The time and speed parameters seem to be for setting a specific pose
            if time then loadanim.TimePosition = time end
            if speed ~= nil then loadanim:AdjustSpeed(speed) end
        end)
    end

    function StopAnim()
        local char = LocalPlayer.Character
        if not (char and char:FindFirstChild("Animate") and char:FindFirstChildOfClass("Humanoid")) then return end

        local humanoid = char:FindFirstChildOfClass("Humanoid")
        
        -- Stop all custom flying animations
        for _, track in ipairs(humanoid:GetPlayingAnimationTracks()) do
            -- A bit more robust check
            if track.Name == "CustomFlyAnim" or (track.Animation and track.Animation.Name == "CustomFlyAnim") then
                track:Stop(0.2)
            end
        end
        
        -- Re-enable default character animations
        pcall(function()
            char.Animate.Disabled = false
        end)
    end

    function StartFly()
        if IsFlying then return end
        local character = LocalPlayer.Character
        if not (character and character:FindFirstChild("HumanoidRootPart") and character:FindFirstChildOfClass("Humanoid")) then return end
        
        local root = character:WaitForChild("HumanoidRootPart")
        local humanoid = character:FindFirstChildOfClass("Humanoid")
        
        IsFlying = true
        saveFeatureStates()
        humanoid.PlatformStand = true
        
        local bodyGyro = Instance.new("BodyGyro", root)
        bodyGyro.Name = "FlyGyro"
        bodyGyro.P = 9e4
        bodyGyro.MaxTorque = Vector3.new(9e9, 9e9, 9e9)
        bodyGyro.CFrame = root.CFrame
        
        local bodyVelocity = Instance.new("BodyVelocity", root)
        bodyVelocity.Name = "FlyVelocity"
        bodyVelocity.MaxForce = Vector3.new(9e9, 9e9, 9e9)
        bodyVelocity.Velocity = Vector3.new(0, 0, 0)
        
        local controls = {F = 0, B = 0, L = 0, R = 0, Q = 0, E = 0}
        local currentAnim = "idle" -- Lacak status animasi saat ini
        
        -- Animasi idle awal
        PlayAnim(10714347256, 4, 0)

        table.insert(FlyConnections, UserInputService.InputBegan:Connect(function(input, processed)
            if processed or not IsFlying then return end
            if input.UserInputType == Enum.UserInputType.Keyboard then
                local key = input.KeyCode.Name:lower()
                if key == "w" then controls.F = 1
                elseif key == "s" then controls.B = -1
                elseif key == "a" then controls.L = -1
                elseif key == "d" then controls.R = 1
                elseif key == "e" then controls.Q = 1
                elseif key == "q" then controls.E = -1 end
            end
        end))
        
        table.insert(FlyConnections, UserInputService.InputEnded:Connect(function(input, processed)
            if processed or not IsFlying then return end
            if input.UserInputType == Enum.UserInputType.Keyboard then
                local key = input.KeyCode.Name:lower()
                if key == "w" then controls.F = 0
                elseif key == "s" then controls.B = 0
                elseif key == "a" then controls.L = 0
                elseif key == "d" then controls.R = 0
                elseif key == "e" then controls.Q = 0
                elseif key == "q" then controls.E = 0 end
            end
        end))
        
        table.insert(FlyConnections, RunService.RenderStepped:Connect(function()
            if not IsFlying then return end
            
            -- Logika Animasi
            local newAnim = "idle"
            if controls.F > 0 then
                newAnim = "forward"
            elseif controls.B < 0 then
                newAnim = "backward"
            elseif controls.L < 0 then
                newAnim = "left"
            elseif controls.R > 0 then
                newAnim = "right"
            end

            if newAnim ~= currentAnim then
                if newAnim == "idle" then
                    PlayAnim(10714347256, 4, 0) -- Idle
                elseif newAnim == "forward" then
                    PlayAnim(10714177846, 4.65, 0) -- Maju
                elseif newAnim == "backward" then
                    PlayAnim(10147823318, 4.11, 0) -- Mundur
                elseif newAnim == "left" then
                    PlayAnim(10147823318, 3.55, 0) -- Kiri
                elseif newAnim == "right" then
                    PlayAnim(10147823318, 4.81, 0) -- Kanan
                end
                currentAnim = newAnim
            end

            -- Logika Gerakan
            local speed = (controls.L + controls.R ~= 0 or controls.F + controls.B ~= 0 or controls.Q + controls.E ~= 0) and (Settings.FlySpeed * 50) or 0
            local camera = Workspace.CurrentCamera
            
            if speed ~= 0 then
                local moveVector = Vector3.new(controls.L + controls.R, controls.Q + controls.E, -(controls.F + controls.B))
                bodyVelocity.Velocity = (camera.CFrame:VectorToWorldSpace(moveVector.Unit)) * speed
            else
                bodyVelocity.Velocity = Vector3.new(0, 0.1, 0) -- Sedikit gaya ke atas untuk melawan gravitasi
            end
            
            bodyGyro.CFrame = camera.CFrame
        end))
    end

    function StopFly()
        if not IsFlying then return end
        IsFlying = false
        saveFeatureStates()
        
        StopAnim() -- Stop custom animations and re-enable default ones
        
        local character = LocalPlayer.Character
        if character and character:FindFirstChildOfClass("Humanoid") then
            character.Humanoid.PlatformStand = false
        end
        
        for _, conn in pairs(FlyConnections) do conn:Disconnect() end
        FlyConnections = {}
        
        local root = character and character:FindFirstChild("HumanoidRootPart")
        if root then
            if root:FindFirstChild("FlyGyro") then root.FlyGyro:Destroy() end
            if root:FindFirstChild("FlyVelocity") then root.FlyVelocity:Destroy() end
        end
        
        Workspace.CurrentCamera.CameraType = Enum.CameraType.Custom
    end

    function StopMobileFly()
        if not IsFlying then return end
        IsFlying = false
        saveFeatureStates()
        
        StopAnim() -- Stop custom animations

        local character = LocalPlayer.Character
        if character and character:FindFirstChildOfClass("Humanoid") then
            character.Humanoid.PlatformStand = false
        end
        
        for _, conn in pairs(FlyConnections) do conn:Disconnect() end
        FlyConnections = {}
        
        local root = character and character:FindFirstChild("HumanoidRootPart")
        if root then
            if root:FindFirstChild("FlyGyro") then root.FlyGyro:Destroy() end
            if root:FindFirstChild("FlyVelocity") then root.FlyVelocity:Destroy() end
        end
        
        Workspace.CurrentCamera.CameraType = Enum.CameraType.Custom
    end

    function StartMobileFly()
        if IsFlying then return end
        local character = LocalPlayer.Character
        if not (character and character:FindFirstChild("HumanoidRootPart") and character:FindFirstChildOfClass("Humanoid")) then return end

        local root = character:WaitForChild("HumanoidRootPart")
        local humanoid = character:FindFirstChildOfClass("Humanoid")

        local success, controlModule = pcall(require, LocalPlayer.PlayerScripts:WaitForChild("PlayerModule"):WaitForChild("ControlModule"))
        if not success then
            showNotification("Gagal memuat modul kontrol mobile.", Color3.fromRGB(255, 100, 100))
            return
        end

        IsFlying = true
        saveFeatureStates()
        humanoid.PlatformStand = true

        local bodyVelocity = Instance.new("BodyVelocity", root)
        bodyVelocity.Name = "FlyVelocity"
        bodyVelocity.MaxForce = Vector3.new(9e9, 9e9, 9e9)
        bodyVelocity.Velocity = Vector3.new(0, 0, 0)

        local bodyGyro = Instance.new("BodyGyro", root)
        bodyGyro.Name = "FlyGyro"
        bodyGyro.MaxTorque = Vector3.new(9e9, 9e9, 9e9)
        bodyGyro.P = 1000
        bodyGyro.D = 50

        local currentAnim = "idle"
        PlayAnim(10714347256, 4, 0) -- Animasi idle awal

        table.insert(FlyConnections, RunService.RenderStepped:Connect(function()
            if not IsFlying then return end

            local camera = Workspace.CurrentCamera
            if not (character and root and root:FindFirstChild("FlyVelocity") and root:FindFirstChild("FlyGyro")) then
                StopMobileFly()
                return
            end

            root.FlyVelocity.MaxForce = Vector3.new(9e9, 9e9, 9e9)
            root.FlyGyro.MaxTorque = Vector3.new(9e9, 9e9, 9e9)
            root.FlyGyro.CFrame = camera.CFrame

            local direction = controlModule:GetMoveVector()
            local speed = Settings.FlySpeed * 50

            -- Logika Animasi Mobile
            local newAnim = "idle"
            if direction.Magnitude > 0.1 then
                if direction.Z < -0.5 then
                    newAnim = "forward"
                elseif direction.Z > 0.5 then
                    newAnim = "backward"
                elseif direction.X < -0.5 then
                    newAnim = "left"
                elseif direction.X > 0.5 then
                    newAnim = "right"
                else
                    newAnim = "forward" -- Default ke depan jika bergerak diagonal
                end
            end

            if newAnim ~= currentAnim then
                if newAnim == "idle" then
                    PlayAnim(10714347256, 4, 0) -- Idle
                elseif newAnim == "forward" then
                    PlayAnim(10714177846, 4.65, 0) -- Maju
                elseif newAnim == "backward" then
                    PlayAnim(10147823318, 4.11, 0) -- Mundur
                elseif newAnim == "left" then
                    PlayAnim(10147823318, 3.55, 0) -- Kiri
                elseif newAnim == "right" then
                    PlayAnim(10147823318, 4.81, 0) -- Kanan
                end
                currentAnim = newAnim
            end

            -- Logika Gerakan Mobile
            if direction.Magnitude > 0.1 then
                root.FlyVelocity.Velocity = (camera.CFrame.RightVector * direction.X + camera.CFrame.LookVector * -direction.Z) * speed
            else
                root.FlyVelocity.Velocity = Vector3.new(0, 0.1, 0) -- Melawan gravitasi
            end
        end))
    end

    function ToggleNoclip(enabled)
        IsNoclipEnabled = enabled
        saveFeatureStates()
        if enabled then task.spawn(function() while IsNoclipEnabled and LocalPlayer.Character do for _, part in pairs(LocalPlayer.Character:GetDescendants()) do if part:IsA("BasePart") and part.CanCollide then part.CanCollide = false end end; task.wait(0.1) end; if LocalPlayer.Character then for _, part in pairs(LocalPlayer.Character:GetDescendants()) do if part:IsA("BasePart") then part.CanCollide = true end end end end) end
    end

    function applyGodMode(character)
        if not character then return end; local humanoid = character:FindFirstChildOfClass("Humanoid"); if not humanoid then return end; if godModeConnection then godModeConnection:Disconnect(); godModeConnection = nil end
        godModeConnection = humanoid.HealthChanged:Connect(function(newHealth) if newHealth <= 0 and IsGodModeEnabled then humanoid.Health = humanoid.MaxHealth end end)
    end

    function ToggleGodMode(enabled)
        IsGodModeEnabled = enabled; saveFeatureStates(); if enabled then if LocalPlayer.Character then applyGodMode(LocalPlayer.Character) end elseif godModeConnection then godModeConnection:Disconnect(); godModeConnection = nil end
    end

    function ToggleWalkSpeed(enabled)
        IsWalkSpeedEnabled = enabled; saveFeatureStates(); if LocalPlayer.Character and LocalPlayer.Character:FindFirstChildOfClass("Humanoid") then LocalPlayer.Character.Humanoid.WalkSpeed = enabled and Settings.WalkSpeed or OriginalWalkSpeed end
    end

    function CreateTouchFlingGUI()
        if not hasPermission("VIP") then
            showNotification("Silahkan upgrade ke VIP terlebih dahulu, Terimakasih", Color3.fromRGB(255,100,0))
            return
        end
        if touchFlingGui and touchFlingGui.Parent then return end; local FlingScreenGui = Instance.new("ScreenGui"); FlingScreenGui.Name = "ArexansTouchFlingGUI"; FlingScreenGui.Parent = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui"); FlingScreenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling; FlingScreenGui.ResetOnSpawn = false; touchFlingGui = FlingScreenGui
        local Frame = Instance.new("Frame", FlingScreenGui); Frame.BackgroundColor3 = Color3.fromRGB(170, 200, 255); Frame.BackgroundTransparency = 0.3; Frame.BorderSizePixel = 0; 
        Frame.Position = UDim2.new(0.5, -45, 0, 20); 
        if loadedGuiPositions and loadedGuiPositions.FlingFrame then
            local posData = loadedGuiPositions.FlingFrame
            pcall(function() Frame.Position = UDim2.new(posData.XScale, posData.XOffset, posData.YScale, posData.YOffset) end)
        end
        Frame.Size = UDim2.new(0, 90, 0, 56); local FrameUICorner = Instance.new("UICorner", Frame); FrameUICorner.CornerRadius = UDim.new(0, 6); local FrameUIStroke = Instance.new("UIStroke", Frame); FrameUIStroke.Color = Color3.fromRGB(0, 100, 255); FrameUIStroke.Thickness = 1.5; FrameUIStroke.Transparency = 0.2
        local TitleBar = Instance.new("TextButton", Frame); TitleBar.BackgroundColor3 = Color3.fromRGB(140, 170, 235); TitleBar.BackgroundTransparency = 0.4; TitleBar.BorderSizePixel = 0; TitleBar.Size = UDim2.new(1, 0, 0, 18); TitleBar.Text = ""; TitleBar.AutoButtonColor = false
        UI.MakeDraggable(Frame, TitleBar, function() return true end, nil)
        
        local TitleLabel = Instance.new("TextLabel", TitleBar); TitleLabel.BackgroundTransparency = 1.0; TitleLabel.Size = UDim2.new(1, -20, 1, 0); TitleLabel.Position = UDim2.new(0, 5, 0, 0); TitleLabel.Font = Enum.Font.SourceSansBold; TitleLabel.Text = "Touch Fling"; TitleLabel.TextColor3 = Color3.fromRGB(255, 255, 255); TitleLabel.TextSize = 11; TitleLabel.TextXAlignment = Enum.TextXAlignment.Left
        local OnOffButton = Instance.new("TextButton", Frame); OnOffButton.BackgroundColor3 = Color3.fromRGB(0, 120, 255); OnOffButton.BorderSizePixel = 0; OnOffButton.Position = UDim2.new(0.5, -30, 0, 25); OnOffButton.Size = UDim2.new(0, 60, 0, 22); OnOffButton.Font = Enum.Font.SourceSansBold; OnOffButton.Text = "OFF"; OnOffButton.TextColor3 = Color3.fromRGB(255, 255, 255); OnOffButton.TextSize = 14; local OnOffButtonCorner = Instance.new("UICorner", OnOffButton); OnOffButtonCorner.CornerRadius = UDim.new(0, 5); local OnOffButtonGradient = Instance.new("UIGradient", OnOffButton); OnOffButtonGradient.Color = ColorSequence.new(Color3.fromRGB(100, 180, 255), Color3.fromRGB(80, 150, 255)); OnOffButtonGradient.Rotation = 90
        local CloseButton = Instance.new("TextButton", TitleBar); CloseButton.Size = UDim2.new(0, 16, 0, 16); CloseButton.Position = UDim2.new(1, -18, 0.5, -8); CloseButton.BackgroundColor3 = Color3.fromRGB(200, 50, 50); CloseButton.Text = "X"; CloseButton.TextColor3 = Color3.fromRGB(255, 255, 255); CloseButton.Font = Enum.Font.SourceSansBold; CloseButton.TextSize = 11; local corner = Instance.new("UICorner", CloseButton); corner.CornerRadius = UDim.new(1, 0)
        local hiddenfling, flingThread = false, nil
        local function fling() while hiddenfling do local hrp = Players.LocalPlayer.Character and Players.LocalPlayer.Character:FindFirstChild("HumanoidRootPart"); if hrp then local vel = hrp.Velocity; hrp.Velocity = vel * 50000 + Vector3.new(0, 50000, 0); RunService.RenderStepped:Wait(); if hrp and hrp.Parent then hrp.Velocity = vel end; RunService.Stepped:Wait(); if hrp and hrp.Parent then hrp.Velocity = vel + Vector3.new(0, 0.1 * (math.random(0, 1) == 0 and -1 or 1), 0) end end; RunService.Heartbeat:Wait() end end
        OnOffButton.MouseButton1Click:Connect(function() hiddenfling = not hiddenfling; OnOffButton.Text = hiddenfling and "ON" or "OFF"; if hiddenfling then if not flingThread or coroutine.status(flingThread) == "dead" then flingThread = coroutine.create(fling); coroutine.resume(flingThread) end end end)
        CloseButton.MouseButton1Click:Connect(function() hiddenfling = false; FlingScreenGui:Destroy(); touchFlingGui = nil end)
    end
    
    
    function protect_character()
        local root = LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("HumanoidRootPart"); if root and antifling_enabled then if root.Velocity.Magnitude <= antifling_velocity_threshold then antifling_last_safe_cframe = root.CFrame end; if root.Velocity.Magnitude > antifling_velocity_threshold and antifling_last_safe_cframe then root.Velocity, root.AssemblyLinearVelocity, root.AssemblyAngularVelocity, root.CFrame = Vector3.new(), Vector3.new(), Vector3.new(), antifling_last_safe_cframe end; if root.AssemblyAngularVelocity.Magnitude > antifling_angular_threshold then root.AssemblyAngularVelocity = Vector3.new() end; if LocalPlayer.Character.Humanoid:GetState() == Enum.HumanoidStateType.FallingDown then LocalPlayer.Character.Humanoid:ChangeState(Enum.HumanoidStateType.GettingUp) end end
    end
    
    -- [[ FE INVISIBLE INTEGRATION ]]
    function setCharacterTransparency(character, transparency)
        if not character then return end

        -- Daftar nama body parts default Roblox yang boleh diubah transparansinya
        local bodyParts = {
            "Head", "Torso", "UpperTorso", "LowerTorso",
            "LeftUpperArm", "LeftLowerArm", "LeftHand",
            "RightUpperArm", "RightLowerArm", "RightHand",
            "LeftUpperLeg", "LeftLowerLeg", "LeftFoot",
            "RightUpperLeg", "RightLowerLeg", "RightFoot",
            "LeftArm", "RightArm", "LeftLeg", "RightLeg" -- R6 compatibility
        }

        -- Hanya ubah transparansi body parts, BUKAN accessories atau clothing
        for _, part in pairs(character:GetChildren()) do
            if part:IsA("BasePart") and part.Name ~= "HumanoidRootPart" then
                -- Cek apakah part ini adalah body part asli
                for _, bodyPartName in ipairs(bodyParts) do
                    if part.Name == bodyPartName then
                        part.Transparency = transparency
                        break
                    end
                end
            end
        end
    end

    function ToggleFEInvisible(enabled)
        IsFEInvisibleEnabled = enabled
        saveFeatureStates()

        local character = LocalPlayer.Character
        if not character or not character:FindFirstChild("HumanoidRootPart") then
            if enabled then
                IsFEInvisibleEnabled = false -- Turn it back off if there's no character
                saveFeatureStates()
            end
            return
        end

        feInvisSeat = Workspace:FindFirstChild("ArexansInvisSeat")

        if enabled then
            setCharacterTransparency(character, Settings.FEInvisibleTransparency)
            
            local savedpos = character:GetPrimaryPartCFrame()
            
            task.wait(0.05)
            character:SetPrimaryPartCFrame(CFrame.new(0, 10000, 0)) -- Teleport to a safe height
            task.wait(0.05)

            if not character.PrimaryPart or character.PrimaryPart.Position.Y < -500 then
                character:SetPrimaryPartCFrame(savedpos)
                ToggleFEInvisible(false) -- Revert if teleport failed
                return
            end

            local Seat = Instance.new('Seat', Workspace)
            Seat.Name = "ArexansInvisSeat"
            Seat.Anchored = true
            Seat.CanCollide = false
            Seat.Transparency = 1
            Seat.CFrame = character:GetPrimaryPartCFrame()

            local Weld = Instance.new("WeldConstraint")
            Weld.Part0 = Seat
            Weld.Part1 = character.PrimaryPart
            Weld.Parent = Seat
            
            task.wait()
            Seat.Anchored = false
            pcall(function() Seat.CFrame = savedpos end)
            feInvisSeat = Seat
        else
            setCharacterTransparency(character, 0)
            if feInvisSeat and feInvisSeat.Parent then
                feInvisSeat:Destroy()
            end
            feInvisSeat = nil
        end
    end
    -- [[ END FE INVISIBLE INTEGRATION ]]

    function UpdateShiftLock()
        if not IsShiftLockEnabled then return end
        local character = LocalPlayer.Character
        local humanoid = character and character:FindFirstChildOfClass("Humanoid")
        local rootPart = character and character:FindFirstChild("HumanoidRootPart")

        if not (humanoid and rootPart and humanoid.Health > 0) then return end
        
        humanoid.AutoRotate = false
        local cameraLookVector = Workspace.CurrentCamera.CFrame.LookVector
        local lookAtPosition = rootPart.Position + Vector3.new(cameraLookVector.X, 0, cameraLookVector.Z)
        rootPart.CFrame = CFrame.new(rootPart.Position, lookAtPosition)
    end

    function ToggleShiftLock(enabled)
        IsShiftLockEnabled = enabled
        saveFeatureStates()

        local character = LocalPlayer.Character
        local humanoid = character and character:FindFirstChildOfClass("Humanoid")

        if enabled then
            if humanoid then humanoid.AutoRotate = false end
            if not shiftLockConnection then
                shiftLockConnection = RunService.RenderStepped:Connect(UpdateShiftLock)
            end
        else
            if humanoid then humanoid.AutoRotate = true end
            if shiftLockConnection then
                shiftLockConnection:Disconnect()
                shiftLockConnection = nil
            end
        end
    end

    function ToggleAntiFling(enabled)
        antifling_enabled = enabled; saveFeatureStates(); if enabled and not antifling_connection then antifling_connection = RunService.Heartbeat:Connect(protect_character) elseif not enabled and antifling_connection then antifling_connection:Disconnect(); antifling_connection = nil end
    end

    function protect_teleport()
        if not IsAntiTeleportEnabled then return end
        local char = LocalPlayer.Character
        local root = char and char:FindFirstChild("HumanoidRootPart")
        if not root then return end

        local tool = char:FindFirstChildOfClass("Tool")
        if tool and tool.Name:lower():find("teleport") then
            antifling_last_safe_cframe = root.CFrame -- Update safe frame if holding valid tool
            return
        end

        if not antifling_last_safe_cframe then antifling_last_safe_cframe = root.CFrame return end

        if (root.Position - antifling_last_safe_cframe.Position).Magnitude > 50 then
            root.CFrame = antifling_last_safe_cframe
            root.Velocity = Vector3.zero
            root.RotVelocity = Vector3.zero
        else
            antifling_last_safe_cframe = root.CFrame
        end
    end

    function ToggleAntiTeleport(enabled)
        IsAntiTeleportEnabled = enabled
        saveFeatureStates()
        if enabled then
            local char = LocalPlayer.Character
            local root = char and char:FindFirstChild("HumanoidRootPart")
            if root then antifling_last_safe_cframe = root.CFrame end
            if not antiTeleportConnection then antiTeleportConnection = ConnectEvent(RunService.Heartbeat, protect_teleport) end
        else
            if antiTeleportConnection then antiTeleportConnection:Disconnect(); antiTeleportConnection = nil end
        end
    end

    function ToggleAntiAFK(enabled)
        IsAntiAFKEnabled = enabled
        saveFeatureStates()
        if enabled then
            if not antiAFKConnection then
                antiAFKConnection = ConnectEvent(LocalPlayer.Idled, function()
                    local VirtualUser = game:GetService("VirtualUser")
                    VirtualUser:CaptureController()
                    VirtualUser:ClickButton2(Vector2.new())
                end)
            end
        else
            if antiAFKConnection then
                antiAFKConnection:Disconnect()
                antiAFKConnection = nil
            end
        end
    end

    -- [[ AWAL INTEGRASI FUNGSI MAGNET.LUA ]]

    antiLagOriginals = {}
    antiLagHiddenObjects = {} -- Store dynamically hidden objects
    function ToggleAntiLag(enabled)
        IsAntiLagEnabled = enabled
        saveFeatureStates()
        if enabled then
            if not next(antiLagOriginals) then
                antiLagOriginals.GlobalShadows = Lighting.GlobalShadows
                antiLagOriginals.FogEnd = Lighting.FogEnd
                if settings then pcall(function() antiLagOriginals.QualityLevel = settings().Rendering.QualityLevel end) end
                antiLagOriginals.Effects = {}
                for i, v in ipairs(Workspace:GetDescendants()) do
                    arexansYieldEvery(i)
                    if v:IsA("ParticleEmitter") or v:IsA("Explosion") or v:IsA("Fire") or v:IsA("Smoke") or v:IsA("Sparkles") then
                        antiLagOriginals.Effects[v] = v.Enabled
                    end
                end
                for _, v in pairs(Lighting:GetChildren()) do
                    if v:IsA("BlurEffect") or v:IsA("SunRaysEffect") or v:IsA("ColorCorrectionEffect") or v:IsA("BloomEffect") or v:IsA("DepthOfFieldEffect") then
                        antiLagOriginals.Effects[v] = v.Enabled
                    end
                end
            end

            Lighting.GlobalShadows = false; Lighting.FogEnd = 9e9
            if settings then pcall(function() settings().Rendering.QualityLevel = 1 end) end
            for i, v in ipairs(Workspace:GetDescendants()) do
                arexansYieldEvery(i)
                if v:IsA("ParticleEmitter") or v:IsA("Explosion") or v:IsA("Fire") or v:IsA("Smoke") or v:IsA("Sparkles") then
                    v.Enabled = false
                end
            end
            for _, v in pairs(Lighting:GetChildren()) do if v:IsA("BlurEffect") or v:IsA("SunRaysEffect") or v:IsA("ColorCorrectionEffect") or v:IsA("BloomEffect") or v:IsA("DepthOfFieldEffect") then v.Enabled = false end end
            
            if not antiLagConnection then
                antiLagConnection = Workspace.DescendantAdded:Connect(function(descendant) 
                    if descendant:IsA("ParticleEmitter") or descendant:IsA("Explosion") or descendant:IsA("Fire") or descendant:IsA("Smoke") or descendant:IsA("Sparkles") then 
                        task.wait()
                        descendant.Enabled = false
                        table.insert(antiLagHiddenObjects, descendant)
                    end 
                end)
            end
        else
            if antiLagConnection then antiLagConnection:Disconnect(); antiLagConnection = nil end
            
            if antiLagOriginals.GlobalShadows ~= nil then Lighting.GlobalShadows = antiLagOriginals.GlobalShadows end
            if antiLagOriginals.FogEnd ~= nil then Lighting.FogEnd = antiLagOriginals.FogEnd end
            if antiLagOriginals.QualityLevel and settings then pcall(function() settings().Rendering.QualityLevel = antiLagOriginals.QualityLevel end) end
            
            if antiLagOriginals.Effects then
                for v, originalState in pairs(antiLagOriginals.Effects) do
                    if v and v.Parent then v.Enabled = originalState end
                end
            end
            
            -- Restore dynamically hidden objects
            for _, v in ipairs(antiLagHiddenObjects) do
                if v and v.Parent then v.Enabled = true end
            end
            antiLagHiddenObjects = {}
            
            antiLagOriginals = {} -- Clear after restore
        end
    end

    -- ====================================================================
    -- == BAGIAN FITUR BOOST FPS (INTEGRASI)                           ==
    -- ====================================================================

    boostFpsHidden = {} -- New table to track hidden objects instead of destroying them

    function storeBoostFpsOriginalSettings()
        if next(boostFpsOriginalSettings) then return end -- [[ PERBAIKAN BUG: Jangan simpan ulang jika sudah ada ]]
        boostFpsOriginalSettings = {}
        
        local terrain = workspace:FindFirstChildOfClass('Terrain')
        if terrain then
            boostFpsOriginalSettings.WaterWaveSize = terrain.WaterWaveSize
            boostFpsOriginalSettings.WaterWaveSpeed = terrain.WaterWaveSpeed
            boostFpsOriginalSettings.WaterReflectance = terrain.WaterReflectance
            boostFpsOriginalSettings.WaterTransparency = terrain.WaterTransparency
        end
        
        boostFpsOriginalSettings.GlobalShadows = Lighting.GlobalShadows
        boostFpsOriginalSettings.FogEnd = Lighting.FogEnd
        boostFpsOriginalSettings.FogStart = Lighting.FogStart
        
        if settings and settings() and settings().Rendering then
             boostFpsOriginalSettings.QualityLevel = settings().Rendering.QualityLevel
        end
        
        boostFpsOriginalSettings.PartProperties = {}
        for i, descendant in ipairs((Workspace or workspace):GetDescendants()) do
            arexansYieldEvery(i)
            if not isProtectedOptimizationInstance(descendant) then
                pcall(function()
                    if descendant:IsA("BasePart") then
                    boostFpsOriginalSettings.PartProperties[descendant] = {
                        Material = descendant.Material,
                        Reflectance = descendant.Reflectance
                    }
                elseif descendant:IsA("Decal") then
                    boostFpsOriginalSettings.PartProperties[descendant] = {
                        Transparency = descendant.Transparency
                    }
                elseif descendant:IsA("ParticleEmitter") or descendant:IsA("Trail") then
                     boostFpsOriginalSettings.PartProperties[descendant] = {
                        Lifetime = descendant.Lifetime
                    }
                    end
                end)
            end
        end
        
        boostFpsOriginalSettings.PostEffects = {}
        for i, effect in ipairs(Lighting:GetDescendants()) do
            arexansYieldEvery(i)
            if effect:IsA("PostEffect") then
                boostFpsOriginalSettings.PostEffects[effect] = effect.Enabled
            end
        end
    end

    function enableBoostFps()
        storeBoostFpsOriginalSettings() -- Ensure settings are stored before applying
        
        local terrain = workspace:FindFirstChildOfClass('Terrain')
        if terrain then
            terrain.WaterWaveSize = 0
            terrain.WaterWaveSpeed = 0
            terrain.WaterReflectance = 0
            terrain.WaterTransparency = 1
        end
        
        Lighting.GlobalShadows = false
        Lighting.FogEnd = 9e9
        Lighting.FogStart = 9e9
        
        if settings and settings() and settings().Rendering then
            settings().Rendering.QualityLevel = 1
        end
        
        for i, descendant in ipairs((Workspace or workspace):GetDescendants()) do
            arexansYieldEvery(i)
            if not isProtectedOptimizationInstance(descendant) then
                pcall(function()
                    if descendant:IsA("BasePart") then
                        descendant.Material = Enum.Material.Plastic
                        descendant.Reflectance = 0
                    elseif descendant:IsA("Decal") then
                        descendant.Transparency = 1
                    elseif descendant:IsA("ParticleEmitter") or descendant:IsA("Trail") then
                        descendant.Lifetime = NumberRange.new(0)
                    end
                end)
            end
        end

        for i, effect in ipairs(Lighting:GetDescendants()) do
            arexansYieldEvery(i)
            pcall(function()
                if effect:IsA("PostEffect") then
                    effect.Enabled = false
                end
            end)
        end

        if boostFpsDescendantConnection then boostFpsDescendantConnection:Disconnect() end
        boostFpsDescendantConnection = workspace.DescendantAdded:Connect(function(child)
            if isProtectedOptimizationInstance(child) then return end
            if child:IsA('ForceField') or child:IsA('Sparkles') or child:IsA('Smoke') or child:IsA('Fire') or child:IsA('Beam') then
                task.defer(function() 
                    if isProtectedOptimizationInstance(child) then return end
                    -- Non-destructive hide
                    if child:IsA("ParticleEmitter") or child:IsA("Beam") or child:IsA("Fire") or child:IsA("Smoke") or child:IsA("Sparkles") then
                        child.Enabled = false
                    elseif child:IsA("BasePart") then
                        child.Transparency = 1
                    end
                    table.insert(boostFpsHidden, child)
                end)
            end
        end)
    end

    function disableBoostFps()
        if not next(boostFpsOriginalSettings) then return end
        
        local terrain = workspace:FindFirstChildOfClass('Terrain')
        if terrain and boostFpsOriginalSettings.WaterWaveSize then
            terrain.WaterWaveSize = boostFpsOriginalSettings.WaterWaveSize
            terrain.WaterWaveSpeed = boostFpsOriginalSettings.WaterWaveSpeed
            terrain.WaterReflectance = boostFpsOriginalSettings.WaterReflectance
            terrain.WaterTransparency = boostFpsOriginalSettings.WaterTransparency
        end
        
        Lighting.GlobalShadows = boostFpsOriginalSettings.GlobalShadows
        Lighting.FogEnd = boostFpsOriginalSettings.FogEnd
        Lighting.FogStart = boostFpsOriginalSettings.FogStart
        
        if settings and settings() and settings().Rendering and boostFpsOriginalSettings.QualityLevel then
             settings().Rendering.QualityLevel = boostFpsOriginalSettings.QualityLevel
        end
        
        for effect, wasEnabled in pairs(boostFpsOriginalSettings.PostEffects) do
            if effect and effect.Parent then
                effect.Enabled = wasEnabled
            end
        end
        
        if boostFpsOriginalSettings.PartProperties then
            for instance, properties in pairs(boostFpsOriginalSettings.PartProperties) do
                if instance and instance.Parent then
                    pcall(function()
                        for propName, propValue in pairs(properties) do
                            instance[propName] = propValue
                        end
                    end)
                end
            end
        end
        
        if boostFpsDescendantConnection then
            boostFpsDescendantConnection:Disconnect()
            boostFpsDescendantConnection = nil
        end
        
        -- Restore dynamically hidden objects
        for _, child in ipairs(boostFpsHidden) do
            if child and child.Parent then
                if child:IsA("ParticleEmitter") or child:IsA("Beam") or child:IsA("Fire") or child:IsA("Smoke") or child:IsA("Sparkles") then
                    child.Enabled = true
                elseif child:IsA("BasePart") then
                    child.Transparency = 0 -- Assumption: dynamic parts like sparkles usually visible. 
                    -- Note: Ideally we should store original transparency if possible, but for new spawned effects, usually 0 is safe or they manage themselves.
                end
            end
        end
        boostFpsHidden = {}
        boostFpsOriginalSettings = {}
    end

    function ToggleBoostFPS(enabled)
        IsBoostFPSEnabled = enabled
        saveFeatureStates()
        if enabled then
            enableBoostFps()
        else
            disableBoostFps()
        end
    end
    
    -- ====================================================================
    -- == BAGIAN FITUR VIEW PLAYER (PERBAIKAN)                         ==
    -- ====================================================================
    
    function createSpectatorGUI()
        if SpectatorGui and SpectatorGui.Parent then return end
    
        SpectatorGui = Instance.new("ScreenGui")
        SpectatorGui.Name = "ArexansSpectatorGUI"
        SpectatorGui.Parent = CoreGui
        SpectatorGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
        SpectatorGui.ResetOnSpawn = false
        SpectatorGui.Enabled = false
        SpectatorGui.DisplayOrder = 5 -- [PERBAIKAN] Atur agar di bawah menu utama
    
		-- [PERBAIKAN] Frame untuk tombol aksi (hanya Teleport)
		local ActionButtonsBar = Instance.new("Frame")
		ActionButtonsBar.Name = "ActionButtonsBar"
		ActionButtonsBar.Size = UDim2.new(0, 170, 0, 30)
		ActionButtonsBar.Position = UDim2.new(0.5, -85, 1, -95)
		ActionButtonsBar.BackgroundTransparency = 1
		ActionButtonsBar.Parent = SpectatorGui
	
		local ActionButtonsLayout = Instance.new("UIListLayout")
		ActionButtonsLayout.FillDirection = Enum.FillDirection.Horizontal
		ActionButtonsLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
		ActionButtonsLayout.VerticalAlignment = Enum.VerticalAlignment.Center
		ActionButtonsLayout.SortOrder = Enum.SortOrder.LayoutOrder
		ActionButtonsLayout.Padding = UDim.new(0, 10)
		ActionButtonsLayout.Parent = ActionButtonsBar

		-- Tombol Teleport
		local TeleportButton = Instance.new("TextButton")
		TeleportButton.Name = "TeleportButton"
		TeleportButton.Size = UDim2.new(0, 80, 1, 0)
		TeleportButton.BackgroundColor3 = getResolvedThemeColor(Color3.fromRGB(0, 120, 255))
		registerThemeElement(TeleportButton, "BackgroundColor3", TeleportButton.BackgroundColor3)
		TeleportButton.Font = Enum.Font.SourceSansBold
		TeleportButton.Text = "Teleport"
		TeleportButton.TextColor3 = Color3.fromRGB(255, 255, 255)
		TeleportButton.TextSize = 14
		TeleportButton.Parent = ActionButtonsBar
		local TPCorner = Instance.new("UICorner", TeleportButton); TPCorner.CornerRadius = UDim.new(0, 6)
	
		TeleportButton.MouseButton1Click:Connect(function()
			if not IsViewingPlayer or not currentlyViewedPlayer then return end

			local localChar = LocalPlayer.Character
			local targetPlayerToTeleportTo = currentlyViewedPlayer -- Save the player reference

			if not (targetPlayerToTeleportTo.Character and targetPlayerToTeleportTo.Character:FindFirstChild("HumanoidRootPart") and localChar and localChar:FindFirstChild("HumanoidRootPart")) then
				showNotification("Target atau karakter Anda tidak valid.", Color3.fromRGB(200, 50, 50))
				return
			end
			
			-- Stop spectating MANUALLY without returning to original position
			if viewingPlayerConnection then
				viewingPlayerConnection:Disconnect()
				viewingPlayerConnection = nil
			end
			IsViewingPlayer = false
			
			pcall(function()
				if originalCameraSubject and originalCameraSubject.Parent then
					Workspace.CurrentCamera.CameraSubject = originalCameraSubject
				elseif localChar and localChar:FindFirstChildOfClass("Humanoid") then
					Workspace.CurrentCamera.CameraSubject = localChar.Humanoid
				end
			end)
			originalCameraSubject = nil
			originalPlayerCFrame = nil -- Prevent returning to start
			if SpectatorGui then SpectatorGui.Enabled = false end
			
			-- Now, teleport the player to the saved target's position
			task.wait(0.1) -- Brief wait to ensure camera is fully restored
			if targetPlayerToTeleportTo.Character and targetPlayerToTeleportTo.Character:FindFirstChild("HumanoidRootPart") then
				local teleportCFrame = targetPlayerToTeleportTo.Character.HumanoidRootPart.CFrame * CFrame.new(0, 3, 0)
				localChar:SetPrimaryPartCFrame(teleportCFrame)
				showNotification("Teleportasi ke " .. targetPlayerToTeleportTo.DisplayName, Color3.fromRGB(50, 150, 255))
			else
				showNotification("Target hilang, gagal teleport.", Color3.fromRGB(200, 50, 50))
			end
		end)

		-- Tombol Rekam/Stop
        local RecordButton = Instance.new("TextButton")
        RecordButton.Name = "RecordButton"
        RecordButton.Size = UDim2.new(0, 80, 1, 0)
        RecordButton.BackgroundColor3 = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
        RecordButton:SetAttribute("ArexansRecordIdleTheme", true)
        registerThemeElement(RecordButton, "BackgroundColor3", RecordButton.BackgroundColor3)
        RecordButton.Font = Enum.Font.SourceSansBold
        RecordButton.Text = "Rekam"
        RecordButton.TextColor3 = Color3.fromRGB(255, 255, 255)
        RecordButton.TextSize = 14
        RecordButton.Parent = ActionButtonsBar
        local RecCorner = Instance.new("UICorner", RecordButton); RecCorner.CornerRadius = UDim.new(0, 6)

        RecordButton.MouseButton1Click:Connect(function()
            if not IsViewingPlayer or not currentlyViewedPlayer then return end

            if isRecording and currentRecordingTarget == currentlyViewedPlayer then
                stopRecording(false)
            elseif isRecording and currentRecordingTarget ~= currentlyViewedPlayer then
                showNotification("Harus menghentikan rekaman saat ini terlebih dahulu.", Color3.fromRGB(200, 150, 50))
            else
                switchTab("Rekaman")
                startRecording(currentlyViewedPlayer, false)
            end
        end)

        local MainBar = Instance.new("Frame")
        MainBar.Name = "MainBar"
        MainBar.Size = UDim2.new(0, 300, 0, 40)
        MainBar.Position = UDim2.new(0.5, -150, 1, -50)
        MainBar.BackgroundColor3 = Color3.fromRGB(20, 20, 20)
        MainBar.BackgroundTransparency = 0.3
        MainBar.BorderSizePixel = 0
        MainBar.Parent = SpectatorGui
    
        local UICorner = Instance.new("UICorner", MainBar)
        UICorner.CornerRadius = UDim.new(0, 8)
        local UIStroke = Instance.new("UIStroke", MainBar)
        UIStroke.Name = "SpectatorBarStroke"
        UIStroke.Color = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
        UIStroke.Thickness = 1
        registerThemeElement(UIStroke, "Color", UIStroke.Color)
        UIStroke.Transparency = 0.5
    
        local NicknameLabel = Instance.new("TextButton")
        NicknameLabel.Name = "NicknameLabel"
        NicknameLabel.Size = UDim2.new(1, -80, 1, 0)
        NicknameLabel.Position = UDim2.new(0.5, 0, 0.5, 0)
        NicknameLabel.AnchorPoint = Vector2.new(0.5, 0.5)
        NicknameLabel.BackgroundTransparency = 1
        NicknameLabel.Font = Enum.Font.SourceSansBold
        NicknameLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
        NicknameLabel.TextSize = 16
        NicknameLabel.Text = "Mengamati: Player"
        NicknameLabel.AutoButtonColor = false
        NicknameLabel.Parent = MainBar
        NicknameLabel.MouseButton1Click:Connect(function()
            stopSpectate()
        end)
    
        local LeftButton = Instance.new("TextButton")
        LeftButton.Name = "LeftButton"
        LeftButton.Size = UDim2.new(0, 30, 0, 30)
        LeftButton.Position = UDim2.new(0, 5, 0.5, -15)
        LeftButton.BackgroundColor3 = Color3.fromRGB(50, 50, 50)
        LeftButton.Font = Enum.Font.SourceSansBold
        LeftButton.Text = "<"
        LeftButton.TextColor3 = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
        registerThemeElement(LeftButton, "TextColor3", LeftButton.TextColor3)
        LeftButton.TextSize = 20
        LeftButton.Parent = MainBar
        local LBCorner = Instance.new("UICorner", LeftButton); LBCorner.CornerRadius = UDim.new(0, 6)
    
        local RightButton = Instance.new("TextButton")
        RightButton.Name = "RightButton"
        RightButton.Size = UDim2.new(0, 30, 0, 30)
        RightButton.Position = UDim2.new(1, -35, 0.5, -15)
        RightButton.BackgroundColor3 = Color3.fromRGB(50, 50, 50)
        RightButton.Font = Enum.Font.SourceSansBold
        RightButton.Text = ">"
        RightButton.TextColor3 = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
        registerThemeElement(RightButton, "TextColor3", RightButton.TextColor3)
        RightButton.TextSize = 20
        RightButton.Parent = MainBar
        local RBCorner = Instance.new("UICorner", RightButton); RBCorner.CornerRadius = UDim.new(0, 6)
    
        LeftButton.MouseButton1Click:Connect(function() cycleSpectate(-1) end)
        RightButton.MouseButton1Click:Connect(function() cycleSpectate(1) end)
    end
    
    function updateSpectatorGUI()
        if not SpectatorGui or not SpectatorGui.Enabled or not IsViewingPlayer or not currentlyViewedPlayer then return end
    
        local recordButton = SpectatorGui:FindFirstChild("RecordButton", true)
        if not recordButton then return end
    
        if isRecording and currentRecordingTarget == currentlyViewedPlayer then
            recordButton.Text = "Stop"
            recordButton.BackgroundColor3 = Color3.fromRGB(80, 80, 80)
        else
            recordButton.Text = "Rekam"
            recordButton.BackgroundColor3 = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
            if isGradientRole() then pcall(function() applyDeveloperGradient(recordButton) end) end
        end
    end
    
    stopSpectate = function()
        if not IsViewingPlayer then return end
        
        IsViewingPlayer = false
        if viewingPlayerConnection then
            viewingPlayerConnection:Disconnect()
            viewingPlayerConnection = nil
        end
        
        local localChar = LocalPlayer.Character
        
        pcall(function()
            if originalCameraSubject and originalCameraSubject.Parent then
                Workspace.CurrentCamera.CameraSubject = originalCameraSubject
            elseif localChar and localChar:FindFirstChildOfClass("Humanoid") then
                Workspace.CurrentCamera.CameraSubject = localChar.Humanoid
            end
        end)
        originalCameraSubject = nil
        
        if localChar and originalPlayerCFrame then
            localChar:SetPrimaryPartCFrame(originalPlayerCFrame)
            
            -- [PERBAIKAN] Reset velocity to prevent flinging after spectate
            for _, part in ipairs(localChar:GetDescendants()) do
                if part:IsA("BasePart") then
                    part.Velocity = Vector3.new()
                    part.RotVelocity = Vector3.new()
                end
            end
        end
        originalPlayerCFrame = nil
    
        if SpectatorGui then SpectatorGui.Enabled = false end
        
        currentlyViewedPlayer = nil
        if updatePlayerList then updatePlayerList() end 
    end
    
    startSpectate = function(targetPlayer)
        if IsViewingPlayer and currentlyViewedPlayer == targetPlayer then
            stopSpectate()
            return
        end
    
        if IsViewingPlayer then
            stopSpectate()
            task.wait(0.1) 
        end
    
        local localChar = LocalPlayer.Character
        local targetChar = targetPlayer.Character
    
        if not (localChar and localChar:FindFirstChild("HumanoidRootPart") and targetChar and targetChar:FindFirstChild("HumanoidRootPart")) then
            showNotification((targetPlayer and targetPlayer.Name or "Pemain") .. " tidak bisa diamati.", Color3.fromRGB(200, 150, 50))
            return
        end
    
        IsViewingPlayer = true
        currentlyViewedPlayer = targetPlayer
    
        originalPlayerCFrame = localChar.PrimaryPart.CFrame
        originalCameraSubject = Workspace.CurrentCamera.CameraSubject
        -- localPlayerIsHidden, Parent, and Animate script changes removed to keep player visible and animated.
    
        pcall(function() Workspace.CurrentCamera.CameraSubject = targetChar.Humanoid end)
    
        viewingPlayerConnection = targetPlayer.CharacterAdded:Connect(function(character)
            task.wait(0.1)
            if IsViewingPlayer and currentlyViewedPlayer == targetPlayer and character:FindFirstChildOfClass("Humanoid") then
                pcall(function() Workspace.CurrentCamera.CameraSubject = character.Humanoid end)
            end
        end)
    
        if not SpectatorGui or not SpectatorGui.Parent then createSpectatorGUI() end
        SpectatorGui.Enabled = true
        local NicknameLabel = SpectatorGui:FindFirstChild("MainBar", true):FindFirstChild("NicknameLabel", true)
        if NicknameLabel then
            NicknameLabel.Text = "Mengamati: " .. targetPlayer.DisplayName
        end
        
        if updatePlayerList then updatePlayerList() end
    end

    cycleSpectate = function(direction) 
        if not IsViewingPlayer then return end

        local playerList = {}
        for _, p in ipairs(Players:GetPlayers()) do
            if p ~= LocalPlayer then
                table.insert(playerList, p)
            end
        end

        table.sort(playerList, function(a, b) return a.Name < b.Name end)

        if #playerList == 0 then
            stopSpectate()
            showNotification("Tidak ada pemain lain untuk diamati.", Color3.fromRGB(200, 150, 50))
            return
        end

        local currentIndex = 0
        if currentlyViewedPlayer then
            for i, p in ipairs(playerList) do
                if p == currentlyViewedPlayer then
                    currentIndex = i
                    break
                end
            end
        end
        
        if currentIndex == 0 and #playerList > 0 then
            currentIndex = direction > 0 and 0 or #playerList + 1
        end

        for _ = 1, #playerList do
            local newIndex = currentIndex + direction
            if newIndex > #playerList then
                newIndex = 1
            elseif newIndex < 1 then
                newIndex = #playerList
            end

            local nextPlayer = playerList[newIndex]
            if nextPlayer and nextPlayer.Character and nextPlayer.Character:FindFirstChildOfClass("Humanoid") then
                startSpectate(nextPlayer)
                return 
            else
                currentIndex = newIndex
            end
        end

        stopSpectate()
        showNotification("Tidak ada pemain yang bisa diamati saat ini.", Color3.fromRGB(200, 150, 50))
    end
    
    -- ====================================================================
    -- == AKHIR BAGIAN VIEW PLAYER                                     ==
    -- ====================================================================

    -- [[ PERUBAHAN BESAR DIMULAI: Fungsi Spectate Lokasi dirombak total untuk kontrol mobile ]]
    stopLocationSpectate = nil -- Deklarasi awal
    
    function createSpectateLocationGUI()
        if spectateLocationGui and spectateLocationGui.Parent then return end
    
        spectateLocationGui = Instance.new("ScreenGui")
        spectateLocationGui.Name = "ArexansLocationSpectatorGUI"
        spectateLocationGui.Parent = CoreGui
        spectateLocationGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
        spectateLocationGui.ResetOnSpawn = false
        spectateLocationGui.DisplayOrder = 6
    
        -- Tombol Stop
        local stopButton = Instance.new("TextButton")
        stopButton.Name = "StopSpectateButton"
        stopButton.Size = UDim2.new(0, 150, 0, 35)
        stopButton.Position = UDim2.new(0.5, -75, 1, -50)
        stopButton.BackgroundColor3 = Color3.fromRGB(200, 50, 50)
        stopButton.BackgroundTransparency = 0.2
        stopButton.Font = Enum.Font.SourceSansBold
        stopButton.Text = "Hentikan Pengamatan"
        stopButton.TextColor3 = Color3.fromRGB(255, 255, 255)
        stopButton.TextSize = 14
        stopButton.ZIndex = 2
        stopButton.Parent = spectateLocationGui
        
        local corner = Instance.new("UICorner", stopButton); corner.CornerRadius = UDim.new(0, 8)
        local stroke = Instance.new("UIStroke", stopButton); stroke.Color = Color3.fromRGB(255, 100, 100); stroke.Thickness = 1
        stopButton.MouseButton1Click:Connect(stopLocationSpectate)
    
        -- GUI Joystick untuk gerakan
        local JoystickFrame = Instance.new("Frame")
        JoystickFrame.Name = "JoystickFrame"
        JoystickFrame.Size = UDim2.new(0, 120, 0, 120)
        JoystickFrame.Position = UDim2.new(0, 30, 1, -150)
        JoystickFrame.BackgroundTransparency = 1
        JoystickFrame.Parent = spectateLocationGui

        local JoystickBase = Instance.new("ImageLabel")
        JoystickBase.Name = "Base"
        JoystickBase.Size = UDim2.new(1, 0, 1, 0)
        JoystickBase.BackgroundTransparency = 1
        JoystickBase.Image = "rbxassetid://392630590" -- Gambar lingkaran default
        JoystickBase.ImageColor3 = Color3.fromRGB(0, 0, 0)
        JoystickBase.ImageTransparency = 0.5
        JoystickBase.ScaleType = Enum.ScaleType.Slice
        JoystickBase.SliceCenter = Rect.new(100, 100, 100, 100)
        JoystickBase.Parent = JoystickFrame
        
        local JoystickThumb = Instance.new("ImageLabel")
        JoystickThumb.Name = "Thumb"
        JoystickThumb.Size = UDim2.new(0.5, 0, 0.5, 0)
        JoystickThumb.Position = UDim2.new(0.25, 0, 0.25, 0)
        JoystickThumb.AnchorPoint = Vector2.new(0, 0)
        JoystickThumb.BackgroundTransparency = 1
        JoystickThumb.Image = "rbxassetid://392630590"
        JoystickThumb.ImageColor3 = Color3.fromRGB(150, 150, 150)
        JoystickThumb.ImageTransparency = 0.3
        JoystickThumb.ScaleType = Enum.ScaleType.Slice
        JoystickThumb.SliceCenter = Rect.new(100, 100, 100, 100)
        JoystickThumb.ZIndex = 2
        JoystickThumb.Parent = JoystickBase

        return JoystickFrame
    end
    
    stopLocationSpectate = function()
        if not isSpectatingLocation then return end
        isSpectatingLocation = false
        
        -- Hentikan semua koneksi input
        for _, conn in pairs(spectateCameraConnections) do conn:Disconnect() end
        spectateCameraConnections = {}
        
        -- Kembalikan properti kamera ke kondisi semula
        local camera = Workspace.CurrentCamera
        pcall(function()
            camera.CameraType = originalCameraProperties.Type
            camera.CameraSubject = originalCameraProperties.Subject
            camera.CFrame = originalCameraProperties.CFrame
            camera.FieldOfView = originalCameraProperties.FieldOfView
        end)
        
        -- Kembalikan properti visual karakter
        local localChar = LocalPlayer.Character
        if localChar and next(originalCharacterAppearance) then
            local hrp = localChar:FindFirstChild("HumanoidRootPart")
            if hrp then
                local hrpProps = originalCharacterAppearance["HRP"]
                if hrpProps then
                    hrp.Anchored = hrpProps.Anchored
                end
            end
            for part, props in pairs(originalCharacterAppearance) do
                if typeof(part) == "Instance" and part.Parent then
                    pcall(function()
                        part.Transparency = props.Transparency
                        part.CanCollide = props.CanCollide
                    end)
                end
            end
        end
        originalCharacterAppearance = {}

        -- Kembalikan karakter ke posisi semula
        if localChar and originalPlayerCFrame then
             local hrp = localChar:FindFirstChild("HumanoidRootPart")
             if hrp and hrp.Anchored then hrp.Anchored = false end
             localChar:SetPrimaryPartCFrame(originalPlayerCFrame)
        end
        originalPlayerCFrame = nil
    
        if spectateLocationGui then spectateLocationGui:Destroy(); spectateLocationGui = nil end
    end
    
    startLocationSpectate = function(targetCFrame)
        if isSpectatingLocation then stopLocationSpectate() end
        
        local localChar = LocalPlayer.Character
        if not localChar or not localChar:FindFirstChild("HumanoidRootPart") then
            showNotification("Karakter Anda tidak ditemukan.", Color3.fromRGB(200, 50, 50))
            return
        end
        
        isSpectatingLocation = true
        
        -- Simpan properti kamera saat ini
        local camera = Workspace.CurrentCamera
        originalCameraProperties = {
            Type = camera.CameraType,
            Subject = camera.CameraSubject,
            CFrame = camera.CFrame,
            FieldOfView = camera.FieldOfView
        }

        -- Simpan CFrame asli dan properti visual
        originalPlayerCFrame = localChar.PrimaryPart.CFrame
        originalCharacterAppearance = {}
        for _, part in ipairs(localChar:GetDescendants()) do
            if part:IsA("BasePart") then
                originalCharacterAppearance[part] = {
                    Transparency = part.Transparency,
                    CanCollide = part.CanCollide
                }
                part.Transparency = 1
                part.CanCollide = false
            end
        end
        
        -- Pindahkan karakter dan anchor
        local hrp = localChar:FindFirstChild("HumanoidRootPart")
        if hrp then
            originalCharacterAppearance["HRP"] = { Anchored = hrp.Anchored }
            hrp.Anchored = true
            hrp.CFrame = targetCFrame
        else
             localChar:SetPrimaryPartCFrame(targetCFrame)
        end
        
        -- Atur kamera ke mode scriptable dan posisikan
        camera.CameraType = Enum.CameraType.Scriptable
        camera.CFrame = targetCFrame * CFrame.new(0, 10, 20)
        camera.FieldOfView = 80
        
        local JoystickFrame = createSpectateLocationGUI()
        local JoystickBase = JoystickFrame.Base
        local JoystickThumb = JoystickBase.Thumb
        
        -- Setup variabel untuk kontrol kamera
        local cameraRotationSensitivity = Settings.SpectateCameraSensitivity
        local cameraMoveSpeed = Settings.SpectateCameraSpeed
        local moveVector = Vector2.new(0, 0)
        local isJoystickActive = false
        local rotationInput = nil
    
        -- Koneksi untuk Rotasi (Geser di mana saja selain joystick)
        -- [[ PERUBAHAN: Rotasi Kamera via Layar Dinonaktifkan ]]
        -- Kode di bawah ini dinonaktifkan sesuai permintaan untuk menghilangkan
        -- pergerakan kamera saat layar disentuh/digeser, namun tetap mempertahankan
        -- fungsi pergerakan dari analog/joystick.
                
        -- Inisialisasi kamera fly
        isSpectatingLocation = true
        camera = Workspace.CurrentCamera
        camera.CameraType = Enum.CameraType.Scriptable

        local camPos = targetCFrame.Position
        local camYaw, camPitch = 0, 0

        -- rotasi kamera dengan swipe
        local rotationInput = nil
        local swipeBeganConn = UserInputService.InputBegan:Connect(function(input,gpe)
            if gpe or not isSpectatingLocation then return end
            if input.UserInputType==Enum.UserInputType.Touch then
                local joyPos, joySize = JoystickFrame.AbsolutePosition, JoystickFrame.AbsoluteSize
                local isTouchingJoystick = (input.Position.X >= joyPos.X and input.Position.X <= joyPos.X + joySize.X and
                                            input.Position.Y >= joyPos.Y and input.Position.Y <= joyPos.Y + joySize.Y)
                if not isTouchingJoystick then
                    rotationInput=input
                end
            end
        end)
        local swipeChangedConn = UserInputService.InputChanged:Connect(function(input,gpe)
            if gpe or not isSpectatingLocation or not rotationInput or input~=rotationInput then return end
            local delta = input.Delta
            camYaw = camYaw - delta.X * cameraRotationSensitivity
            camPitch = math.clamp(camPitch - delta.Y * cameraRotationSensitivity,-1.4,1.4)
        end)
        local swipeEndedConn = UserInputService.InputEnded:Connect(function(input,gpe)
            if input==rotationInput then rotationInput=nil end
        end)

        -- Koneksi untuk Joystick
        local joystickInput = nil
        JoystickBase.InputBegan:Connect(function(input)
            if input.UserInputType == Enum.UserInputType.Touch or input.UserInputType == Enum.UserInputType.MouseButton1 then
                isJoystickActive = true
                joystickInput = input
            end
        end)

        local joystickChangedConn = UserInputService.InputChanged:Connect(function(input)
            if isJoystickActive and joystickInput and input == joystickInput then
                local center = JoystickBase.AbsolutePosition + (JoystickBase.AbsoluteSize / 2)
                local pos = UserInputService:GetMouseLocation()
                
                local dir = (pos - center)
                local distance = math.min(dir.Magnitude, JoystickBase.AbsoluteSize.X / 2.5)
                
                if dir.Magnitude > 0 then
                    moveVector = dir.Unit * (distance / (JoystickBase.AbsoluteSize.X / 2.5))
                else
                    moveVector = Vector2.new(0,0)
                end

                JoystickThumb.Position = UDim2.fromOffset(
                    (JoystickBase.AbsoluteSize.X / 2 - JoystickThumb.AbsoluteSize.X / 2) + moveVector.X * (JoystickBase.AbsoluteSize.X / 2.5),
                    (JoystickBase.AbsoluteSize.Y / 2 - JoystickThumb.AbsoluteSize.Y / 2) + moveVector.Y * (JoystickBase.AbsoluteSize.Y / 2.5)
                )
            end
        end)
        
        local joystickEndedConn = UserInputService.InputEnded:Connect(function(input)
            if joystickInput and input == joystickInput then
                isJoystickActive = false
                joystickInput = nil
                moveVector = Vector2.new(0, 0)
                TweenService:Create(JoystickThumb, TweenInfo.new(0.1), {Position = UDim2.new(0.25, 0, 0.25, 0)}):Play()
            end
        end)

        -- Kontroler Kamera Terpadu (Gaya Terbang)
        local unifiedConn = ConnectEvent(RunService.RenderStepped, function(dt)
            if not isSpectatingLocation then
                unifiedConn:Disconnect()
                return
            end

            -- Dapatkan vektor arah 3D penuh dari kamera
            local lookVector = camera.CFrame.LookVector
            local rightVector = camera.CFrame.RightVector

            -- Hitung pergerakan berdasarkan input joystick dan arah kamera
            -- Sumbu Y joystick (-moveVector.Y) mengontrol maju/mundur di sepanjang lookVector
            -- Sumbu X joystick (moveVector.X) mengontrol gerakan ke samping di sepanjang rightVector
            local moveDirection = (lookVector * -moveVector.Y) + (rightVector * moveVector.X)

            -- Perbarui posisi kamera
            camPos = camPos + moveDirection * cameraMoveSpeed * dt

            -- Perbarui rotasi kamera dari input geser (swipe)
            local rotCFrame = CFrame.Angles(0, camYaw, 0) * CFrame.Angles(camPitch, 0, 0)
            camera.CFrame = CFrame.new(camPos) * rotCFrame
            
            -- Pindahkan karakter yang tidak terlihat ke posisi kamera untuk merender map
            local localChar = LocalPlayer.Character
            local hrp = localChar and localChar:FindFirstChild("HumanoidRootPart")
            if hrp and hrp.Anchored and isSpectatingLocation then
                hrp.CFrame = camera.CFrame
            end
        end)

        spectateCameraConnections = {swipeBeganConn, swipeChangedConn, swipeEndedConn, joystickChangedConn, joystickEndedConn, unifiedConn}
    end
    -- [[ PERUBAHAN BESAR SELESAI ]]
    
    function Rejoin()
        saveFeatureStates()
        saveGuiPositions()
        
        if queue_on_teleport and type(queue_on_teleport) == "function" then
            local loaderCode = "loadstring(game:HttpGet('" .. SCRIPT_URL .. "'))()"
            queue_on_teleport(loaderCode)
            showNotification("Re-eksekusi terjadwal, bergabung kembali...", Color3.fromRGB(50, 150, 255))
        else
            showNotification("Executor tidak mendukung 'queue_on_teleport'. Gunakan auto-exec.", Color3.fromRGB(255, 150, 0))
        end

        task.wait(0.1)
        
        pcall(function()
            TeleportService:Teleport(game.PlaceId, LocalPlayer)
        end)
    end

    function HopServer()
        if SCRIPT_URL == "https://pastefy.app/kjMXVpao/raw" then
            showNotification("URL Skrip belum diatur! Lihat bagian atas skrip.", Color3.fromRGB(255, 100, 0))
            return
        end

        local servers = {}
        local success, response = pcall(function()
            return HttpService:JSONDecode(game:HttpGet("https://games.roblox.com/v1/games/" .. tostring(game.PlaceId) .. "/servers/Public?sortOrder=Asc&limit=100"))
        end)

        if not success or not response or not response.data then
            showNotification("Gagal mengambil daftar server.", Color3.fromRGB(200, 50, 50))
            warn("Server Hop Error:", response)
            return
        end
        
        for _, server in ipairs(response.data) do
            if type(server) == 'table' and server.id ~= game.JobId and server.playing < server.maxPlayers then
                table.insert(servers, server.id)
            end
        end

        if #servers > 0 then
            local randomServer = servers[math.random(1, #servers)]
            
            saveFeatureStates()
            saveGuiPositions()
            
            if queue_on_teleport and type(queue_on_teleport) == "function" then
                local loaderCode = "loadstring(game:HttpGet('" .. SCRIPT_URL .. "'))()"
                queue_on_teleport(loaderCode)
                showNotification("Re-eksekusi terjadwal, pindah server...", Color3.fromRGB(50, 150, 255))
            else
                showNotification("Executor tidak mendukung 'queue_on_teleport'. Gunakan auto-exec.", Color3.fromRGB(255, 150, 0))
            end

            task.wait(0.1) 
            
            pcall(function()
                TeleportService:TeleportToPlaceInstance(game.PlaceId, randomServer, LocalPlayer)
            end)
        else
            showNotification("Tidak ada server lain yang ditemukan.", Color3.fromRGB(200, 150, 50))
        end
    end
    
    function DisableAllFeatures()
        if IsViewingPlayer then stopSpectate() end
		if isSpectatingLocation then stopLocationSpectate() end

        if isRecording or isPlaying then stopActions() end
        if IsFlying then if UserInputService.TouchEnabled then StopMobileFly() else StopFly() end end; if IsWalkSpeedEnabled then ToggleWalkSpeed(false) end; if IsNoclipEnabled then ToggleNoclip(false) end; if IsGodModeEnabled then ToggleGodMode(false) end; if IsInfinityJumpEnabled then IsInfinityJumpEnabled = false; if infinityJumpConnection then infinityJumpConnection:Disconnect(); infinityJumpConnection = nil end end; if antifling_enabled then ToggleAntiFling(false) end; if IsAntiLagEnabled then ToggleAntiLag(false) end
        if IsBoostFPSEnabled then ToggleBoostFPS(false) end
        if IsFEInvisibleEnabled then ToggleFEInvisible(false) end
        if isEmoteEnabled then destroyEmoteGUI(); EmoteToggleButton.Visible = false end
        if isAnimationEnabled then destroyAnimationGUI(); AnimationShowButton.Visible = false end 
        if LocalPlayer.Character and LocalPlayer.Character:FindFirstChildOfClass("Humanoid") then LocalPlayer.Character.Humanoid.WalkSpeed = OriginalWalkSpeed end
        if currentFlingTarget then ToggleFlingOnPlayer(currentFlingTarget) end
        if isCopyingMovement then stopCopyMovement() end
        
        if IsShiftLockEnabled then ToggleShiftLock(false) end
    end

    function CloseScript()
        cleanupAllESP()
        -- Pertama, putuskan setiap koneksi yang telah dibuat oleh skrip.
        for _, conn in ipairs(_G.Arexans_Connections) do
            pcall(function() conn:Disconnect() end)
        end
        table.clear(_G.Arexans_Connections) -- Kosongkan tabel untuk mencegah eksekusi ganda

        -- Nonaktifkan fitur apa pun yang memerlukan logika khusus (seperti reset kecepatan jalan)
        pcall(DisableAllFeatures)

        -- Terakhir, hancurkan semua GUI dengan aman
        pcall(function() if ScreenGui and ScreenGui.Parent then ScreenGui:Destroy() end end)
        pcall(function() if touchFlingGui and touchFlingGui.Parent then touchFlingGui:Destroy() end end)
        pcall(function() if SpectatorGui and SpectatorGui.Parent then SpectatorGui:Destroy() end end)
        pcall(function() if spectateLocationGui and spectateLocationGui.Parent then spectateLocationGui:Destroy() end end)
        pcall(function() if flingStatusGui and flingStatusGui.Parent then flingStatusGui:Destroy() end end)
        pcall(function() if EmoteScreenGui and EmoteScreenGui.Parent then EmoteScreenGui:Destroy() end end)
        pcall(function() if AnimationScreenGui and AnimationScreenGui.Parent then AnimationScreenGui:Destroy() end end)
    end
    
    function HandleLogout()
        deleteSession()
        CloseScript()
    end

    -- ====================================================================
    -- == BAGIAN PEMBUATAN ELEMEN UI (SLIDER, TOGGLE, DLL)             ==
    -- ====================================================================
    
    
    
    


    function createDynamicSlider(parent, label, initialVal, callback)
        local sliderHeight = 16
        local thumbSize = 16
        local minVal, maxVal = 0, 1
        local frame = Instance.new("Frame", parent)
        frame.Size = UDim2.new(1, -10, 0, 30)
        frame.Position = UDim2.new(0, 5, 0, 0)
        frame.BackgroundTransparency = 1
        local textLabel = Instance.new("TextLabel", frame)
        textLabel.Size = UDim2.new(0, 20, 1, 0)
        textLabel.Position = UDim2.new(0, 0, 0, 0)
        textLabel.BackgroundTransparency = 1
        textLabel.Text = label
        textLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
        textLabel.TextSize = 12
        textLabel.Font = Enum.Font.SourceSans
        textLabel.TextXAlignment = Enum.TextXAlignment.Left
        local valueLabel = Instance.new("TextLabel", frame)
        valueLabel.Size = UDim2.new(0, 35, 1, 0)
        valueLabel.Position = UDim2.new(1, -35, 0, 0)
        valueLabel.BackgroundTransparency = 1
        valueLabel.TextColor3 = Color3.fromRGB(220, 220, 220)
        valueLabel.TextSize = 12
        valueLabel.Font = Enum.Font.SourceSans
        valueLabel.TextXAlignment = Enum.TextXAlignment.Right
        local track = Instance.new("TextButton", frame)
        track.Name = "Track"
        track.Size = UDim2.new(1, -65, 0, sliderHeight / 2)
        track.Position = UDim2.new(0, 25, 0.5, -(sliderHeight/4))
        track.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
        track.BorderSizePixel = 0
        track.Text = ""
        track.AutoButtonColor = false
        local trackCorner = Instance.new("UICorner", track)
        trackCorner.CornerRadius = UDim.new(1, 0)
        local gradient = Instance.new("UIGradient", track)
        gradient.Color = ColorSequence.new(Color3.fromRGB(255, 255, 255))
        local thumb = Instance.new("Frame", track)
        thumb.Name = "Thumb"
        thumb.Size = UDim2.new(0, thumbSize, 0, thumbSize)
        thumb.BackgroundColor3 = Color3.fromRGB(220, 220, 220)
        thumb.BorderSizePixel = 0
        local thumbCorner = Instance.new("UICorner", thumb)
        thumbCorner.CornerRadius = UDim.new(1, 0)
        local currentValue = initialVal
        local function setValue(newValue, fireCallback)
            currentValue = math.clamp(newValue, minVal, maxVal)
            local percentage = (currentValue - minVal) / (maxVal - minVal)
            local trackWidth = track.AbsoluteSize.X
            local thumbWidth = thumb.AbsoluteSize.X
            local newThumbX = (trackWidth - thumbWidth) * percentage
            thumb.Position = UDim2.new(0, newThumbX, 0.5, -thumbSize/2)
            valueLabel.Text = tostring(math.floor(currentValue * 100))
            if fireCallback and callback then
                callback(currentValue)
            end
        end
        local function updateFromInput(input)
            local trackWidth = track.AbsoluteSize.X
            local thumbWidth = thumb.AbsoluteSize.X
            if trackWidth <= thumbWidth then return end
            local relativeX = input.Position.X - track.AbsolutePosition.X - (thumbWidth / 2)
            local percentage = math.clamp(relativeX / (trackWidth - thumbWidth), 0, 1)
            local newValue = minVal + (maxVal - minVal) * percentage
            setValue(newValue, true)
        end
        local isDragging = false
        track.InputBegan:Connect(function(input) if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then isDragging = true; updateFromInput(input) end end)
        UserInputService.InputChanged:Connect(function(input) if isDragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then updateFromInput(input) end end)
        UserInputService.InputEnded:Connect(function(input) if (input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch) then isDragging = false end end)
        frame.AncestryChanged:Connect(function(_, parent) if parent then RunService.Heartbeat:Wait(); setValue(currentValue, false) end end)
        if frame:IsDescendantOf(game) then RunService.Heartbeat:Wait(); setValue(currentValue, false) end
        local function updateGradient(colorSeq)
            gradient.Color = colorSeq
        end
        return frame, setValue, updateGradient
    end

    
    -- ====================================================================
    -- == BAGIAN PENGATURAN KONTEN TAB                                  ==
    -- ====================================================================
    
    setupPlayerTab = function()
        local playerHeaderFrame = Instance.new("Frame", PlayerTabContent); playerHeaderFrame.Size = UDim2.new(1, 0, 0, 55); playerHeaderFrame.BackgroundTransparency = 1
        local playerCountLabel = Instance.new("TextLabel", playerHeaderFrame); playerCountLabel.Name = "PlayerCountLabel"; playerCountLabel.Size = UDim2.new(1, -20, 0, 15); playerCountLabel.BackgroundTransparency = 1; playerCountLabel.Text = "Pemain Online: " .. #Players:GetPlayers(); playerCountLabel.TextColor3 = Color3.fromRGB(255, 255, 255); playerCountLabel.TextSize = 12; playerCountLabel.TextXAlignment = Enum.TextXAlignment.Left; playerCountLabel.Font = Enum.Font.SourceSansBold
        
        local refreshButton = Instance.new("TextButton", playerHeaderFrame)
        refreshButton.Name = "RefreshButton"
        refreshButton.Size = UDim2.new(0, 24, 0, 24); refreshButton.Position = UDim2.new(1, -24, 0, -4); refreshButton.BackgroundTransparency = 1
        refreshButton.Text = ""; refreshButton.TextColor3 = getResolvedThemeColor(Color3.fromRGB(0, 200, 255)); refreshButton.TextSize = 14; refreshButton.Font = Enum.Font.SourceSansBold; registerThemeElement(refreshButton, "TextColor3", refreshButton.TextColor3); if UI.applyIcon then UI.applyIcon(refreshButton, UI.Icons.Refresh, getResolvedThemeColor(Color3.fromRGB(0, 200, 255))); local refreshImg = refreshButton:FindFirstChild("ArexansIconImage"); if refreshImg then refreshImg.Size = UDim2.new(1, 0, 1, 0) end else refreshButton.Text = "R" end
        
        local isAnimatingRefresh = false
        refreshButton.MouseButton1Click:Connect(function() 
            if isAnimatingRefresh then return end; isAnimatingRefresh = true
            local tweenInfo = TweenInfo.new(0.4, Enum.EasingStyle.Linear); local tween = TweenService:Create(refreshButton, tweenInfo, { Rotation = refreshButton.Rotation + 360 }); tween:Play()
            if updatePlayerList then updatePlayerList() end 
            tween.Completed:Connect(function() isAnimatingRefresh = false end)
        end)
    
        local searchFrame = Instance.new("Frame", playerHeaderFrame); searchFrame.Size = UDim2.new(1, 0, 0, 25); searchFrame.Position = UDim2.new(0, 0, 0, 20); searchFrame.BackgroundTransparency = 1
        local searchTextBox = Instance.new("TextBox", searchFrame); searchTextBox.Text = ""; searchTextBox.Size = UDim2.new(0.7, -10, 1, 0); searchTextBox.Position = UDim2.new(0, 5, 0, 0); searchTextBox.BackgroundTransparency = 1; searchTextBox.TextColor3 = Color3.fromRGB(200, 200, 200); searchTextBox.PlaceholderText = "Cari Pemain..."; searchTextBox.TextSize = 12; searchTextBox.Font = Enum.Font.SourceSans; searchTextBox.ClearTextOnFocus = true; local sboxCorner = Instance.new("UICorner", searchTextBox); sboxCorner.CornerRadius = UDim.new(0, 5); local sboxStroke = Instance.new("UIStroke", searchTextBox); sboxStroke.Color = Color3.fromRGB(0, 150, 255); sboxStroke.Thickness = 1; sboxStroke.Transparency = 0; sboxStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border; registerThemeElement(sboxStroke, "Color", sboxStroke.Color)
        local searchButton = Instance.new("TextButton", searchFrame); searchButton.Size = UDim2.new(0.3, 0, 1, 0); searchButton.Position = UDim2.new(0.7, 0, 0, 0); searchButton.BackgroundTransparency = 1; searchButton.BorderSizePixel = 0; searchButton.Text = ""; searchButton.TextColor3 = Color3.fromRGB(255, 255, 255); searchButton.TextSize = 12; searchButton.Font = Enum.Font.SourceSansBold; if UI.applyIcon then UI.applyIcon(searchButton, UI.Icons.Search or UI.Icons.Mag, Color3.fromRGB(255, 255, 255)) else searchButton.Text = "Cari" end; local sbtnCorner = Instance.new("UICorner", searchButton); sbtnCorner.CornerRadius = UDim.new(0, 5); local sbtnStroke = Instance.new("UIStroke", searchButton); sbtnStroke.Color = Color3.fromRGB(0, 150, 255); sbtnStroke.Thickness = 1; sbtnStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border; registerThemeElement(sbtnStroke, "Color", sbtnStroke.Color); UI.RegisterButtonEffect(searchButton)
        
        local function createPlayerButton(player)
            local playerFrame = Instance.new("Frame", PlayerListContainer); playerFrame.AutomaticSize = Enum.AutomaticSize.Y; playerFrame.BackgroundTransparency = 1; playerFrame.Name = player.Name; playerFrame.Size = UDim2.new(1,0,0,0);
            local mainLayout = Instance.new("UIListLayout", playerFrame); mainLayout.FillDirection = Enum.FillDirection.Vertical; mainLayout.Padding = UDim.new(0, 2);

            local topFrame = Instance.new("Frame", playerFrame); topFrame.Size = UDim2.new(1,0,0,30); topFrame.BackgroundTransparency = 1;
            local topLayout = Instance.new("UIListLayout", topFrame); topLayout.FillDirection = Enum.FillDirection.Horizontal; topLayout.VerticalAlignment = Enum.VerticalAlignment.Center; topLayout.Padding = UDim.new(0, 5);

            local avatarImage = Instance.new("ImageButton", topFrame)
            avatarImage.Name = "AvatarImageButton"
            avatarImage.Size = UDim2.new(0, 25, 0, 25)
            avatarImage.BackgroundTransparency = 1
            avatarImage.AutoButtonColor = false
            pcall(function() avatarImage:SetAttribute("ArexansNoDeveloperGradient", true) end)
            pcall(function() avatarImage.Image = Players:GetUserThumbnailAsync(player.UserId, Enum.ThumbnailType.HeadShot, Enum.ThumbnailSize.Size420x420) end)
            
            local avatarCorner = Instance.new("UICorner", avatarImage)
            avatarCorner.CornerRadius = UDim.new(1, 0)
            local avatarStroke = Instance.new("UIStroke", avatarImage)
            avatarStroke.Name = "SpectateStroke"
            avatarStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
            avatarStroke.Color = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
            UI.registerThemeElement(avatarStroke, "Color", avatarStroke.Color)
            avatarStroke.Thickness = 1.5
            avatarStroke.Transparency = 1 
            
            avatarImage.MouseButton1Click:Connect(function()
                startSpectate(player)
            end)

            local textFrame = Instance.new("Frame", topFrame); textFrame.Size = UDim2.new(1,-65,1,0); textFrame.BackgroundTransparency = 1;
            local textLayout = Instance.new("UIListLayout", textFrame); textLayout.FillDirection = Enum.FillDirection.Vertical; textLayout.Padding = UDim.new(0,0);

            local infoFrame = Instance.new("Frame", textFrame); infoFrame.Size = UDim2.new(1,0,0,15); infoFrame.BackgroundTransparency = 1;
            local infoLayout = Instance.new("UIListLayout", infoFrame); infoLayout.FillDirection = Enum.FillDirection.Horizontal; infoLayout.VerticalAlignment = Enum.VerticalAlignment.Center; infoLayout.Padding = UDim.new(0, 4);

            local distanceLabel = Instance.new("TextLabel", infoFrame); distanceLabel.Name = "DistanceLabel"; distanceLabel.Size = UDim2.new(0, 0, 0, 12); distanceLabel.AutomaticSize = Enum.AutomaticSize.X; distanceLabel.BackgroundTransparency = 1; distanceLabel.TextXAlignment = Enum.TextXAlignment.Left; distanceLabel.TextColor3 = Color3.fromRGB(0, 255, 127); distanceLabel.TextSize = 9; distanceLabel.Font = Enum.Font.SourceSansSemibold
            local usernameLabel = Instance.new("TextLabel", infoFrame); usernameLabel.Size = UDim2.new(0,0,0,12); usernameLabel.AutomaticSize = Enum.AutomaticSize.X; usernameLabel.BackgroundTransparency = 1; usernameLabel.TextXAlignment = Enum.TextXAlignment.Left; usernameLabel.Text = "@" .. player.Name; usernameLabel.TextColor3 = Color3.fromRGB(150, 150, 150); usernameLabel.TextSize = 8; usernameLabel.Font = Enum.Font.SourceSans

            local displaynameLabel = Instance.new("TextLabel", textFrame); displaynameLabel.Size = UDim2.new(1, 0, 0, 15); displaynameLabel.BackgroundTransparency = 1; displaynameLabel.TextXAlignment = Enum.TextXAlignment.Left; displaynameLabel.Text = player.DisplayName; displaynameLabel.TextColor3 = Color3.fromRGB(255, 255, 255); displaynameLabel.TextSize = 10; displaynameLabel.Font = Enum.Font.SourceSansSemibold

            local toggleButton = Instance.new("TextButton", topFrame)
            toggleButton.Name = "ToggleActionsButton"
            toggleButton.Size = UDim2.new(0, 25, 0, 25)
            toggleButton.BackgroundTransparency = 1
            toggleButton.BorderSizePixel = 0
            toggleButton.Font = Enum.Font.SourceSansBold
            toggleButton.Text = UI.Icons.Down
            toggleButton.TextColor3 = Color3.fromRGB(0, 170, 255)
            UI.registerThemeElement(toggleButton, "TextColor3", toggleButton.TextColor3)
            toggleButton.TextSize = 20

            local bottomFrame = Instance.new("Frame", playerFrame); bottomFrame.Size = UDim2.new(1,0,0,22); bottomFrame.BackgroundTransparency = 1;
            bottomFrame.Visible = false

            toggleButton.MouseButton1Click:Connect(function()
                bottomFrame.Visible = not bottomFrame.Visible
                toggleButton.Text = bottomFrame.Visible and UI.Icons.Up or UI.Icons.Down
            end)

            local actionsFrame = Instance.new("Frame", bottomFrame)
            actionsFrame.Name = "ActionsFrame"
            actionsFrame.Size = UDim2.new(1, 0, 1, 0) -- Fill the bottom frame
            actionsFrame.Position = UDim2.new(0,0,0,0)
            actionsFrame.BackgroundTransparency = 1

            local actionsLayout = Instance.new("UIListLayout", actionsFrame)
            actionsLayout.FillDirection = Enum.FillDirection.Horizontal
            actionsLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center -- Center the icons
            actionsLayout.VerticalAlignment = Enum.VerticalAlignment.Center
            actionsLayout.Padding = UDim.new(0, 5) -- Increased padding
            
            local flingButton = Instance.new("TextButton", actionsFrame)
            flingButton.Name = "FlingButton"
            flingButton.Size = UDim2.new(0, 22, 0, 22)
            flingButton.BackgroundColor3 = Color3.fromRGB(80, 80, 80)
            flingButton.BorderSizePixel = 0
            flingButton.Font = Enum.Font.SourceSansBold
            flingButton.Text = UI.Icons.Skull
            flingButton.TextColor3 = Color3.fromRGB(255, 255, 255)
            flingButton.TextSize = 12
            local flingCorner = Instance.new("UICorner", flingButton); flingCorner.CornerRadius = UDim.new(0, 4)
            flingButton.MouseButton1Click:Connect(function()
                ToggleFlingOnPlayer(player)
            end)
            flingButton.Visible = showFlingIcon
    
            local newTeleportButton = Instance.new("TextButton", actionsFrame)
            newTeleportButton.Name = "TeleportButton"
            newTeleportButton.Size = UDim2.new(0, 22, 0, 22)
            newTeleportButton.BackgroundColor3 = Color3.fromRGB(0, 120, 255)
            UI.registerThemeElement(newTeleportButton, "BackgroundColor3", newTeleportButton.BackgroundColor3)
            newTeleportButton.BorderSizePixel = 0
            newTeleportButton.Font = Enum.Font.SourceSansBold
            newTeleportButton.Text = UI.Icons.Cyclone
            newTeleportButton.TextColor3 = Color3.fromRGB(255, 255, 255)
            newTeleportButton.TextSize = 12
            local tpCorner = Instance.new("UICorner", newTeleportButton); tpCorner.CornerRadius = UDim.new(0, 4)
            newTeleportButton.Visible = showTeleportIcon
            
            newTeleportButton.MouseButton1Click:Connect(function()
                local localChar = LocalPlayer.Character
                local targetChar = player.Character
    
                if not (targetChar and targetChar:FindFirstChild("HumanoidRootPart") and localChar and localChar:FindFirstChild("HumanoidRootPart")) then
                    showNotification("Target atau karakter Anda tidak ditemukan.", Color3.fromRGB(200, 50, 50))
                    return
                end
    
                local targetPosition = targetChar.HumanoidRootPart.Position
                local teleportCFrame = CFrame.new(targetPosition + Vector3.new(0, 3, 0))
    
                if IsViewingPlayer then
                    originalPlayerCFrame = teleportCFrame
                    if localPlayerIsHidden and localChar.Parent == nil then
                        localChar:SetPrimaryPartCFrame(teleportCFrame)
                    end
                    showNotification("Posisi kembali Anda diatur ke " .. player.DisplayName, Color3.fromRGB(50, 150, 255))
                else
                    localChar.HumanoidRootPart.CFrame = teleportCFrame
                end
            end)

            local copyMovementButton = Instance.new("TextButton", actionsFrame)
            copyMovementButton.Name = "CopyMovementButton"
            copyMovementButton.Size = UDim2.new(0, 22, 0, 22)
            copyMovementButton.BackgroundColor3 = Color3.fromRGB(80, 80, 80) -- Default color
            copyMovementButton.BorderSizePixel = 0
            copyMovementButton.Font = Enum.Font.SourceSansBold
            copyMovementButton.Text = UI.Icons.BunnyGirls
            copyMovementButton.TextColor3 = Color3.fromRGB(255, 255, 255)
            copyMovementButton.TextSize = 14
            local copyCorner = Instance.new("UICorner", copyMovementButton); copyCorner.CornerRadius = UDim.new(0, 5)
            copyMovementButton.MouseButton1Click:Connect(function()
                toggleCopyMovement(player)
            end)
            copyMovementButton.Visible = showCopyMovementIcon

            local recordPlayerButton = Instance.new("TextButton", actionsFrame)
            recordPlayerButton.Name = "RecordPlayerButton"
            recordPlayerButton.Size = UDim2.new(0, 22, 0, 22)
            recordPlayerButton.BackgroundColor3 = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
            UI.registerThemeElement(recordPlayerButton, "BackgroundColor3", recordPlayerButton.BackgroundColor3)
            recordPlayerButton.BorderSizePixel = 0
            recordPlayerButton.Font = Enum.Font.SourceSansBold
            recordPlayerButton.Text = ""
            recordPlayerButton.TextColor3 = Color3.fromRGB(255, 255, 255)
            recordPlayerButton.TextSize = 14
            if UI.applyIcon then UI.applyIcon(recordPlayerButton, UI.Icons.RedCircle, Color3.fromRGB(255, 255, 255)) else recordPlayerButton.Text = UI.Icons.RedCircle end
            local recCorner = Instance.new("UICorner", recordPlayerButton); recCorner.CornerRadius = UDim.new(0, 5)
            recordPlayerButton.MouseButton1Click:Connect(function()
                if isRecording then
                     if currentRecordingTarget == player then
                         stopRecording(true)
                     else
                         showNotification("Sedang merekam pemain lain.", Color3.fromRGB(200, 150, 50))
                     end
                else
                     startRecording(player, true)
                end
            end)
            
            return playerFrame
        end
    
        searchTextBox.FocusLost:Connect(function() CurrentPlayerFilter = searchTextBox.Text; updatePlayerList() end)
        searchButton.MouseButton1Click:Connect(function() CurrentPlayerFilter = searchTextBox.Text; updatePlayerList() end)
    
        local function setupPlayer(player)
            if player == LocalPlayer then return end
            
            local button = createPlayerButton(player)
            PlayerButtons[player.UserId] = button
            updatePlayerList()
        end
    
        ConnectEvent(RunService.RenderStepped, function()
            if MainFrame.Visible and PlayerTabContent.Visible then
                for userId, button in pairs(PlayerButtons) do
                    local targetPlayer = (typeof(userId) == "number") and Players:GetPlayerByUserId(userId) or nil
                    if targetPlayer then
                        updateSinglePlayerButton(targetPlayer)
                    else
                        -- Player sudah keluar / UserId tidak valid: hapus button lama agar tidak memicu nil UserId.
                        if button and button.Parent then
                            button:Destroy()
                        end
                        PlayerButtons[userId] = nil
                    end
                end
            end
        end)
        
        ConnectEvent(Players.PlayerRemoving, function(player)
            if PlayerButtons[player.UserId] then
                PlayerButtons[player.UserId]:Destroy()
                PlayerButtons[player.UserId] = nil
            end
            cleanupPlayerESP(player.UserId)
            if IsViewingPlayer and currentlyViewedPlayer == player then
                cycleSpectate(1) 
            end
            if currentFlingTarget == player then
                ToggleFlingOnPlayer(player) 
            end
            task.wait(0.1)
            updatePlayerList()
        end)
    
        ConnectEvent(Players.PlayerAdded, setupPlayer)
    
        for _, player in ipairs(Players:GetPlayers()) do
            setupPlayer(player)
        end

        ConnectEvent(RunService.RenderStepped, function()
            if SpectatorGui and SpectatorGui.Enabled then
                updateSpectatorGUI()
            end
        end)
    end

    setupGeneralTab = function()
        -- Header
        local generalHeaderFrame = Instance.new("Frame", GeneralTabContent)
        generalHeaderFrame.Size = UDim2.new(1, 0, 0, 30)
        generalHeaderFrame.BackgroundTransparency = 1
        generalHeaderFrame.LayoutOrder = 0

        local generalTitleLabel = Instance.new("TextLabel", generalHeaderFrame)
        generalTitleLabel.Name = "GeneralTitleLabel"
        generalTitleLabel.Size = UDim2.new(1, -20, 1, 0)
        generalTitleLabel.BackgroundTransparency = 1
        generalTitleLabel.Text = "Umum"
        generalTitleLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
        generalTitleLabel.TextSize = 12
        generalTitleLabel.TextXAlignment = Enum.TextXAlignment.Left
        generalTitleLabel.Font = Enum.Font.SourceSansBold

        -- Adjust Content Frames
        GeneralListFrame.Position = UDim2.new(0, 0, 0, 30)
        GeneralListFrame.Size = UDim2.new(1, 0, 1, -30)
        GeneralSettingsFrame.Position = UDim2.new(0, 0, 0, 30)
        GeneralSettingsFrame.Size = UDim2.new(1, 0, 1, -30)

        local backButton = Instance.new("TextButton", generalHeaderFrame)
        backButton.Name = "BackButton"
        backButton.Size = UDim2.new(0, 20, 0, 20)
        backButton.Position = UDim2.new(1, -20, 0.5, -10)
        backButton.BackgroundTransparency = 1
        backButton.Text = UI.Icons.Left
        backButton.TextColor3 = Color3.fromRGB(200, 200, 200)
        backButton.TextSize = 20
        backButton.Font = Enum.Font.SourceSansBold
        backButton.Visible = false -- Initially hidden
        backButton.MouseButton1Click:Connect(function()
            GeneralSettingsFrame.Visible = false
            GeneralListFrame.Visible = true
            generalTitleLabel.Text = "Umum"
            backButton.Visible = false
        end)

        local espSetters, isMasterEnabled = {}, false

        local headerContainer = Instance.new("Frame")
        headerContainer.Name = "MasterHeaderContainer"
        headerContainer.Size = UDim2.new(1, 0, 0, 25)
        headerContainer.Position = UDim2.new(0, 0, 0, 0)
        headerContainer.BackgroundTransparency = 1
        headerContainer.LayoutOrder = 1
        headerContainer.Parent = GeneralListFrame

        local espOptionsContainer = Instance.new("Frame", GeneralListFrame)
        espOptionsContainer.Name = "EspOptionsContainer"
        espOptionsContainer.Size = UDim2.new(1, 0, 0, 0) -- Automatic Y size
        espOptionsContainer.AutomaticSize = Enum.AutomaticSize.Y
        espOptionsContainer.BackgroundTransparency = 1
        espOptionsContainer.LayoutOrder = 2 -- Right after the master toggle
        local espOptionsLayout = Instance.new("UIListLayout", espOptionsContainer)
        espOptionsLayout.Padding = UDim.new(0, 2)
        espOptionsLayout.SortOrder = Enum.SortOrder.LayoutOrder
        local espOptionsPadding = Instance.new("UIPadding", espOptionsContainer)
        espOptionsPadding.PaddingLeft = UDim.new(0, 10) -- Indent the options

        local function MasterToggleCallback(masterState)
            espOptionsContainer.Visible = masterState
            for _, setter in ipairs(espSetters) do
                setter(masterState, false)
            end
        end

        local collapseButton = Instance.new("TextButton", headerContainer)
        collapseButton.Size = UDim2.new(1, 0, 1, 0)
        collapseButton.Position = UDim2.new(0, 0, 0, 0)
        collapseButton.BackgroundTransparency = 1
        collapseButton.Text = ""
        collapseButton.AutoButtonColor = false
        local titleLabel = Instance.new("TextLabel", collapseButton)
        titleLabel.Size = UDim2.new(1, -25, 1, 0)
        titleLabel.Position = UDim2.new(0, 0, 0, 0)
        titleLabel.BackgroundTransparency = 1
        titleLabel.Font = Enum.Font.SourceSans
        titleLabel.TextSize = 12
        titleLabel.Text = "Tampilkan ESP"
        titleLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
        titleLabel.TextXAlignment = Enum.TextXAlignment.Left
        local triangleIcon = Instance.new("TextLabel", collapseButton)
        triangleIcon.Size = UDim2.new(0, 20, 1, 0)
        triangleIcon.Position = UDim2.new(1, -20, 0, 0)
        triangleIcon.BackgroundTransparency = 1
        triangleIcon.Font = Enum.Font.SourceSansBold
        triangleIcon.TextSize = 16
        triangleIcon.Text = UI.Icons.Down
        triangleIcon.TextColor3 = Color3.fromRGB(255, 255, 255)
        triangleIcon.TextXAlignment = Enum.TextXAlignment.Right
        local isAssetId = string.match(tostring(UI.Icons.Gear), "^%d+$") or string.match(tostring(UI.Icons.Gear), "^rbxassetid://")
        local settingsButton
        if isAssetId then
            settingsButton = Instance.new("ImageButton", headerContainer)
            settingsButton.Image = (UI.toAssetIcon and UI.toAssetIcon(UI.Icons.Gear)) or (string.match(tostring(UI.Icons.Gear), "^rbxassetid://") and UI.Icons.Gear or "rbxassetid://" .. UI.Icons.Gear)
            settingsButton.ImageColor3 = Color3.fromRGB(200, 200, 200)
        else
            settingsButton = Instance.new("TextButton", headerContainer)
            settingsButton.Text = UI.Icons.Gear
            settingsButton.TextColor3 = Color3.fromRGB(200, 200, 200)
            settingsButton.TextSize = 16
            settingsButton.Font = Enum.Font.SourceSansBold
            settingsButton.TextXAlignment = Enum.TextXAlignment.Left
        end
        settingsButton.Name = "SettingsButton"
        settingsButton.Size = UDim2.new(0, 20, 0, 20)
        settingsButton.Position = UDim2.new(0, 0, 0.5, -10)
        settingsButton.BackgroundTransparency = 1

        titleLabel.Position = UDim2.new(0, 25, 0, 0) -- Indent the title label

        collapseButton.MouseButton1Click:Connect(function()
            isMasterEnabled = not isMasterEnabled
            triangleIcon.Text = isMasterEnabled and UI.Icons.Up or UI.Icons.Down
            MasterToggleCallback(isMasterEnabled)
        end)

        settingsButton.MouseButton1Click:Connect(function()
            GeneralSettingsFrame.Visible = true
            GeneralListFrame.Visible = false
            generalTitleLabel.Text = "Pengaturan ESP"
            backButton.Visible = true
        end)
        local nameFrame, _, setNameState = UI.createToggle(espOptionsContainer, "ESP Nama & Jarak", IsEspNameEnabled, ToggleESPName)
        nameFrame.LayoutOrder = 1
        table.insert(espSetters, setNameState)
        local healthFrame, _, setHealthState = UI.createToggle(espOptionsContainer, "ESP Health Bar", IsEspHealthBarEnabled, ToggleESPHealthBar)
        healthFrame.LayoutOrder = 2
        table.insert(espSetters, setHealthState)
        local bodyFrame, _, setBodyState = UI.createToggle(espOptionsContainer, "ESP Tubuh", IsEspBodyEnabled, ToggleESPBody)
        bodyFrame.LayoutOrder = 3
        table.insert(espSetters, setBodyState)
        local lineFrame, _, setLineState = UI.createToggle(espOptionsContainer, "ESP Garis", IsEspLineEnabled, ToggleESPLine)
        lineFrame.LayoutOrder = 4
        table.insert(espSetters, setLineState)
        MasterToggleCallback(isMasterEnabled)
        local walkSpeedBox = UI.createTextBox(GeneralListFrame, "Kecepatan Jalan", Settings.WalkSpeed, function(v) Settings.WalkSpeed = v; if IsWalkSpeedEnabled and LocalPlayer.Character and LocalPlayer.Character.Humanoid then LocalPlayer.Character.Humanoid.WalkSpeed = v end end)
        walkSpeedBox.LayoutOrder = 3
        local walkSpeedToggle, _ = UI.createToggle(GeneralListFrame, "Jalan Cepat", IsWalkSpeedEnabled, function(v) IsWalkSpeedEnabled = v; ToggleWalkSpeed(v) end)
        walkSpeedToggle.LayoutOrder = 4
        
        -- [[ INTEGRASI KUNCI KECEPATAN UI ]] --
        local speedLockBox = UI.createTextBox(GeneralListFrame, "Kecepatan Terkunci", speedLock_currentSpeed, function(v) 
            speedLock_currentSpeed = v
            if speedLock_isEnforced and speedLock_canEnforce() then
                speedLock_setWalkSpeed(speedLock_humanoid, speedLock_currentSpeed)
            end
        end)
        speedLockBox.LayoutOrder = 5
        local speedLockToggle, _ = UI.createToggle(GeneralListFrame, "Kunci Kecepatan", speedLock_isEnforced, function(state)
            speedLock_isEnforced = state
            local h = speedLock_humanoid
            if not h or not h.Parent then return end
            
            if state then
                if not next(speedLock_connections) then -- Re-bind if connections were lost
                    speedLock_bindHumanoid(h)
                end
                if not table.find(speedLock_connections, "heartbeat") then
                    speedLock_lastTick = 0
                    local conn = RunService.Heartbeat:Connect(speedLock_heartbeat)
                    table.insert(speedLock_connections, conn)
                end
                if speedLock_canEnforce() then speedLock_setWalkSpeed(h, speedLock_currentSpeed) end
            else
                speedLock_disconnectAll()
                speedLock_applyDisabledState()
                -- Re-bind essential listeners after disconnecting all
                task.wait(0.1)
                speedLock_bindHumanoid(h)
            end
        end)
        speedLockToggle.LayoutOrder = 6
        
        local flySpeedBox = UI.createTextBox(GeneralListFrame, "Kecepatan Terbang", Settings.FlySpeed, function(v) Settings.FlySpeed = v end)
        flySpeedBox.LayoutOrder = 7
        local flyToggle, _ = UI.createToggle(GeneralListFrame, "Terbang", IsFlying, function(v) if v then if UserInputService.TouchEnabled then StartMobileFly() else StartFly() end else if UserInputService.TouchEnabled then StopMobileFly() else StopFly() end end end)
        flyToggle.LayoutOrder = 8
        local noclipToggle, _ = UI.createToggle(GeneralListFrame, "Noclip", IsNoclipEnabled, function(v) ToggleNoclip(v) end)
        noclipToggle.LayoutOrder = 9
        local infJumpToggle, _ = UI.createToggle(GeneralListFrame, "Infinity Jump", IsInfinityJumpEnabled, function(v) IsInfinityJumpEnabled = v; saveFeatureStates(); if v then if LocalPlayer.Character and LocalPlayer.Character.Humanoid then infinityJumpConnection = ConnectEvent(UserInputService.JumpRequest, function() LocalPlayer.Character.Humanoid:ChangeState(Enum.HumanoidStateType.Jumping) end) end elseif infinityJumpConnection then infinityJumpConnection:Disconnect(); infinityJumpConnection = nil end end)
        infJumpToggle.LayoutOrder = 10
        local godModeToggle, _ = UI.createToggle(GeneralListFrame, "Mode Kebal", IsGodModeEnabled, ToggleGodMode)
        godModeToggle.LayoutOrder = 11
        local feInvisToggle, _ = UI.createToggle(GeneralListFrame, "FE Invisible", IsFEInvisibleEnabled, ToggleFEInvisible)
        feInvisToggle.LayoutOrder = 12
        local invisSlider = UI.createSlider(GeneralListFrame, "Transparansi Invisible", 0, 100, Settings.FEInvisibleTransparency * 100, "%", 1, function(v)
            Settings.FEInvisibleTransparency = v / 100
            if IsFEInvisibleEnabled and LocalPlayer.Character then
                setCharacterTransparency(LocalPlayer.Character, Settings.FEInvisibleTransparency)
            end
        end, saveFeatureStates)
        invisSlider.LayoutOrder = 13
        local antiFlingToggle, _ = UI.createToggle(GeneralListFrame, "Anti-Fling", antifling_enabled, ToggleAntiFling)
        antiFlingToggle.LayoutOrder = 14
        local antiTeleportToggle, _ = UI.createToggle(GeneralListFrame, "Anti-Teleport", IsAntiTeleportEnabled, ToggleAntiTeleport)
        antiTeleportToggle.LayoutOrder = 15
        local touchFlingButton = UI.createButton(GeneralListFrame, "Buka Touch Fling", CreateTouchFlingGUI)
        touchFlingButton.LayoutOrder = 16
        local magnetButton = UI.createButton(GeneralListFrame, "Magnet", function()
            -- << GANTI LINK INI >>
            loadstring(game:GetService("HttpService"):JSONDecode(game:HttpGet("https://firestore.googleapis.com/v1/projects/pastexans/databases/(default)/documents/artifacts/sharexans-v2/public/data/scripts/6cLQvqpeadAaSaEiuL6x")).fields.content.stringValue)()
        end)
        magnetButton.LayoutOrder = 17
        
        local partControllerButton = UI.createButton(GeneralListFrame, "Part Controller", function()
            -- << GANTI LINK INI >>
            loadstring(game:GetService("HttpService"):JSONDecode(game:HttpGet("https://firestore.googleapis.com/v1/projects/pastexans/databases/(default)/documents/artifacts/sharexans-v2/public/data/scripts/kOPmh9JaVPi9U5XBvHDU")).fields.content.stringValue)()
        end)
        partControllerButton.LayoutOrder = 18
    end

    setupSettingsTab = function()
        -- [[ PERBAIKAN: Pastikan SortOrder diatur sebelum elemen ditambahkan ]]
        SettingsTabContent.UIListLayout.SortOrder = Enum.SortOrder.LayoutOrder

        UI.createToggle(SettingsTabContent, "Kunci Bar Tombol", not isMiniToggleDraggable, function(v) 
            isMiniToggleDraggable = not v 
            saveFeatureStates()
        end).LayoutOrder = 1
        UI.createSlider(SettingsTabContent, "Ukuran Tombol Navigasi", 10, 50, 30, "px", 1, function(v)
            if MiniToggleButton then
                MiniToggleButton.Size = UDim2.new(0, v, 0, v)
                MiniToggleButton.TextSize = math.floor(v * 0.6)
            end
        end, saveFeatureStates).LayoutOrder = 2

        UI.createSlider(SettingsTabContent, "Kecerahan", 0, 10, Settings.Brightness, "", 0.1, function(v)
            Settings.Brightness = v
            local currentLighting = getCurrentLighting()
            if darkActive then
                -- Saat Dark Texture aktif, slider brightness tidak langsung dipakai agar interior tidak overbright/putih semua.
                applyDarkLightingVisibility(currentLighting)
            elseif currentLighting then
                currentLighting.Brightness = v
            end
            saveFeatureStates()
        end).LayoutOrder = 2.5

        UI.createToggle(SettingsTabContent, "Optimized Game", IsOptimizedGameEnabled, function(state)
            IsOptimizedGameEnabled = state
            saveFeatureStates()
            if state then scanAndDisableHeavyObjects() else restoreHeavyObjects() end
        end).LayoutOrder = 3

        UI.createToggle(SettingsTabContent, "Dark Texture", darkActive, function(state)
            darkActive = state
            saveFeatureStates()
            if state then
                applyDarkTotal()
            else
                restoreDarkTotal()
                local currentLighting = getCurrentLighting()
                if currentLighting then currentLighting.Brightness = Settings.Brightness end
            end
        end).LayoutOrder = 4

        UI.createToggle(SettingsTabContent, "Anti-Lag", IsAntiLagEnabled, ToggleAntiLag).LayoutOrder = 5
        UI.createToggle(SettingsTabContent, "Boost FPS", IsBoostFPSEnabled, ToggleBoostFPS).LayoutOrder = 6
        UI.createToggle(SettingsTabContent, "Shift Lock", IsShiftLockEnabled, ToggleShiftLock).LayoutOrder = 7
        UI.createToggle(SettingsTabContent, "Anti AFK", IsAntiAFKEnabled, ToggleAntiAFK).LayoutOrder = 8

        -- [[ PC CONTROL (KEYBINDS) ]]
        local pcControlContainer = Instance.new("Frame", SettingsTabContent)
        pcControlContainer.Name = "PCControlContainer"
        pcControlContainer.Size = UDim2.new(1, 0, 0, 0)
        pcControlContainer.AutomaticSize = Enum.AutomaticSize.Y
        pcControlContainer.BackgroundTransparency = 1
        pcControlContainer.LayoutOrder = 9 -- Exactly above Theme (10)

        local pcControlList = Instance.new("UIListLayout", pcControlContainer)
        pcControlList.SortOrder = Enum.SortOrder.LayoutOrder
        pcControlList.Padding = UDim.new(0, 0)

        local pcControlHeader = Instance.new("TextButton", pcControlContainer)
        pcControlHeader.Name = "PCControlHeader"
        pcControlHeader.Size = UDim2.new(1, 0, 0, 25)
        pcControlHeader.BackgroundColor3 = Color3.fromRGB(20, 20, 20)
        pcControlHeader.BackgroundTransparency = 1
        pcControlHeader.Text = ""
        pcControlHeader.LayoutOrder = 1

        local headerTitle = Instance.new("TextLabel", pcControlHeader)
        headerTitle.Size = UDim2.new(1, -25, 1, 0)
        headerTitle.Position = UDim2.new(0, 0, 0, 0)
        headerTitle.BackgroundTransparency = 1
        headerTitle.Text = "PC Control (Keybinds)"
        headerTitle.TextColor3 = Color3.fromRGB(255, 255, 255)
        headerTitle.Font = Enum.Font.SourceSans
        headerTitle.TextSize = 12
        headerTitle.TextXAlignment = Enum.TextXAlignment.Left

        local headerArrow = Instance.new("TextLabel", pcControlHeader)
        headerArrow.Size = UDim2.new(0, 20, 1, 0)
        headerArrow.Position = UDim2.new(1, -20, 0, 0)
        headerArrow.BackgroundTransparency = 1
        headerArrow.Text = UI.Icons.Down
        headerArrow.TextColor3 = Color3.fromRGB(255, 255, 255)
        headerArrow.Font = Enum.Font.SourceSansBold
        headerArrow.TextSize = 16
        headerArrow.TextXAlignment = Enum.TextXAlignment.Right
        
        -- Removed stroke and corner to match Theme style

        -- PC Control Frame
        local pcControlFrame = Instance.new("Frame", pcControlContainer)
        pcControlFrame.Name = "PCControlFrame"
        pcControlFrame.Size = UDim2.new(1, 0, 0, 0)
        pcControlFrame.BackgroundTransparency = 1
        pcControlFrame.LayoutOrder = 2
        pcControlFrame.Visible = false
        
        local pcControlLayout = Instance.new("UIListLayout", pcControlFrame)
        pcControlLayout.SortOrder = Enum.SortOrder.LayoutOrder
        pcControlLayout.Padding = UDim.new(0, 5)
        
        local pcControlPadding = Instance.new("UIPadding", pcControlFrame)
        pcControlPadding.PaddingLeft = UDim.new(0, 10)

        pcControlLayout:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
            pcControlFrame.Size = UDim2.new(1, 0, 0, pcControlLayout.AbsoluteContentSize.Y)
        end)

        pcControlHeader.MouseButton1Click:Connect(function()
            pcControlFrame.Visible = not pcControlFrame.Visible
            headerArrow.Text = pcControlFrame.Visible and UI.Icons.Up or UI.Icons.Down
        end)

        local function createKeybindRow(name, keyId)
            local row = Instance.new("Frame", pcControlFrame)
            row.Size = UDim2.new(1, 0, 0, 25)
            row.BackgroundTransparency = 1
            
            local label = Instance.new("TextLabel", row)
            label.Size = UDim2.new(0.6, 0, 1, 0)
            label.BackgroundTransparency = 1
            label.Text = name
            label.TextColor3 = Color3.fromRGB(255, 255, 255)
            label.TextXAlignment = Enum.TextXAlignment.Left
            label.Font = Enum.Font.SourceSans
            label.TextSize = 12
            
            local button = Instance.new("TextButton", row)
            button.Size = UDim2.new(0.4, 0, 1, 0)
            button.Position = UDim2.new(0.6, 0, 0, 0)
            button.BackgroundTransparency = 1 -- Transparent
            button.TextColor3 = Color3.fromRGB(255, 255, 255)
            button.Font = Enum.Font.SourceSansBold
            button.TextSize = 12
            
            local btnStroke = Instance.new("UIStroke", button)
            btnStroke.Color = Color3.fromRGB(0, 150, 255)
            btnStroke.Thickness = 1
            btnStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
            registerThemeElement(btnStroke, "Color", btnStroke.Color)
            
            local function updateButtonText()
                if Keybinds[keyId] then
                    button.Text = Keybinds[keyId].Name
                else
                    button.Text = "None"
                end
            end
            updateButtonText()
            
            local corner = Instance.new("UICorner", button)
            corner.CornerRadius = UDim.new(0, 5)
            
            UI.RegisterButtonEffect(button)
            
            button.MouseButton1Click:Connect(function()
                button.Text = "Press Key..."
                local connection
                connection = UserInputService.InputBegan:Connect(function(input)
                    if input.UserInputType == Enum.UserInputType.Keyboard then
                        if input.KeyCode == Enum.KeyCode.Backspace or input.KeyCode == Enum.KeyCode.Delete then
                            Keybinds[keyId] = nil
                        else
                            Keybinds[keyId] = input.KeyCode
                        end
                        updateButtonText()
                        saveUniversalKeybinds()
                        connection:Disconnect()
                    elseif input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
                         -- Cancel on click elsewhere
                         updateButtonText()
                         connection:Disconnect()
                    end
                end)
            end)
        end

        createKeybindRow("Terbang", "Fly")
        createKeybindRow("Invisible", "Invisible")
        createKeybindRow("Jalan Cepat", "WalkSpeed")
        createKeybindRow("Mulai Rekam", "Record")
        createKeybindRow("Stop Rekam", "StopRecord")

        local saveConfigButton = Instance.new("TextButton", pcControlFrame)
        saveConfigButton.Size = UDim2.new(1, -20, 0, 25)
        saveConfigButton.Position = UDim2.new(0, 10, 0, 0) -- LayoutOrder handles Y
        saveConfigButton.BackgroundTransparency = 1 -- Transparent
        saveConfigButton.Text = "Simpan Config Keybinds"
        saveConfigButton.TextColor3 = Color3.fromRGB(255, 255, 255)
        saveConfigButton.Font = Enum.Font.SourceSansBold
        saveConfigButton.TextSize = 12
        
        local saveBtnCorner = Instance.new("UICorner", saveConfigButton)
        saveBtnCorner.CornerRadius = UDim.new(0, 5)

        local saveBtnStroke = Instance.new("UIStroke", saveConfigButton)
        saveBtnStroke.Color = Color3.fromRGB(0, 150, 255)
        saveBtnStroke.Thickness = 1
        saveBtnStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
        registerThemeElement(saveBtnStroke, "Color", saveBtnStroke.Color)
        
        UI.RegisterButtonEffect(saveConfigButton)

        saveConfigButton.MouseButton1Click:Connect(function()
            saveUniversalKeybinds()
            showNotification("Konfigurasi Keybinds tersimpan!", Color3.fromRGB(50, 200, 50))
        end)

        -- [[ PENGUBAH WARNA UI BARU ]]
        local themeOptionsContainer = Instance.new("Frame", SettingsTabContent)
        themeOptionsContainer.Name = "ThemeOptionsContainer"
        themeOptionsContainer.Size = UDim2.new(1, 0, 0, 0)
        themeOptionsContainer.AutomaticSize = Enum.AutomaticSize.Y
        themeOptionsContainer.BackgroundTransparency = 1
        themeOptionsContainer.LayoutOrder = 10
        local themeOptionsLayout = Instance.new("UIListLayout", themeOptionsContainer)
        themeOptionsLayout.Padding = UDim.new(0, 2)
        themeOptionsLayout.SortOrder = Enum.SortOrder.LayoutOrder

        local isThemeOptionsVisible = false
        local themeHeader = Instance.new("TextButton", themeOptionsContainer)
        themeHeader.Size = UDim2.new(1, 0, 0, 25)
        themeHeader.BackgroundTransparency = 1
        themeHeader.Text = ""
        themeHeader.LayoutOrder = 1

        local themeTitle = Instance.new("TextLabel", themeHeader)
        themeTitle.Size = UDim2.new(1, -25, 1, 0)
        themeTitle.BackgroundTransparency = 1
        themeTitle.Font = Enum.Font.SourceSans
        themeTitle.TextSize = 12
        themeTitle.Text = "Ganti Warna UI"
        themeTitle.TextColor3 = Color3.fromRGB(255, 255, 255)
        themeTitle.TextXAlignment = Enum.TextXAlignment.Left

        local themeTriangle = Instance.new("TextLabel", themeHeader)
        themeTriangle.Size = UDim2.new(0, 20, 1, 0)
        themeTriangle.Position = UDim2.new(1, -20, 0, 0)
        themeTriangle.BackgroundTransparency = 1
        themeTriangle.Font = Enum.Font.SourceSansBold
        themeTriangle.TextSize = 16
        themeTriangle.Text = UI.Icons.Down
        themeTriangle.TextColor3 = Color3.fromRGB(255, 255, 255)
        themeTriangle.TextXAlignment = Enum.TextXAlignment.Right

        local themeControlsFrame = Instance.new("Frame", themeOptionsContainer)
        themeControlsFrame.Name = "ThemeControls"
        themeControlsFrame.Size = UDim2.new(1, 0, 0, 0)
        themeControlsFrame.AutomaticSize = Enum.AutomaticSize.Y
        themeControlsFrame.BackgroundTransparency = 1
        themeControlsFrame.Visible = false
        themeControlsFrame.LayoutOrder = 2
        local themeControlsLayout = Instance.new("UIListLayout", themeControlsFrame)
        themeControlsLayout.Padding = UDim.new(0, 5)
        local themeControlsPadding = Instance.new("UIPadding", themeControlsFrame)
        themeControlsPadding.PaddingLeft = UDim.new(0, 10)

        themeHeader.MouseButton1Click:Connect(function()
            isThemeOptionsVisible = not isThemeOptionsVisible
            themeControlsFrame.Visible = isThemeOptionsVisible
            themeTriangle.Text = isThemeOptionsVisible and UI.Icons.Up or UI.Icons.Down
        end)
        
        local themeToggleFrame, themeToggleSwitch, setThemeToggleState
        themeToggleFrame, themeToggleSwitch, setThemeToggleState = UI.createToggle(themeControlsFrame, "Aktifkan Warna HSV", UI.isThemeManagerActive == true, function(v)
            -- Patch v10: toggle ini benar-benar mengontrol apakah HSV diterapkan ke UI.
            -- OFF = UI kembali ke default role/non-theme. Slider hanya menyimpan preview/pending.
            if v then
                UI.isThemeManagerActive = true
                UI.currentThemeColor = UI._ArexansPendingThemeColor or UI.currentThemeColor or getRoleDefaultThemeColor()
                applyThemeColorNow(UI.currentThemeColor)
                refreshRoleGradientUI()
            else
                UI.isThemeManagerActive = false
                if UI._ArexansIsVIPRole() then
                    UI.currentThemeColor = getRoleDefaultThemeColor()
                    applyThemeColorNow(UI.currentThemeColor)
                else
                    if isGradientRole() then
                        UI.currentThemeColor = getRoleDefaultThemeColor()
                        UI._ArexansPendingThemeColor = UI._ArexansPendingThemeColor or UI.currentThemeColor
                        refreshRoleGradientUI()
                    else
                        UI.restoreDefaultTheme()
                    end
                end
                refreshRoleGradientUI()
            end
            saveFeatureStates()
        end)
        
        UI.createHSVColorPickerGroup(themeControlsFrame, (isGradientRole() and "HSV Warna Gradient (Lifetime)" or "HSV Warna UI"), UI._ArexansPendingThemeColor or UI.currentThemeColor or UI.defaultThemeColor or getRoleDefaultThemeColor(), function(newColor)
            -- Patch v10: saat toggle OFF, slider tidak mengubah UI. Warna hanya disimpan sebagai pending/preview.
            UI._ArexansPendingThemeColor = newColor
            if UI.isThemeManagerActive then
                UI.currentThemeColor = newColor
                UI.updateTheme(newColor)
                if UI._ArexansApplyThemeSweep and ScreenGui then
                    pcall(function() UI._ArexansApplyThemeSweep(ScreenGui, newColor) end)
                end
                refreshRoleGradientUI()
            end
            saveFeatureStates()
        end)
        -- [[ AKHIR PENGUBAH WARNA UI BARU ]]
        
        -- Container for Save/Reset UI
        local uiPosContainer = Instance.new("Frame", SettingsTabContent)
        uiPosContainer.Name = "UIPosContainer"
        uiPosContainer.Size = UDim2.new(1, 0, 0, 22)
        uiPosContainer.BackgroundTransparency = 1
        uiPosContainer.LayoutOrder = 11
        
        local uiPosLayout = Instance.new("UIListLayout", uiPosContainer)
        uiPosLayout.FillDirection = Enum.FillDirection.Horizontal
        uiPosLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
        uiPosLayout.VerticalAlignment = Enum.VerticalAlignment.Center
        uiPosLayout.Padding = UDim.new(0, 5)

        -- Simpan UI
        local saveUiBtn = UI.createButton(uiPosContainer, "Simpan UI", saveGuiPositions)
        saveUiBtn.Size = UDim2.new(0.5, -2, 1, 0) -- Adjust size to fit 2 buttons
        
        -- Reset UI
        local resetUiBtn = UI.createButton(uiPosContainer, "Reset UI", resetGuiPositions)
        resetUiBtn.Size = UDim2.new(0.5, -3, 1, 0) -- Adjust size to fit 2 buttons
        UI.createButton(SettingsTabContent, "Tutup", CloseScript).LayoutOrder = 14
        local logoutButton = UI.createButton(SettingsTabContent, "Logout", HandleLogout)
        logoutButton.LayoutOrder = 15
        logoutButton.BackgroundColor3 = Color3.fromRGB(200, 50, 50)
    end
    
    
    setupTeleportTab = function()
        -- Header
        local teleportHeaderFrame = Instance.new("Frame", TeleportTabContent)
        teleportHeaderFrame.Size = UDim2.new(1, 0, 0, 30)
        teleportHeaderFrame.BackgroundTransparency = 1
        teleportHeaderFrame.LayoutOrder = 0
    
        local teleportTitleLabel = Instance.new("TextLabel", teleportHeaderFrame)
        teleportTitleLabel.Name = "TeleportTitleLabel"
        teleportTitleLabel.Size = UDim2.new(1, -20, 1, 0)
        teleportTitleLabel.BackgroundTransparency = 1
        teleportTitleLabel.Text = "Lokasi Tersimpan"
        teleportTitleLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
        teleportTitleLabel.TextSize = 12
        teleportTitleLabel.TextXAlignment = Enum.TextXAlignment.Left
        teleportTitleLabel.Font = Enum.Font.SourceSansBold
    
        local settingsButton = Instance.new("TextButton", teleportHeaderFrame)
        settingsButton.Name = "SettingsButton"
        settingsButton.Size = UDim2.new(0, 22, 0, 22)
        settingsButton.Position = UDim2.new(1, -22, 0.5, -11)
        settingsButton.BackgroundTransparency = 1
        settingsButton.BorderSizePixel = 0
        settingsButton.Text = ""
        settingsButton.TextColor3 = Color3.fromRGB(200, 200, 200)
        settingsButton.TextSize = 18
        settingsButton.Font = Enum.Font.SourceSansBold
        pcall(function() settingsButton:SetAttribute("ArexansNoDeveloperGradient", true) end)
        if UI.applyIcon then UI.applyIcon(settingsButton, UI.Icons.Gear, Color3.fromRGB(200, 200, 200)) else settingsButton.Text = UI.Icons.Gear end
    
        -- Main Content Container (for the list)
        local TeleportListContainer = Instance.new("ScrollingFrame")
        TeleportListContainer.Name = "TeleportListContainer"
        TeleportListContainer.Size = UDim2.new(1, 0, 1, -30)
        TeleportListContainer.Position = UDim2.new(0, 0, 0, 30)
        TeleportListContainer.BackgroundTransparency = 1
        TeleportListContainer.Parent = TeleportTabContent
        TeleportListContainer.CanvasSize = UDim2.new(0, 0, 0, 0) 
        TeleportListContainer.ScrollBarThickness = 4
        TeleportListContainer.ScrollBarImageColor3 = Color3.fromRGB(0, 150, 255)
        registerThemeElement(TeleportListContainer, "ScrollBarImageColor3", TeleportListContainer.ScrollBarImageColor3)
        TeleportListContainer.ElasticBehavior = Enum.ElasticBehavior.Never
        TeleportListContainer.VerticalScrollBarInset = Enum.ScrollBarInset.Always
        TeleportListContainer.ScrollingDirection = Enum.ScrollingDirection.Y
        
        -- The layout for the list container must be separate from the main tab content layout
        local TeleportListLayoutInContainer = Instance.new("UIListLayout", TeleportListContainer)
        TeleportListLayoutInContainer.Padding = UDim.new(0, 2)
        TeleportListLayoutInContainer.SortOrder = Enum.SortOrder.LayoutOrder
        setupCanvasSize(TeleportListLayoutInContainer, TeleportListContainer)
        
        -- Settings Frame
        local TeleportSettingsFrame = Instance.new("ScrollingFrame", TeleportTabContent)
        TeleportSettingsFrame.Name = "TeleportSettingsFrame"
        TeleportSettingsFrame.Size = UDim2.new(1, 0, 1, -30)
        TeleportSettingsFrame.Position = UDim2.new(0, 0, 0, 30)
        TeleportSettingsFrame.BackgroundTransparency = 1
        TeleportSettingsFrame.Visible = false
        TeleportSettingsFrame.CanvasSize = UDim2.new(0, 0, 0, 0) 
        TeleportSettingsFrame.ScrollBarThickness = 4
        TeleportSettingsFrame.ScrollBarImageColor3 = Color3.fromRGB(0, 150, 255)
        registerThemeElement(TeleportSettingsFrame, "ScrollBarImageColor3", TeleportSettingsFrame.ScrollBarImageColor3)
        TeleportSettingsFrame.ElasticBehavior = Enum.ElasticBehavior.Never
        TeleportSettingsFrame.VerticalScrollBarInset = Enum.ScrollBarInset.Always
        TeleportSettingsFrame.ScrollingDirection = Enum.ScrollingDirection.Y

        local TeleportSettingsListLayout = Instance.new("UIListLayout", TeleportSettingsFrame)
        TeleportSettingsListLayout.Padding = UDim.new(0, 5)
        setupCanvasSize(TeleportSettingsListLayout, TeleportSettingsFrame)
    
        -- Toggle Logic
        settingsButton.MouseButton1Click:Connect(function()
            local isSettingsVisible = not TeleportSettingsFrame.Visible
            TeleportSettingsFrame.Visible = isSettingsVisible
            TeleportListContainer.Visible = not isSettingsVisible
            
            if isSettingsVisible then
                teleportTitleLabel.Text = "Pengaturan Teleport"
                if UI.applyIcon then UI.applyIcon(settingsButton, UI.Icons.Left, Color3.fromRGB(200, 200, 200)) else settingsButton.Text = UI.Icons.Left end
            else
                teleportTitleLabel.Text = "Lokasi Tersimpan"
                if UI.applyIcon then UI.applyIcon(settingsButton, UI.Icons.Gear, Color3.fromRGB(200, 200, 200)) else settingsButton.Text = UI.Icons.Gear end
            end
        end)

        -- Populate Settings Frame
        UI.createSlider(TeleportSettingsFrame, "Sensitivitas Kamera", 1, 10, Settings.SpectateCameraSensitivity / 0.001, "", 0.1, function(v)
            Settings.SpectateCameraSensitivity = v * 0.001
        end, saveFeatureStates)
        UI.createSlider(TeleportSettingsFrame, "Kecepatan Kamera", 1, 200, Settings.SpectateCameraSpeed, "", 1, function(v)
            Settings.SpectateCameraSpeed = v
        end, saveFeatureStates)
    
        -- Move Existing UI Creation into the TeleportListContainer
        
        -- Wadah utama untuk semua kontrol toolbar
        local mainToolbarContainer = Instance.new("Frame", TeleportListContainer) -- Parent changed to new container
        mainToolbarContainer.Name = "TeleportToolbarContainer"
        mainToolbarContainer.Size = UDim2.new(1, 0, 0, 60) -- Cukup tinggi untuk dua baris
        mainToolbarContainer.BackgroundTransparency = 1
        mainToolbarContainer.LayoutOrder = 1

        local mainToolbarLayout = Instance.new("UIListLayout", mainToolbarContainer)
        mainToolbarLayout.FillDirection = Enum.FillDirection.Vertical
        mainToolbarLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
        mainToolbarLayout.VerticalAlignment = Enum.VerticalAlignment.Top
        mainToolbarLayout.Padding = UDim.new(0, 4)

        -- Baris Pertama: Tombol [Impor] [Simpan] [Ekspor]
        local row1Frame = Instance.new("Frame", mainToolbarContainer)
        row1Frame.Name = "ToolbarRow1"
        row1Frame.Size = UDim2.new(1, 0, 0, 28)
        row1Frame.BackgroundTransparency = 1
        
        local row1Layout = Instance.new("UIListLayout", row1Frame)
        row1Layout.FillDirection = Enum.FillDirection.Horizontal
        row1Layout.VerticalAlignment = Enum.VerticalAlignment.Center
        row1Layout.HorizontalAlignment = Enum.HorizontalAlignment.Center -- Pusatkan item di baris ini
        row1Layout.Padding = UDim.new(0, 20) -- Beri jarak antar tombol

        -- Baris Kedua: [Textbox Radius] [Tombol Scan]
        local row2Frame = Instance.new("Frame", mainToolbarContainer)
        row2Frame.Name = "ToolbarRow2"
        row2Frame.Size = UDim2.new(1, 0, 0, 28)
        row2Frame.BackgroundTransparency = 1

        local row2Layout = Instance.new("UIListLayout", row2Frame)
        row2Layout.FillDirection = Enum.FillDirection.Horizontal
        row2Layout.VerticalAlignment = Enum.VerticalAlignment.Center
        row2Layout.HorizontalAlignment = Enum.HorizontalAlignment.Center -- Pusatkan item di baris ini juga
        row2Layout.Padding = UDim.new(0, 5)

        -- Helper for Toolbar Icon Buttons
        local function createToolbarButton(parent, icon, color, callback)
            local isAssetId = (UI.isAssetIcon and UI.isAssetIcon(icon)) or string.match(tostring(icon), "^%d+$") or string.match(tostring(icon), "^rbxassetid://")
            local btn
            if isAssetId then
                btn = Instance.new("ImageButton")
                btn.Image = (UI.toAssetIcon and UI.toAssetIcon(icon)) or (string.match(tostring(icon), "^rbxassetid://") and icon or "rbxassetid://" .. icon)
                btn.ImageColor3 = color
                btn.ScaleType = Enum.ScaleType.Fit
                local pad = Instance.new("UIPadding", btn)
                pad.PaddingTop = UDim.new(0,4); pad.PaddingBottom = UDim.new(0,4)
                pad.PaddingLeft = UDim.new(0,4); pad.PaddingRight = UDim.new(0,4)
            else
                btn = Instance.new("TextButton")
                btn.Text = icon
                btn.TextSize = 14
                btn.TextColor3 = color
                btn.Font = Enum.Font.SourceSansBold
            end
            
            btn.Size = UDim2.new(0, 24, 0, 24)
            btn.BackgroundTransparency = 1
            btn.BorderSizePixel = 0
            btn.Parent = parent
            
            local stroke = Instance.new("UIStroke", btn)
            stroke.Color = color
            stroke.Thickness = 1
            stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
            
            -- Check if it's blue-ish to apply theme
            if color.B > 0.5 and color.B > color.R and color.B > color.G then
                if isAssetId then
                    UI.registerThemeElement(btn, "ImageColor3", btn.ImageColor3)
                else
                    UI.registerThemeElement(btn, "TextColor3", btn.TextColor3)
                end
                UI.registerThemeElement(stroke, "Color", stroke.Color)
            end

            local corner = Instance.new("UICorner", btn)
            corner.CornerRadius = UDim.new(0, 5)
            
            btn.MouseButton1Click:Connect(callback)
            UI.RegisterButtonEffect(btn)
            return btn
        end

        local importButton = createToolbarButton(row1Frame, UI.Icons.ImportFile, Color3.fromRGB(50, 150, 200), function()
            UI.showImportPrompt(function(text)
                if not text or text == "" then return end
                local success, decodedData = pcall(HttpService.JSONDecode, HttpService, text)
                if not success or type(decodedData) ~= "table" then showNotification("Data impor tidak valid!", Color3.fromRGB(200, 50, 50)); return end
                local existingNames = {}; for _, loc in ipairs(savedTeleportLocations) do existingNames[loc.Name] = true end
                local importedCount = 0
                for _, data in ipairs(decodedData) do
                    if type(data) == "table" and data.Name and data.CFrameData and not existingNames[data.Name] then
                        local cframe = CFrame.new(unpack(data.CFrameData))
                        table.insert(savedTeleportLocations, { Name = data.Name, CFrame = cframe })
                        existingNames[data.Name] = true
                        importedCount = importedCount + 1
                    end
                end
                if importedCount > 0 then
                    table.sort(savedTeleportLocations, naturalCompare); saveTeleportData(); updateTeleportList()
                    showNotification(importedCount .. " lokasi berhasil diimpor!", Color3.fromRGB(50, 200, 50))
                else
                    showNotification("Tidak ada lokasi baru untuk diimpor.", Color3.fromRGB(200, 150, 50))
                end
            end)
        end)
        importButton.Name = "TeleportImportButton"
        if UI.applyIcon then UI.applyIcon(importButton, UI.Icons.ImportFile, Color3.fromRGB(50, 150, 200)) end

        local saveButton = createToolbarButton(row1Frame, UI.Icons.Location or UI.Icons.Pin, Color3.fromRGB(50, 180, 50), function()
            if LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("HumanoidRootPart") then
                local newName = "Kustom " .. (#savedTeleportLocations + 1)
                addTeleportLocation(newName, LocalPlayer.Character.HumanoidRootPart.CFrame)
                showNotification("Lokasi disimpan: " .. newName, Color3.fromRGB(50, 150, 255))
            end
        end)

        local exportButton = createToolbarButton(row1Frame, UI.Icons.ExportFile, Color3.fromRGB(50, 150, 200), function()
            if not setclipboard then showNotification("Executor tidak mendukung clipboard!", Color3.fromRGB(200, 50, 50)); return end
            local dataToExport = {}; for _, loc in ipairs(savedTeleportLocations) do table.insert(dataToExport, { Name = loc.Name, CFrameData = {loc.CFrame:GetComponents()} }) end
            local success, result = pcall(function() local jsonData = HttpService:JSONEncode(dataToExport); setclipboard(jsonData); showNotification("Data disalin ke clipboard!", Color3.fromRGB(50, 200, 50)) end)
            if not success then showNotification("Gagal mengekspor data!", Color3.fromRGB(200, 50, 50)) end
        end)
        exportButton.Name = "TeleportExportButton"
        if UI.applyIcon then UI.applyIcon(exportButton, UI.Icons.ExportFile, Color3.fromRGB(50, 150, 200)) end

        local radiusTextBox = Instance.new("TextBox", row2Frame)
        radiusTextBox.Size = UDim2.new(0, 80, 0, 24)
        radiusTextBox.BackgroundTransparency = 1
        radiusTextBox.TextColor3 = Color3.fromRGB(220, 220, 220)
        radiusTextBox.Text = "999999"; radiusTextBox.Font = Enum.Font.SourceSans
        radiusTextBox.TextSize = 12; radiusTextBox.ClearTextOnFocus = false
        radiusTextBox.TextXAlignment = Enum.TextXAlignment.Center
        
        local radStroke = Instance.new("UIStroke", radiusTextBox)
        radStroke.Color = Color3.fromRGB(0, 150, 255)
        radStroke.Thickness = 1
        radStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
        registerThemeElement(radStroke, "Color", radStroke.Color)
        
        local radCorner = Instance.new("UICorner", radiusTextBox); radCorner.CornerRadius = UDim.new(0, 4)
        radiusTextBox:GetPropertyChangedSignal("Text"):Connect(function() radiusTextBox.Text = radiusTextBox.Text:gsub("%D", "") end)

        local scanButton = createToolbarButton(row2Frame, UI.Icons.Satellite, Color3.fromRGB(255, 255, 255), function()
            local radius = tonumber(radiusTextBox.Text) or 999999
            local playerPos = LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("HumanoidRootPart") and LocalPlayer.Character.HumanoidRootPart.Position
            if not playerPos then showNotification("Karakter tidak ditemukan.", Color3.fromRGB(200, 50, 50)); return end
            
            showNotification("Memindai area radius " .. radius .. "m...", Color3.fromRGB(150, 150, 255))
            local foundCount = 0
            for _, part in pairs(Workspace:GetDescendants()) do
                if part:IsA("BasePart") and (part.Position - playerPos).Magnitude <= radius then
                    local nameLower = part.Name:lower()
                    if (nameLower:find("checkpoint") or nameLower:find("pos") or nameLower:find("finish") or nameLower:find("start") or nameLower:find("spawn")) and not Players:GetPlayerFromCharacter(part.Parent) then
                        addTeleportLocation(part.Name, part.CFrame)
                        foundCount = foundCount + 1
                    end
                end
            end
            showNotification("Pindai selesai: " .. foundCount .. " lokasi ditemukan & disimpan.", Color3.fromRGB(50, 200, 50))
        end)

        UI.createToggle(TeleportListContainer, "Tampilkan Ikon", areTeleportIconsVisible, function(v)
            areTeleportIconsVisible = v
            updateTeleportIconVisibility()
        end).LayoutOrder = 2

        local autoLoopSettingsFrame = Instance.new("Frame", TeleportListContainer)
        autoLoopSettingsFrame.Name, autoLoopSettingsFrame.Size, autoLoopSettingsFrame.BackgroundTransparency, autoLoopSettingsFrame.Visible, autoLoopSettingsFrame.LayoutOrder = "AutoLoopSettingsFrame", UDim2.new(1, 0, 0, 30), 1, false, 4
        local settingsLayout = Instance.new("UIListLayout", autoLoopSettingsFrame); settingsLayout.FillDirection, settingsLayout.VerticalAlignment, settingsLayout.Padding = Enum.FillDirection.Horizontal, Enum.VerticalAlignment.Center, UDim.new(0, 5)

        local function createCompactInput(parent, label, default)
            local frame = Instance.new("Frame", parent); frame.Size, frame.BackgroundTransparency = UDim2.new(0.4, -12, 1, 0), 1
            local layout = Instance.new("UIListLayout", frame); layout.FillDirection, layout.VerticalAlignment = Enum.FillDirection.Horizontal, Enum.VerticalAlignment.Center
            local textLabel = Instance.new("TextLabel", frame); textLabel.Size = UDim2.new(0, 15, 1, 0); textLabel.Text, textLabel.TextColor3, textLabel.TextSize, textLabel.Font, textLabel.BackgroundTransparency = label, Color3.fromRGB(200,200,200), 11, Enum.Font.SourceSans, 1
            local textBox = Instance.new("TextBox", frame); textBox.Size = UDim2.new(1, -15, 0, 20); textBox.Text, textBox.BackgroundTransparency = default, 1; textBox.TextColor3, textBox.TextSize, textBox.Font = Color3.fromRGB(255,255,255), 12, Enum.Font.SourceSans; Instance.new("UICorner", textBox).CornerRadius = UDim.new(0, 4); local ts = Instance.new("UIStroke", textBox); ts.Color = Color3.fromRGB(0, 150, 255); ts.Thickness = 1; ts.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
            registerThemeElement(ts, "Color", ts.Color)
            return textBox
        end

        local repeatInput = createCompactInput(autoLoopSettingsFrame, "U:", "5")
        local delayInput = createCompactInput(autoLoopSettingsFrame, "D:", "2")
        local isAutoLoopLocked = not hasPermission("Normal")
        local playStopButton = UI.createButton(autoLoopSettingsFrame, UI.Icons.PlayButton, function() end, isAutoLoopLocked, "Normal")
        playStopButton.Size, playStopButton.BackgroundColor3 = UDim2.new(0.2, 0, 0, 22), isAutoLoopLocked and Color3.fromRGB(20, 20, 20) or Color3.fromRGB(50, 180, 50)
        if not isAutoLoopLocked then
            UI.RegisterButtonEffect(playStopButton)
        end

        UI.createToggle(TeleportListContainer, "Auto Loop", false, function(isVisible) autoLoopSettingsFrame.Visible = isVisible end).LayoutOrder = 3

        playStopButton.MouseButton1Click:Connect(function()
            if isAutoLoopLocked then return end
            if isAutoLooping then
                isAutoLooping = false
                if playStopButton:IsA("ImageButton") then playStopButton.Image = "rbxassetid://" .. UI.Icons.PlayButton else playStopButton.Text = UI.Icons.PlayButton end
                playStopButton.BackgroundColor3 = Color3.fromRGB(50, 180, 50)
            else
                local repetitions, delayTime = tonumber(repeatInput.Text), tonumber(delayInput.Text)
                if not repetitions or repetitions <= 0 or not delayTime or delayTime < 0 then showNotification("Input jumlah & delay tidak valid.", Color3.fromRGB(200, 50, 50)); return end
                if #savedTeleportLocations == 0 then showNotification("Tidak ada lokasi teleport.", Color3.fromRGB(200, 50, 50)); return end
                isAutoLooping = true
                if playStopButton:IsA("ImageButton") then playStopButton.Image = "rbxassetid://" .. UI.Icons.StopSquare else playStopButton.Text = UI.Icons.StopSquare end
                playStopButton.BackgroundColor3 = Color3.fromRGB(200, 50, 50)
                task.spawn(function()
                    for i = 1, repetitions do
                        if not isAutoLooping then break end
                        for _, locData in ipairs(savedTeleportLocations) do
                            if not isAutoLooping then break end
                            if LocalPlayer.Character and LocalPlayer.Character.HumanoidRootPart then LocalPlayer.Character.HumanoidRootPart.CFrame = locData.CFrame * CFrame.new(0, 3, 0) else isAutoLooping = false; break end
                            task.wait(delayTime)
                        end
                    end
                    isAutoLooping = false;
                    if playStopButton:IsA("ImageButton") then playStopButton.Image = "rbxassetid://" .. UI.Icons.PlayButton else playStopButton.Text = UI.Icons.PlayButton end
                    playStopButton.BackgroundColor3 = Color3.fromRGB(50, 180, 50)
                end)
            end
        end)
    end
    
    local function makeUI(parent, class, props)
    local obj = Instance.new(class)
    for k, v in pairs(props) do
        if k ~= "Parent" then pcall(function() obj[k] = v end) end
    end
    obj.Parent = parent
    return obj
end




local function mp_canFolderIO()
    return mp_canFileIO()
        and type(isfolder)   == "function"
        and type(makefolder) == "function"
        and type(listfiles)  == "function"
end

local function mp_ensureMusicFolder()
    if not mp_canFolderIO() then return false end
    local ok, exists = pcall(isfolder, MP_MUSIC_FOLDER)
    if not ok or not exists then
        pcall(makefolder, MP_MUSIC_FOLDER)
    end
    return true
end

-- Resolves a local file path to a rbxasset:// URI via GetCustomAsset (preferred),
-- with fallbacks to getsynasset / getasset for older executors.
-- Supports both MP3 and OGG formats.
local function mp_resolveLocalAudio(path)
    if type(getcustomasset) == "function" then
        local ok, res = pcall(getcustomasset, path)
        if ok and res and res ~= "" then return res end
    end
    if type(getsynasset) == "function" then
        local ok, res = pcall(getsynasset, path)
        if ok and res and res ~= "" then return res end
    end
    if type(getasset) == "function" then
        local ok, res = pcall(getasset, path)
        if ok and res and res ~= "" then return res end
    end
    return nil
end

-- Validates file magic bytes to confirm the actual audio format.
local function mp_validateAudioFile(data, ext)
    if not data or #data < 4 then return false end
    local info = MP_AUDIO_EXTS[ext]
    if not info then return false end
    local header = data:sub(1, 4)
    if header:sub(1, #info.magic) == info.magic then return true end
    if info.alt and header:sub(1, #info.alt) == info.alt then return true end
    return false
end

-- Scans the Zero Music folder for MP3 and OGG files.
-- Uses getcustomasset() to resolve local paths into Sound.SoundId-compatible URIs.
local function mp_loadFolderSongs()
    if not mp_canFolderIO() then return {} end
    mp_ensureMusicFolder()
    local okL, files = pcall(listfiles, MP_MUSIC_FOLDER)
    if not okL or type(files) ~= "table" then return {} end

    local result = {}
    for _, path in ipairs(files) do
        local filename    = path:match("[^/\\]+$") or path
        local ext         = (filename:match("%.([^%.]+)$") or ""):lower()

        if MP_AUDIO_EXTS[ext] then
            local displayName = filename:match("^(.-)%.[^%.]+$") or filename
            local okD, data   = pcall(readfile, path)
            local canPlay     = mp_validateAudioFile(data, ext)
            local resolvedId  = nil

            if canPlay then
                -- GetCustomAsset converts the local path to a usable rbxasset:// URI
                resolvedId = mp_resolveLocalAudio(path)
            end

            table.insert(result, {
                Name    = canPlay
                            and displayName
                            or  (displayName .. " (corrupt/unsupported)"),
                Id      = resolvedId or "",
                Icon    = MP_ICON_SONG_FOLDER,
                IsFile  = true,
                RawPath = path,
                CanPlay = canPlay,
                FileExt = ext,
            })
        end
    end
    return result
end

local function rr(parent, x, y, w, h, col, rad, zi)
    local f = makeUI(parent, "Frame", {
        Position = UDim2.new(0, x, 0, y), Size = UDim2.new(0, w, 0, h),
        BackgroundColor3 = col, BorderSizePixel = 0, ZIndex = zi or 3
    })
    makeUI(f, "UICorner", { CornerRadius = UDim.new(0, rad or 1) })
    return f
end
local function clickLayer(parent, zi)
    return makeUI(parent, "TextButton", {
        Size = UDim2.new(1,0,1,0), BackgroundTransparency = 1, Text = "", ZIndex = zi or 20
    })
end
local function iconSkipBack(parent, S, color)
    local bsz = parent.Size.X.Offset
    local pad = math.floor((bsz - S) / 2)
    rr(parent, pad, pad, 2, S, color, 1, 3)
    local t1 = makeUI(parent, "Frame", {
        AnchorPoint = Vector2.new(0, 0.5), Position = UDim2.new(0, pad+4, 0, pad+S/2),
        Size = UDim2.new(0, S-5, 0, 2), BackgroundColor3 = color, BorderSizePixel = 0, Rotation = -35, ZIndex = 3
    })
    makeUI(t1, "UICorner", { CornerRadius = UDim.new(0, 1) })
    local t2 = makeUI(parent, "Frame", {
        AnchorPoint = Vector2.new(0, 0.5), Position = UDim2.new(0, pad+4, 0, pad+S/2),
        Size = UDim2.new(0, S-5, 0, 2), BackgroundColor3 = color, BorderSizePixel = 0, Rotation = 35, ZIndex = 3
    })
    makeUI(t2, "UICorner", { CornerRadius = UDim.new(0, 1) })
    rr(parent, pad+S-3, pad, 2, S, color, 1, 3)
end
local function iconSkipForward(parent, S, color)
    local bsz = parent.Size.X.Offset
    local pad = math.floor((bsz - S) / 2)
    rr(parent, pad+S-2, pad, 2, S, color, 1, 3)
    local t1 = makeUI(parent, "Frame", {
        AnchorPoint = Vector2.new(0, 0.5), Position = UDim2.new(0, pad, 0, pad+S/2),
        Size = UDim2.new(0, S-5, 0, 2), BackgroundColor3 = color, BorderSizePixel = 0, Rotation = 35, ZIndex = 3
    })
    makeUI(t1, "UICorner", { CornerRadius = UDim.new(0, 1) })
    local t2 = makeUI(parent, "Frame", {
        AnchorPoint = Vector2.new(0, 0.5), Position = UDim2.new(0, pad, 0, pad+S/2),
        Size = UDim2.new(0, S-5, 0, 2), BackgroundColor3 = color, BorderSizePixel = 0, Rotation = -35, ZIndex = 3
    })
    makeUI(t2, "UICorner", { CornerRadius = UDim.new(0, 1) })
    rr(parent, pad, pad, 2, S, color, 1, 3)
end
local function iconPlay(parent, S, color, bsz)
    bsz = bsz or parent.Size.X.Offset
    local cx = math.floor(bsz/2) + 1
    local cy = math.floor(bsz/2)
    local half = math.floor(S/2)
    rr(parent, cx-half, cy-half, 2, S, color, 1, 3)
    local t1 = makeUI(parent, "Frame", {
        AnchorPoint = Vector2.new(0, 1), Position = UDim2.new(0, cx-half, 0, cy),
        Size = UDim2.new(0, S-1, 0, 2), BackgroundColor3 = color, BorderSizePixel = 0, Rotation = -30, ZIndex = 3
    })
    makeUI(t1, "UICorner", { CornerRadius = UDim.new(0, 1) })
    local t2 = makeUI(parent, "Frame", {
        AnchorPoint = Vector2.new(0, 0), Position = UDim2.new(0, cx-half, 0, cy),
        Size = UDim2.new(0, S-1, 0, 2), BackgroundColor3 = color, BorderSizePixel = 0, Rotation = 30, ZIndex = 3
    })
    makeUI(t2, "UICorner", { CornerRadius = UDim.new(0, 1) })
end
local function iconPause(parent, S, color, bsz)
    bsz = bsz or parent.Size.X.Offset
    local barW = 3
    local gap = math.floor(S * 0.38)
    local totalW = barW*2 + gap
    local startX = math.floor((bsz - totalW) / 2)
    local startY = math.floor((bsz - S) / 2)
    rr(parent, startX, startY, barW, S, color, 1, 3)
    rr(parent, startX+barW+gap, startY, barW, S, color, 1, 3)
end

function createMusicPlayerPage()
    local MP_ICON_SONG   = "rbxthumb://type=Asset&id=13780950281&w=150&h=150"
    local MP_ICON_VOL    = "rbxthumb://type=Asset&id=117386765962827&w=150&h=150"
    local MP_ICON_MUTE   = "rbxthumb://type=Asset&id=96383895319411&w=150&h=150"
    task.spawn(function()
        local ContentProvider = game:GetService("ContentProvider")
        local preloadInstances = {}
        for _, url in ipairs({ MP_ICON_SONG, MP_ICON_VOL, MP_ICON_MUTE }) do
            local img = Instance.new("ImageLabel")
            img.Image = url
            table.insert(preloadInstances, img)
        end
        pcall(function()
            ContentProvider:PreloadAsync(preloadInstances)
        end)
        for _, img in ipairs(preloadInstances) do img:Destroy() end
    end)

    local DEFAULT_SONGS = {
        { Name = "The Death Glasses",      Id = "rbxassetid://111189764768935", Icon = MP_ICON_SONG },
        { Name = "Losing You",             Id = "rbxassetid://99597515538931",  Icon = MP_ICON_SONG },
        { Name = "Last Tuesday",           Id = "rbxassetid://88204325031714",  Icon = MP_ICON_SONG },
        { Name = "Missing Love",           Id = "rbxassetid://73889409537043",  Icon = MP_ICON_SONG },
        { Name = "Forgot My Name",         Id = "rbxassetid://96944250631515",  Icon = MP_ICON_SONG },
        { Name = "I Stayed Feeling",       Id = "rbxassetid://128245292391041", Icon = MP_ICON_SONG },
        { Name = "Another Song About You", Id = "rbxassetid://124894144431579", Icon = MP_ICON_SONG },
        { Name = "Three Hearts Breaking",  Id = "rbxassetid://76618664260545",  Icon = MP_ICON_SONG },
        { Name = "輝く瞬間 ((Kagayaku Shunkan))",               Id = "rbxassetid://113287483392873", Icon = MP_ICON_SONG },
        { Name = "ビーチサイド・サマーラブ", Id = "rbxassetid://91639046717047",  Icon = MP_ICON_SONG },
    }
    local DEFAULT_COUNT = #DEFAULT_SONGS
    local songs = {}
    for _, s in ipairs(DEFAULT_SONGS) do table.insert(songs, s) end
    for _, s in ipairs(mp_loadCustomSongs()) do table.insert(songs, s) end

    local sound = Instance.new("Sound")
    sound.Name = "ZeroMusicPlayer"
    sound.Volume = 0.5
    sound.Parent = LocalPlayer.Character or LocalPlayer
    LocalPlayer.CharacterAdded:Connect(function(char) sound.Parent = char end)

    local currentSongIndex = 1
    local isPlaying = false
    local isMuted = false
    local savedVolume = 0.5

    local headerLbl = makeUI(VipTabContent, "Frame", {
        Size = UDim2.new(0.95, 0, 0, 22),
        BackgroundTransparency = 1, BorderSizePixel = 0
    })
    makeUI(headerLbl, "TextLabel", {
        Text = "Music Player",
        Font = Enum.Font.GothamBold,
        TextColor3 = Color3.fromRGB(200, 200, 200), TextSize = 12,
        BackgroundTransparency = 1,
        Size = UDim2.new(1, 0, 1, 0),
        TextXAlignment = Enum.TextXAlignment.Center
    })

    local VIZ_COUNT  = 12
    local VIZ_BAR_W  = 3
    local VIZ_GAP    = 2
    local VIZ_MAX_H  = 18
    local VIZ_MIN_H  = 2
    local VIZ_COL_ON  = Color3.fromRGB(210, 210, 210)
    local VIZ_COL_OFF = Color3.fromRGB(60, 60, 60)

    local songInfoFrame = makeUI(VipTabContent, "Frame", {
        Size = UDim2.new(0.95, 0, 0, 50),
        BackgroundColor3 = Color3.fromRGB(40, 40, 40),
        BackgroundTransparency = 0.2, BorderSizePixel = 0
    })
    makeUI(songInfoFrame, "UICorner", { CornerRadius = UDim.new(0, 8) })
    makeUI(songInfoFrame, "TextLabel", {
        Size = UDim2.new(1, -10, 0, 14), Position = UDim2.new(0, 8, 0, 4),
        BackgroundTransparency = 1, Text = "NOW PLAYING",
        TextColor3 = Color3.fromRGB(160, 160, 160), TextSize = 9,
        Font = Enum.Font.GothamBold, TextXAlignment = Enum.TextXAlignment.Left
    })
    local vizTotalW = VIZ_COUNT * VIZ_BAR_W + (VIZ_COUNT - 1) * VIZ_GAP + 8
    local songNameLabel = makeUI(songInfoFrame, "TextLabel", {
        Size = UDim2.new(1, -(vizTotalW + 16), 0, 20),
        Position = UDim2.new(0, 8, 0, 24),
        BackgroundTransparency = 1, Text = "Select a song",
        TextColor3 = Color3.fromRGB(255, 255, 255), TextSize = 12,
        Font = Enum.Font.GothamBold, TextXAlignment = Enum.TextXAlignment.Left,
        TextTruncate = Enum.TextTruncate.AtEnd
    })

    local vizFrame = makeUI(songInfoFrame, "Frame", {
        Size = UDim2.new(0, VIZ_COUNT * VIZ_BAR_W + (VIZ_COUNT - 1) * VIZ_GAP, 0, VIZ_MAX_H),
        AnchorPoint = Vector2.new(1, 0.5),
        Position = UDim2.new(1, -8, 0.5, 8),
        BackgroundTransparency = 1, ClipsDescendants = false
    })
    local vizBars = {}
    local vizTargetH = {}
    local vizPhase = 0
    for i = 1, VIZ_COUNT do
        vizTargetH[i] = VIZ_MIN_H
        local xPos = (i-1)*(VIZ_BAR_W+VIZ_GAP)
        local bar = makeUI(vizFrame, "Frame", {
            Size = UDim2.new(0, VIZ_BAR_W, 0, VIZ_MIN_H),
            Position = UDim2.new(0, xPos, 1, -VIZ_MIN_H),
            AnchorPoint = Vector2.new(0, 1),
            BackgroundColor3 = VIZ_COL_OFF, BorderSizePixel = 0, ZIndex = 3
        })
        makeUI(bar, "UICorner", { CornerRadius = UDim.new(0, 1) })
        vizBars[i] = bar
    end
    local function updateViz(playing, vol)
        for i = 1, VIZ_COUNT do
            local targetH, targetCol
            if playing and vol > 0 then
                local wave = math.sin(vizPhase + i * 0.7) * 0.5 + 0.5
                targetH = math.max(VIZ_MIN_H, math.floor(VIZ_MIN_H + wave * (VIZ_MAX_H - VIZ_MIN_H) * vol))
                targetCol = VIZ_COL_ON
            else
                targetH = VIZ_MIN_H
                targetCol = VIZ_COL_OFF
            end
            vizTargetH[i] = targetH
            local cur = vizBars[i].Size.Y.Offset
            local new = cur + (targetH - cur) * 0.3
            vizBars[i].Size = UDim2.new(0, VIZ_BAR_W, 0, math.max(VIZ_MIN_H, new))
            vizBars[i].Position = UDim2.new(0, (i-1)*(VIZ_BAR_W+VIZ_GAP), 1, -math.max(VIZ_MIN_H, new))
            vizBars[i].BackgroundColor3 = targetCol
        end
    end

    local function formatTime(s)
        if not s or s < 0 then return "0:00" end
        return string.format("%d:%02d", math.floor(s/60), math.floor(s%60))
    end

    local progressOuter = makeUI(VipTabContent, "Frame", {
        Size = UDim2.new(0.95, 0, 0, 6),
        BackgroundColor3 = Color3.fromRGB(55, 55, 55), BorderSizePixel = 0, ZIndex = 2
    })
    makeUI(progressOuter, "UICorner", { CornerRadius = UDim.new(1, 0) })
    local progressBar = makeUI(progressOuter, "Frame", {
        Size = UDim2.new(0, 0, 1, 0),
        BackgroundColor3 = Color3.fromRGB(130, 130, 130), BorderSizePixel = 0, ZIndex = 3
    })
    makeUI(progressBar, "UICorner", { CornerRadius = UDim.new(1, 0) })
    local progressThumb = makeUI(progressOuter, "Frame", {
        Size = UDim2.new(0, 10, 0, 10),
        AnchorPoint = Vector2.new(0.5, 0.5),
        Position = UDim2.new(0, 0, 0.5, 0),
        BackgroundColor3 = Color3.fromRGB(220, 220, 220),
        BorderSizePixel = 0, ZIndex = 5, Visible = false
    })
    makeUI(progressThumb, "UICorner", { CornerRadius = UDim.new(1, 0) })
    local progressHit = makeUI(progressOuter, "TextButton", {
        Size = UDim2.new(1, 0, 0, 20),
        Position = UDim2.new(0, 0, 0.5, -10),
        BackgroundTransparency = 1, Text = "", ZIndex = 10
    })
    local isScrubbing = false
    local function getSeekRatio(inputPos)
        local outerPos  = progressOuter.AbsolutePosition
        local outerSize = progressOuter.AbsoluteSize
        local ratio = (inputPos.X - outerPos.X) / outerSize.X
        return math.clamp(ratio, 0, 1)
    end

    local timeRow = makeUI(VipTabContent, "Frame", {
        Size = UDim2.new(0.95, 0, 0, 12), BackgroundTransparency = 1, BorderSizePixel = 0
    })
    local currentTimeLabel = makeUI(timeRow, "TextLabel", {
        Size = UDim2.new(0.5, 0, 1, 0), BackgroundTransparency = 1, Text = "0:00",
        TextColor3 = Color3.fromRGB(150,150,150), TextSize = 10,
        Font = Enum.Font.Gotham, TextXAlignment = Enum.TextXAlignment.Left
    })
    local totalTimeLabel = makeUI(timeRow, "TextLabel", {
        Size = UDim2.new(0.5, 0, 1, 0), Position = UDim2.new(0.5, 0, 0, 0),
        BackgroundTransparency = 1, Text = "0:00",
        TextColor3 = Color3.fromRGB(150,150,150), TextSize = 10,
        Font = Enum.Font.Gotham, TextXAlignment = Enum.TextXAlignment.Right
    })

    local function seekTo(ratio)
        if sound.IsLoaded and sound.TimeLength and sound.TimeLength > 0 then
            sound.TimePosition = ratio * sound.TimeLength
            progressBar.Size = UDim2.new(ratio, 0, 1, 0)
            progressThumb.Position = UDim2.new(ratio, 0, 0.5, 0)
            currentTimeLabel.Text = formatTime(ratio * sound.TimeLength)
        end
    end

    progressHit.MouseEnter:Connect(function()
        progressThumb.Visible = true
        TweenService:Create(progressOuter, TweenInfo.new(0.1), { Size = UDim2.new(0.95, 0, 0, 8) }):Play()
        TweenService:Create(progressBar, TweenInfo.new(0.1), { BackgroundColor3 = Color3.fromRGB(180, 180, 180) }):Play()
    end)
    progressHit.MouseLeave:Connect(function()
        if not isScrubbing then
            progressThumb.Visible = false
            TweenService:Create(progressOuter, TweenInfo.new(0.1), { Size = UDim2.new(0.95, 0, 0, 6) }):Play()
            TweenService:Create(progressBar, TweenInfo.new(0.1), { BackgroundColor3 = Color3.fromRGB(130, 130, 130) }):Play()
        end
    end)
    progressHit.InputBegan:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            isScrubbing = true; progressThumb.Visible = true; seekTo(getSeekRatio(input.Position))
        end
    end)
    UserInputService.InputChanged:Connect(function(input)
        if isScrubbing and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
            seekTo(getSeekRatio(input.Position))
        end
    end)
    UserInputService.InputEnded:Connect(function(input)
        if isScrubbing and (input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch) then
            isScrubbing = false
            seekTo(getSeekRatio(input.Position))
            progressThumb.Visible = false
            TweenService:Create(progressOuter, TweenInfo.new(0.1), { Size = UDim2.new(0.95, 0, 0, 6) }):Play()
            TweenService:Create(progressBar, TweenInfo.new(0.1), { BackgroundColor3 = Color3.fromRGB(130, 130, 130) }):Play()
        end
    end)

    local BTN_SM = 34; local BTN_LG = 44
    local ICON_SM = 14; local ICON_LG = 16
    local controlRow = makeUI(VipTabContent, "Frame", {
        Size = UDim2.new(0.95, 0, 0, 52), BackgroundTransparency = 1, BorderSizePixel = 0
    })
    local prevFrame = makeUI(controlRow, "Frame", {
        Size = UDim2.new(0, BTN_SM, 0, BTN_SM),
        Position = UDim2.new(0.5, -BTN_LG/2-BTN_SM-8, 0.5, -BTN_SM/2),
        BackgroundColor3 = Color3.fromRGB(48,48,48), BorderSizePixel = 0
    })
    makeUI(prevFrame, "UICorner", { CornerRadius = UDim.new(1,0) })
    makeUI(prevFrame, "UIStroke", { Color = Color3.fromRGB(80,80,80), Thickness = 1, Transparency = 0.2 })
    iconSkipBack(prevFrame, ICON_SM, IC)
    local prevClick = clickLayer(prevFrame, 20)
    local playFrame = makeUI(controlRow, "Frame", {
        Size = UDim2.new(0, BTN_LG, 0, BTN_LG),
        Position = UDim2.new(0.5, -BTN_LG/2, 0.5, -BTN_LG/2),
        BackgroundColor3 = Color3.fromRGB(55,55,55), BorderSizePixel = 0
    })
    makeUI(playFrame, "UICorner", { CornerRadius = UDim.new(1,0) })
    makeUI(playFrame, "UIStroke", { Color = Color3.fromRGB(100,100,100), Thickness = 1.2, Transparency = 0.1 })
    local playIconHolder = makeUI(playFrame, "Frame", { Size = UDim2.new(1,0,1,0), BackgroundTransparency = 1, ZIndex = 2 })
    iconPlay(playIconHolder, ICON_LG, IC, BTN_LG)
    local pauseIconHolder = makeUI(playFrame, "Frame", { Size = UDim2.new(1,0,1,0), BackgroundTransparency = 1, ZIndex = 2, Visible = false })
    iconPause(pauseIconHolder, ICON_LG, IC, BTN_LG)
    local playClick = clickLayer(playFrame, 20)
    local nextFrame = makeUI(controlRow, "Frame", {
        Size = UDim2.new(0, BTN_SM, 0, BTN_SM),
        Position = UDim2.new(0.5, BTN_LG/2+8, 0.5, -BTN_SM/2),
        BackgroundColor3 = Color3.fromRGB(48,48,48), BorderSizePixel = 0
    })
    makeUI(nextFrame, "UICorner", { CornerRadius = UDim.new(1,0) })
    makeUI(nextFrame, "UIStroke", { Color = Color3.fromRGB(80,80,80), Thickness = 1, Transparency = 0.2 })
    iconSkipForward(nextFrame, ICON_SM, IC)
    local nextClick = clickLayer(nextFrame, 20)

    local function setPlayState(playing)
        playIconHolder.Visible = not playing
        pauseIconHolder.Visible = playing
    end
    local function hoverSM(f, e)
        TweenService:Create(f, TweenInfo.new(0.12), { BackgroundColor3 = e and Color3.fromRGB(68,68,68) or Color3.fromRGB(48,48,48) }):Play()
    end
    local function hoverLG(e)
        TweenService:Create(playFrame, TweenInfo.new(0.12), { BackgroundColor3 = e and Color3.fromRGB(75,75,75) or Color3.fromRGB(55,55,55) }):Play()
    end
    prevClick.MouseEnter:Connect(function() hoverSM(prevFrame, true) end)
    prevClick.MouseLeave:Connect(function() hoverSM(prevFrame, false) end)
    nextClick.MouseEnter:Connect(function() hoverSM(nextFrame, true) end)
    nextClick.MouseLeave:Connect(function() hoverSM(nextFrame, false) end)
    playClick.MouseEnter:Connect(function() hoverLG(true) end)
    playClick.MouseLeave:Connect(function() hoverLG(false) end)

    local BAR_W = 4; local BAR_GAP = 2; local BAR_MAX_H = 26; local BAR_MIN_H = 3; local BAR_COUNT = 31
    local VOL_COL_ON = Color3.fromRGB(200, 200, 200); local VOL_COL_OFF = Color3.fromRGB(55, 55, 55)
    local volRow = makeUI(VipTabContent, "Frame", {
        Size = UDim2.new(0.95, 0, 0, 38), BackgroundTransparency = 1, BorderSizePixel = 0
    })
    local volIconBtn = makeUI(volRow, "ImageButton", {
        Size = UDim2.new(0, 22, 0, 22),
        Position = UDim2.new(0, 0, 0.5, -11),
        BackgroundTransparency = 1,
        Image = MP_ICON_VOL,
        ZIndex = 2
    })
    local volPercent = makeUI(volRow, "TextLabel", {
        Size = UDim2.new(0, 34, 1, 0),
        Position = UDim2.new(1, -34, 0, 0),
        BackgroundTransparency = 1, Text = "50%",
        TextColor3 = Color3.fromRGB(160, 160, 160), TextSize = 10,
        Font = Enum.Font.Gotham, TextXAlignment = Enum.TextXAlignment.Right
    })
    local vizContainer = makeUI(volRow, "Frame", {
        Size = UDim2.new(1, -60, 0, BAR_MAX_H),
        Position = UDim2.new(0, 26, 1, -BAR_MAX_H),
        BackgroundTransparency = 1, BorderSizePixel = 0, ClipsDescendants = false
    })
    local bars = {}
    local barTargetH = {}
    for i = 1, BAR_COUNT do
        barTargetH[i] = BAR_MIN_H
        local xPos = (i - 1) * (BAR_W + BAR_GAP)
        local bar = makeUI(vizContainer, "Frame", {
            Size = UDim2.new(0, BAR_W, 0, BAR_MIN_H),
            Position = UDim2.new(0, xPos, 1, -BAR_MIN_H),
            AnchorPoint = Vector2.new(0, 1),
            BackgroundColor3 = VOL_COL_OFF, BorderSizePixel = 0, ZIndex = 2
        })
        makeUI(bar, "UICorner", { CornerRadius = UDim.new(0, 2) })
        bars[i] = bar
    end
    local volHit = makeUI(volRow, "TextButton", {
        Size = UDim2.new(1, -60, 1, 0),
        Position = UDim2.new(0, 26, 0, 0),
        BackgroundTransparency = 1, Text = "", ZIndex = 10
    })
    local animPhase = 0
    local function updateVolBars(vol, phase, animate)
        local activeCount = math.floor(vol * BAR_COUNT + 0.5)
        for i = 1, BAR_COUNT do
            local active = (i <= activeCount)
            local targetH
            if active and animate then
                local wave = math.sin(phase + i * 0.6) * 0.5 + 0.5
                targetH = math.floor(BAR_MIN_H + wave * (BAR_MAX_H - BAR_MIN_H))
            elseif active then
                local t = (i / BAR_COUNT)
                targetH = math.floor(BAR_MIN_H + t * (BAR_MAX_H - BAR_MIN_H - 4))
            else
                targetH = BAR_MIN_H
            end
            barTargetH[i] = targetH
            bars[i].BackgroundColor3 = active and VOL_COL_ON or VOL_COL_OFF
        end
    end

    local volDragging = false
    local function setVolume(vol)
        vol = math.clamp(vol, 0, 1)
        sound.Volume = vol
        if not isMuted then savedVolume = vol end
        volPercent.Text = math.floor(vol * 100) .. "%"
    end
    local function volFromInput(input)
        local rel = math.clamp((input.Position.X - vizContainer.AbsolutePosition.X) / vizContainer.AbsoluteSize.X, 0, 1)
        setVolume(rel)
    end
    volHit.InputBegan:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            volDragging = true; volFromInput(input)
        end
    end)
    UserInputService.InputChanged:Connect(function(input)
        if volDragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
            volFromInput(input)
        end
    end)
    UserInputService.InputEnded:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            volDragging = false
        end
    end)
    volIconBtn.MouseButton1Click:Connect(function()
        isMuted = not isMuted
        if isMuted then
            savedVolume = sound.Volume > 0 and sound.Volume or savedVolume
            sound.Volume = 0
            volIconBtn.Image = MP_ICON_MUTE
            volPercent.Text = "0%"
        else
            setVolume(savedVolume)
            volIconBtn.Image = MP_ICON_VOL
        end
    end)

    local playlistDD = createPlaylistDropdown(songs, DEFAULT_COUNT, {
        onSelect = function(idx, song)
            currentSongIndex = idx
            songNameLabel.Text = song.Name
            sound:Stop()
            sound.SoundId = song.Id
            task.wait(0.05)
            sound:Play()
            isPlaying = true
            setPlayState(true)
        end,
        onDelete = function(idx)
            table.remove(songs, idx)
            if currentSongIndex >= idx and currentSongIndex > 1 then
                currentSongIndex = currentSongIndex - 1
            end
            mp_saveCustomSongs(songs, DEFAULT_COUNT)
            playlistDD.rebuild(songs, DEFAULT_COUNT, playlistDD._cbs)
        end,
    })
    playlistDD._cbs = playlistDD._cbs or {}

    local dropIconImg  = playlistDD.iconImg
    local dropLabel    = playlistDD.nameLabel

    local function rebuildDropdown()
        playlistDD.rebuild(songs, DEFAULT_COUNT, {
            onSelect = function(idx, song)
                currentSongIndex = idx
                songNameLabel.Text = song.Name
                sound:Stop()
                sound.SoundId = song.Id
                task.wait(0.05)
                sound:Play()
                isPlaying = true
                setPlayState(true)
            end,
            onDelete = function(idx)
                table.remove(songs, idx)
                if currentSongIndex >= idx and currentSongIndex > 1 then
                    currentSongIndex = currentSongIndex - 1
                end
                mp_saveCustomSongs(songs, DEFAULT_COUNT)
                rebuildDropdown()
            end,
        })
    end

    local folderLabelRow = makeUI(VipTabContent, "Frame", {
        Size = UDim2.new(0.95, 0, 0, 14), BackgroundTransparency = 1, BorderSizePixel = 0
    })
    makeUI(folderLabelRow, "TextLabel", {
        Size = UDim2.new(1, 0, 1, 0), BackgroundTransparency = 1,
        Text = "ZERO MUSIC FOLDER",
        Font = Enum.Font.GothamBold, TextColor3 = Color3.fromRGB(150, 150, 150),
        TextSize = 10, TextXAlignment = Enum.TextXAlignment.Left
    })
    local folderFrame = makeUI(VipTabContent, "Frame", {
        Size = UDim2.new(0.95, 0, 0, 58),
        BackgroundColor3 = Color3.fromRGB(40, 40, 40),
        BackgroundTransparency = 0.2, BorderSizePixel = 0
    })
    makeUI(folderFrame, "UICorner", { CornerRadius = UDim.new(0, 8) })
    makeUI(folderFrame, "UIStroke", { Color = Color3.fromRGB(70, 70, 70), Thickness = 1, Transparency = 0.4 })
    makeUI(folderFrame, "TextLabel", {
        Size = UDim2.new(1, -12, 0, 18), Position = UDim2.new(0, 8, 0, 4),
        BackgroundTransparency = 1,
        Text = "Place .mp3 / .ogg files in:  Zero Music/",
        Font = Enum.Font.Gotham, TextColor3 = Color3.fromRGB(160, 160, 160),
        TextSize = 9, TextXAlignment = Enum.TextXAlignment.Left,
        TextTruncate = Enum.TextTruncate.AtEnd, ZIndex = 3
    })
    local scanBtn = makeUI(folderFrame, "TextButton", {
        Size = UDim2.new(0, 100, 0, 22), Position = UDim2.new(0, 6, 0, 28),
        BackgroundColor3 = Color3.fromRGB(60, 60, 60), BorderSizePixel = 0,
        Text = "Scan", Font = Enum.Font.GothamBold,
        TextColor3 = Color3.fromRGB(255, 255, 255), TextSize = 9, ZIndex = 4,
        AutoButtonColor = false
    })
    makeUI(scanBtn, "UICorner", { CornerRadius = UDim.new(0, 5) })
    local folderStatusLabel = makeUI(folderFrame, "TextLabel", {
        Size = UDim2.new(1, -120, 0, 22), Position = UDim2.new(0, 112, 0, 28),
        BackgroundTransparency = 1,
        Text = mp_canFolderIO() and "Ready (MP3 + OGG)" or "File IO not supported",
        Font = Enum.Font.Gotham,
        TextColor3 = mp_canFolderIO() and Color3.fromRGB(100, 200, 120) or Color3.fromRGB(220, 120, 80),
        TextSize = 9, TextXAlignment = Enum.TextXAlignment.Left, ZIndex = 4,
        TextTruncate = Enum.TextTruncate.AtEnd
    })
    local scanBtnTween = nil
    local scanBtnHovered = false
    local function setScanColor(color)
        if scanBtnTween then scanBtnTween:Cancel() end
        scanBtnTween = TweenService:Create(scanBtn, TweenInfo.new(0.1), { BackgroundColor3 = color })
        scanBtnTween:Play()
    end
    scanBtn.MouseEnter:Connect(function()
        scanBtnHovered = true
        setScanColor(Color3.fromRGB(30, 80, 30))
    end)
    scanBtn.MouseLeave:Connect(function()
        scanBtnHovered = false
        setScanColor(Color3.fromRGB(60, 60, 60))
    end)
    scanBtn.MouseButton1Down:Connect(function()
        setScanColor(scanBtnHovered and Color3.fromRGB(30, 80, 30) or Color3.fromRGB(60, 60, 60))
    end)
    scanBtn.MouseButton1Up:Connect(function()
        setScanColor(scanBtnHovered and Color3.fromRGB(30, 80, 30) or Color3.fromRGB(60, 60, 60))
    end)
    scanBtn.MouseButton1Click:Connect(function()
        if not mp_canFolderIO() then
            folderStatusLabel.Text = "File IO not supported"
            folderStatusLabel.TextColor3 = Color3.fromRGB(220, 120, 80)
            return
        end
        folderStatusLabel.Text = "Scanning OGG..."
        folderStatusLabel.TextColor3 = Color3.fromRGB(200, 200, 100)
        task.spawn(function()
            local newSongs = {}
            for _, s in ipairs(songs) do
                if not s.IsFile then table.insert(newSongs, s) end
            end
            local folderSongs = mp_loadFolderSongs()
            for _, s in ipairs(folderSongs) do table.insert(newSongs, s) end
            while #songs > 0 do table.remove(songs) end
            for _, s in ipairs(newSongs) do table.insert(songs, s) end
            rebuildDropdown()
            local count = #folderSongs
            if count == 0 then
                folderStatusLabel.Text = "No MP3 or OGG files found in folder"
                folderStatusLabel.TextColor3 = Color3.fromRGB(200, 160, 60)
            else
                folderStatusLabel.Text = count .. " audio file(s) found (MP3/OGG)!"
                folderStatusLabel.TextColor3 = Color3.fromRGB(100, 220, 120)
            end
            task.delay(4, function()
                if folderStatusLabel then
                    folderStatusLabel.Text = "Ready (MP3 + OGG)"
                    folderStatusLabel.TextColor3 = Color3.fromRGB(100, 200, 120)
                end
            end)
        end)
    end)

    local addLabelRow = makeUI(VipTabContent, "Frame", {
        Size = UDim2.new(0.95, 0, 0, 14), BackgroundTransparency = 1, BorderSizePixel = 0
    })
    makeUI(addLabelRow, "TextLabel", {
        Size = UDim2.new(1, 0, 1, 0), BackgroundTransparency = 1, Text = "ADD SONG",
        Font = Enum.Font.GothamBold, TextColor3 = Color3.fromRGB(150,150,150),
        TextSize = 10, TextXAlignment = Enum.TextXAlignment.Left
    })
    local addFrame = makeUI(VipTabContent, "Frame", {
        Size = UDim2.new(0.95, 0, 0, 72),
        BackgroundColor3 = Color3.fromRGB(40, 40, 40),
        BackgroundTransparency = 0.2, BorderSizePixel = 0
    })
    makeUI(addFrame, "UICorner", { CornerRadius = UDim.new(0, 8) })
    makeUI(addFrame, "UIStroke", { Color = Color3.fromRGB(70, 70, 70), Thickness = 1, Transparency = 0.4 })
    local nameBox = makeUI(addFrame, "TextBox", {
        Size = UDim2.new(1, -12, 0, 22), Position = UDim2.new(0, 6, 0, 6),
        BackgroundColor3 = Color3.fromRGB(28, 28, 28), BackgroundTransparency = 0.1,
        BorderSizePixel = 0, Text = "",
        PlaceholderText = "Song name...", PlaceholderColor3 = Color3.fromRGB(100, 100, 100),
        TextColor3 = Color3.fromRGB(220, 220, 220), Font = Enum.Font.Gotham, TextSize = 10,
        TextXAlignment = Enum.TextXAlignment.Left, ClearTextOnFocus = false, ZIndex = 6
    })
    makeUI(nameBox, "UICorner", { CornerRadius = UDim.new(0, 5) })
    makeUI(nameBox, "UIPadding", { PaddingLeft = UDim.new(0, 7) })
    local idBox = makeUI(addFrame, "TextBox", {
        Size = UDim2.new(1, -62, 0, 22), Position = UDim2.new(0, 6, 0, 34),
        BackgroundColor3 = Color3.fromRGB(28, 28, 28), BackgroundTransparency = 0.1,
        BorderSizePixel = 0, Text = "",
        PlaceholderText = "Sound ID / rbxassetid://...", PlaceholderColor3 = Color3.fromRGB(100, 100, 100),
        TextColor3 = Color3.fromRGB(220, 220, 220), Font = Enum.Font.Gotham, TextSize = 10,
        TextXAlignment = Enum.TextXAlignment.Left, ClearTextOnFocus = false, ZIndex = 6
    })
    makeUI(idBox, "UICorner", { CornerRadius = UDim.new(0, 5) })
    makeUI(idBox, "UIPadding", { PaddingLeft = UDim.new(0, 7) })
    local addBtn = makeUI(addFrame, "TextButton", {
        Size = UDim2.new(0, 46, 0, 22), Position = UDim2.new(1, -52, 0, 34),
        BackgroundColor3 = Color3.fromRGB(40, 110, 45), BorderSizePixel = 0,
        Text = "+ Add", Font = Enum.Font.GothamBold,
        TextColor3 = Color3.fromRGB(255, 255, 255), TextSize = 10, ZIndex = 6
    })
    makeUI(addBtn, "UICorner", { CornerRadius = UDim.new(0, 5) })
    local statusLabel = makeUI(addFrame, "TextLabel", {
        Size = UDim2.new(1, -12, 0, 12), Position = UDim2.new(0, 6, 1, -14),
        BackgroundTransparency = 1, Text = "",
        Font = Enum.Font.Gotham, TextColor3 = Color3.fromRGB(100, 200, 120),
        TextSize = 9, TextXAlignment = Enum.TextXAlignment.Left, ZIndex = 6
    })
    addBtn.MouseEnter:Connect(function()
        TweenService:Create(addBtn, TweenInfo.new(0.1), { BackgroundColor3 = Color3.fromRGB(70, 180, 70) }):Play()
    end)
    addBtn.MouseLeave:Connect(function()
        TweenService:Create(addBtn, TweenInfo.new(0.1), { BackgroundColor3 = Color3.fromRGB(40, 110, 45) }):Play()
    end)
    -- Update placeholder to hint MP3/OGG path support
    idBox.PlaceholderText = "Sound ID, rbxassetid://, or local path"

    addBtn.MouseButton1Click:Connect(function()
        local rawName = nameBox.Text:match("^%s*(.-)%s*$")
        local rawId   = idBox.Text:match("^%s*(.-)%s*$")
        if rawName == "" then
            statusLabel.Text = "Song name cannot be empty!"
            statusLabel.TextColor3 = Color3.fromRGB(220, 100, 80)
            return
        end
        if rawId == "" then
            statusLabel.Text = "Enter a Sound ID or local file path!"
            statusLabel.TextColor3 = Color3.fromRGB(220, 100, 80)
            return
        end

        local finalId
        local isFile = false

        -- Case 1: already a full rbxassetid:// URI
        if rawId:match("^rbxassetid://") then
            finalId = rawId

        -- Case 2: plain numeric Roblox sound ID
        elseif rawId:match("^%d+$") then
            finalId = "rbxassetid://" .. rawId

        -- Case 3: local file path (.mp3 or .ogg) -> resolve via GetCustomAsset
        elseif rawId:lower():match("%.mp3$") or rawId:lower():match("%.ogg$") then
            if not mp_canFolderIO() then
                statusLabel.Text = "File IO not supported on this executor!"
                statusLabel.TextColor3 = Color3.fromRGB(220, 100, 80)
                return
            end
            local okD, data = pcall(readfile, rawId)
            local ext = (rawId:match("%.([^%.]+)$") or ""):lower()
            if not mp_validateAudioFile(data, ext) then
                statusLabel.Text = "File not found or corrupt: " .. rawId
                statusLabel.TextColor3 = Color3.fromRGB(220, 100, 80)
                return
            end
            local resolved = mp_resolveLocalAudio(rawId)
            if not resolved then
                statusLabel.Text = "GetCustomAsset() failed for this file!"
                statusLabel.TextColor3 = Color3.fromRGB(220, 100, 80)
                return
            end
            finalId = resolved
            isFile  = true

        else
            statusLabel.Text = "Invalid input! Use ID, rbxassetid://, or .mp3/.ogg path"
            statusLabel.TextColor3 = Color3.fromRGB(220, 100, 80)
            return
        end

        table.insert(songs, {
            Name    = rawName,
            Id      = finalId,
            Icon    = MP_ICON_SONG,
            IsFile  = isFile,
            RawPath = isFile and rawId or nil,
            CanPlay = true,
        })
        mp_saveCustomSongs(songs, DEFAULT_COUNT)
        rebuildDropdown()
        nameBox.Text = ""; idBox.Text = ""
        statusLabel.Text = "\"" .. rawName .. "\" added" .. (mp_canFileIO() and " & saved!" or " (no file IO)")
        statusLabel.TextColor3 = Color3.fromRGB(100, 200, 120)
        task.delay(3, function() if statusLabel then statusLabel.Text = "" end end)
    end)

    local isChangingSong = false
    local function playSong(idx, autoPlay)
        isChangingSong = true
        currentSongIndex = idx
        sound:Stop()
        sound.TimePosition = 0
        local songEntry = songs[idx]
        if songEntry.IsFile then
            if songEntry.CanPlay == false then
                songNameLabel.Text = "File corrupt or unsupported format!"
                isPlaying = false
                setPlayState(false)
                task.defer(function() isChangingSong = false end)
                return
            end
            local assigned = false
            -- Prefer cached resolved ID (already a rbxasset:// URI from GetCustomAsset)
            if songEntry.Id and songEntry.Id ~= "" then
                local ok1 = pcall(function() sound.SoundId = songEntry.Id end)
                if ok1 then assigned = true end
            end
            -- If cache miss, re-resolve via GetCustomAsset (works for both MP3 and OGG)
            if not assigned and songEntry.RawPath then
                local resolved = mp_resolveLocalAudio(songEntry.RawPath)
                if resolved then
                    songEntry.Id = resolved  -- cache for next time
                    local ok2 = pcall(function() sound.SoundId = resolved end)
                    if ok2 then assigned = true end
                end
            end
            if not assigned then
                local fmt = songEntry.FileExt and songEntry.FileExt:upper() or "audio"
                songNameLabel.Text = "Failed to load " .. fmt .. " file!"
                isPlaying = false
                setPlayState(false)
                task.defer(function() isChangingSong = false end)
                return
            end
        else
            sound.SoundId = songEntry.Id
        end
        songNameLabel.Text = songEntry.Name
        dropIconImg.Image = songEntry.Icon
        dropLabel.Text = songEntry.Name
        if autoPlay then
            isPlaying = true
            setPlayState(true)
            task.spawn(function()
                pcall(function()
                    if not sound.IsLoaded then sound.Loaded:Wait() end
                    sound.TimePosition = 0
                    sound:Play()
                end)
            end)
        end
        task.defer(function() isChangingSong = false end)
    end
    playSong(1, false)

    playClick.MouseButton1Click:Connect(function()
        if not isPlaying then sound:Resume(); isPlaying = true; setPlayState(true)
        else sound:Pause(); isPlaying = false; setPlayState(false) end
    end)
    nextClick.MouseButton1Click:Connect(function() playSong(currentSongIndex % #songs + 1, true) end)
    prevClick.MouseButton1Click:Connect(function() playSong(((currentSongIndex-2) % #songs)+1, true) end)
    sound.Ended:Connect(function()
        if isChangingSong then return end
        if isPlaying then
            task.defer(function()
                pcall(function()
                    playSong(currentSongIndex % #songs + 1, true)
                end)
            end)
        end
    end)

    RunService.Heartbeat:Connect(function(dt)
        if not isScrubbing and sound.IsLoaded and sound.TimeLength and sound.TimeLength > 0 then
            local pos = sound.TimePosition or 0
            local len = sound.TimeLength
            local ratio = pos / len
            progressBar.Size = UDim2.new(ratio, 0, 1, 0)
            progressThumb.Position = UDim2.new(ratio, 0, 0.5, 0)
            currentTimeLabel.Text = formatTime(pos)
            totalTimeLabel.Text = formatTime(len)
        end
        if isPlaying then
            vizPhase = vizPhase + dt * 5
            animPhase = animPhase + dt * 4.5
        end
        updateViz(isPlaying, isMuted and 0 or savedVolume)
        updateVolBars(isMuted and 0 or savedVolume, animPhase, isPlaying)
        for i = 1, BAR_COUNT do
            local cur = bars[i].Size.Y.Offset
            local tgt = barTargetH[i]
            local new = cur + (tgt - cur) * 0.25
            bars[i].Size = UDim2.new(0, BAR_W, 0, new)
            bars[i].Position = UDim2.new(0, (i-1)*(BAR_W+BAR_GAP), 1, -new)
        end
    end)
end

    setupVipTab = function()
        local isVipLocked = not hasPermission("VIP")
        UI.createToggle(VipTabContent, "Emote VIP", isEmoteEnabled, function(v)
            isEmoteEnabled = v
            EmoteToggleButton.Visible = v
            if not v then
                destroyEmoteGUI()
            end
            saveFeatureStates()
        end, isVipLocked, "VIP").LayoutOrder = 1
        UI.createToggle(VipTabContent, "Animasi VIP", isAnimationEnabled, function(v) 
            isAnimationEnabled = v; 
            if isAnimationEnabled then 
                initializeAnimationGUI() 
                AnimationShowButton.Visible = true
            else 
                destroyAnimationGUI() 
                AnimationShowButton.Visible = false
            end 
            saveFeatureStates()
        end, isVipLocked, "VIP").LayoutOrder = 2
        UI.createToggle(VipTabContent, "Emote Transparan", isEmoteTransparent, function(v)
            isEmoteTransparent = v
            applyEmoteTransparency(v)
            saveFeatureStates()
        end, isVipLocked, "VIP").LayoutOrder = 3
        UI.createToggle(VipTabContent, "Animasi transparan", isAnimationTransparent, function(v)
            isAnimationTransparent = v
            if isAnimationEnabled and applyAnimationTransparency then applyAnimationTransparency(v) end
            saveFeatureStates()
        end, isVipLocked, "VIP").LayoutOrder = 4
        UI.createToggle(VipTabContent, "Music Player", isMusicPlayerEnabled, function(v)
            isMusicPlayerEnabled = v
            if v then
                pcall(createMusicPlayerPage)
                if VipTabContent:FindFirstChild("ZeroMusicPlayer") then
                    VipTabContent.ZeroMusicPlayer.Visible = true
                end
            else
                if VipTabContent:FindFirstChild("ZeroMusicPlayer") then
                    VipTabContent.ZeroMusicPlayer.Visible = false
                end
            end
        end, isVipLocked, "VIP").LayoutOrder = 5
    end
    
    setupServerTab = function()
        -- Ensure layout works
        ServerTabContent.UIListLayout.SortOrder = Enum.SortOrder.LayoutOrder

        local topContainer = Instance.new("Frame", ServerTabContent)
        topContainer.Size = UDim2.new(1, 0, 0, 40)
        topContainer.BackgroundTransparency = 1
        topContainer.LayoutOrder = 1

        local topLayout = Instance.new("UIListLayout", topContainer)
        topLayout.FillDirection = Enum.FillDirection.Horizontal
        topLayout.SortOrder = Enum.SortOrder.LayoutOrder
        topLayout.Padding = UDim.new(0, 5)

        local rejoinBtn = UI.createButton(topContainer, "REJOIN", Rejoin)
        rejoinBtn.Size = UDim2.new(0.5, -2, 1, 0)
        rejoinBtn.LayoutOrder = 1

        local currentSortMode = "Desc"
        
        local function FetchServers(sortMode)
            -- Needs forward declaration to fix error
        end

        local hopLowServerBtn = UI.createButton(topContainer, "HOP LOW SERVER", function()
            local success, response = pcall(function()
                return HttpService:JSONDecode(game:HttpGet("https://games.roblox.com/v1/games/" .. tostring(game.PlaceId) .. "/servers/Public?sortOrder=Asc&limit=10"))
            end)
            if success and response and response.data and #response.data > 0 then
                for _, server in ipairs(response.data) do
                    if server.id ~= game.JobId and server.playing < server.maxPlayers then
                        TeleportService:TeleportToPlaceInstance(game.PlaceId, server.id, LocalPlayer)
                        return
                    end
                end
            end
            showNotification("Gagal hop low server.", Color3.fromRGB(200, 50, 50))
        end)
        hopLowServerBtn.Size = UDim2.new(0.5, -3, 1, 0)
        hopLowServerBtn.LayoutOrder = 2

        local hopContainer = Instance.new("Frame", ServerTabContent)
        hopContainer.Size = UDim2.new(1, 0, 0, 40)
        hopContainer.BackgroundTransparency = 1
        hopContainer.LayoutOrder = 2

        local hopLayout = Instance.new("UIListLayout", hopContainer)
        hopLayout.FillDirection = Enum.FillDirection.Horizontal
        hopLayout.SortOrder = Enum.SortOrder.LayoutOrder
        hopLayout.Padding = UDim.new(0, 5)
        hopLayout.VerticalAlignment = Enum.VerticalAlignment.Center

        local function getServerRoleIconColor()
            -- Default: VIP=ungu, Normal=hijau. Setelah user geser HSV, ikut UI.currentThemeColor.
            -- ThemeColorValue lama yang biru sudah diabaikan saat load untuk VIP/Normal/Developer.
            return getResolvedThemeColor(getRoleDefaultThemeColor())
        end

        local function applyServerRoleIconColor(inst, newColor)
            if not inst then return end
            local color = newColor or getServerRoleIconColor()
            -- Support ImageButton lama dan TextButton baru. Text icon dipakai agar warna tidak tercampur asset biru.
            pcall(function()
                if inst:IsA("ImageButton") or inst:IsA("ImageLabel") then
                    inst.ImageColor3 = color
                end
            end)
            pcall(function()
                if inst:IsA("TextButton") or inst:IsA("TextLabel") then
                    inst.TextColor3 = color
                end
            end)
        end

        local serverRoleIconColor = getServerRoleIconColor()
        local FILTER_ICON_ASSET = "rbxassetid://90812069520281"
        local REFRESH_ICON_ASSET = "rbxassetid://86576480880907"

        local filterIconBtn = Instance.new("ImageButton", hopContainer)
        filterIconBtn.Name = "ServerFilterIconButton"
        filterIconBtn.Size = UDim2.new(0, 30, 0, 30)
        filterIconBtn.BackgroundTransparency = 1
        filterIconBtn.AutoButtonColor = false
        filterIconBtn.Image = FILTER_ICON_ASSET
        filterIconBtn.ImageColor3 = serverRoleIconColor
        filterIconBtn.ScaleType = Enum.ScaleType.Fit
        filterIconBtn.LayoutOrder = 1
        registerThemeElement(filterIconBtn, "ImageColor3", serverRoleIconColor, applyServerRoleIconColor)
        applyServerRoleIconColor(filterIconBtn, serverRoleIconColor)
        if isGradientRole() then applyDeveloperGradient(filterIconBtn) end

        local hopBtn = UI.createButton(hopContainer, "HOP RANDOM SERVER", function() HopServer() end)
        hopBtn.Size = UDim2.new(1, -70, 1, 0)
        hopBtn.LayoutOrder = 2

        local refreshIconBtn = Instance.new("ImageButton", hopContainer)
        refreshIconBtn.Name = "ServerRefreshIconButton"
        refreshIconBtn.Size = UDim2.new(0, 30, 0, 30)
        refreshIconBtn.BackgroundTransparency = 1
        refreshIconBtn.AutoButtonColor = false
        refreshIconBtn.Image = REFRESH_ICON_ASSET
        refreshIconBtn.ImageColor3 = serverRoleIconColor
        refreshIconBtn.ScaleType = Enum.ScaleType.Fit
        refreshIconBtn.LayoutOrder = 3
        registerThemeElement(refreshIconBtn, "ImageColor3", serverRoleIconColor, applyServerRoleIconColor)
        applyServerRoleIconColor(refreshIconBtn, serverRoleIconColor)
        if isGradientRole() then applyDeveloperGradient(refreshIconBtn) end

        local serverListContainer = Instance.new("Frame", ServerTabContent)
        serverListContainer.Size = UDim2.new(1, 0, 0, 300)
        serverListContainer.BackgroundTransparency = 1
        serverListContainer.LayoutOrder = 4

        local serverListLayout = Instance.new("UIListLayout", serverListContainer)
        serverListLayout.SortOrder = Enum.SortOrder.LayoutOrder
        serverListLayout.Padding = UDim.new(0, 10)
        
        local cachedGameName = "Roblox Game"
        pcall(function()
            cachedGameName = game:GetService("MarketplaceService"):GetProductInfo(game.PlaceId).Name
        end)

        function FetchServers(sortMode)
            -- Clear existing list
            for _, child in ipairs(serverListContainer:GetChildren()) do
                if child:IsA("Frame") then child:Destroy() end
            end

            local sortQuery = (sortMode == "Normal") and "Desc" or "Asc"
            local success, response = pcall(function()
                return HttpService:JSONDecode(game:HttpGet("https://games.roblox.com/v1/games/" .. tostring(game.PlaceId) .. "/servers/Public?sortOrder=" .. sortQuery .. "&limit=50"))
            end)

            if success and response and response.data then
                if sortMode == "Ping" then
                    -- Filter out servers that are full, then sort by Ping AND Player count (Low Server)
                    local filtered = {}
                    for _, s in ipairs(response.data) do
                        if s.playing < s.maxPlayers then
                            table.insert(filtered, s)
                        end
                    end
                    table.sort(filtered, function(a, b)
                        local pingA = a.ping or 9999
                        local pingB = b.ping or 9999
                        local playingA = a.playing or 0
                        local playingB = b.playing or 0
                        
                        -- Prioritize fast ping, then low server count
                        if pingA == pingB then
                            return playingA < playingB
                        end
                        return pingA < pingB
                    end)
                    response.data = {}
                    -- Only show top 10 best
                    for i = 1, math.min(10, #filtered) do
                        table.insert(response.data, filtered[i])
                    end
                elseif sortMode == "Asc" then
                    local filtered = {}
                    for _, s in ipairs(response.data) do
                        if s.playing < s.maxPlayers and s.playing > 0 then
                            table.insert(filtered, s)
                        end
                    end
                    table.sort(filtered, function(a, b)
                        local playingA = a.playing or 0
                        local playingB = b.playing or 0
                        return playingA < playingB
                    end)
                    response.data = {}
                    for i = 1, math.min(10, #filtered) do
                        table.insert(response.data, filtered[i])
                    end
                else
                    local limited = {}
                    for i = 1, math.min(10, #response.data) do
                        table.insert(limited, response.data[i])
                    end
                    response.data = limited
                end

                for i, server in ipairs(response.data) do
                    local card = Instance.new("Frame", serverListContainer)
                    card.Size = UDim2.new(1, 0, 0, 80)
                    card.BackgroundColor3 = Color3.fromRGB(35, 35, 35)
                    card.BorderSizePixel = 0
                    card.LayoutOrder = i
                    local isDeveloperServerCard = false
                    pcall(function()
                        isDeveloperServerCard = type(isGradientRole) == "function" and isGradientRole()
                    end)
                    -- Patch v24: untuk role Developer, server card tidak lagi terlihat sebagai kolom/kotak.
                    -- Judul dan detail dipisahkan garis lurus, dengan padding teks yang lebih aman.
                    card.BackgroundTransparency = isDeveloperServerCard and 1 or 0
                    local uiCorner = Instance.new("UICorner", card)
                    uiCorner.CornerRadius = UDim.new(0, 8)

                    local thumb = Instance.new("ImageLabel", card)
                    thumb.Size = UDim2.new(0, 70, 0, 70)
                    thumb.Position = UDim2.new(0, 5, 0, 5)
                    thumb.Image = "rbxthumb://type=Asset&id=" .. game.PlaceId .. "&w=150&h=150"
                    thumb.BackgroundColor3 = Color3.fromRGB(20, 20, 20)
                    thumb.BackgroundTransparency = isDeveloperServerCard and 1 or 0
                    thumb.BorderSizePixel = 0

                    if isDeveloperServerCard then
                        local serverSeparator = Instance.new("Frame", card)
                        serverSeparator.Name = "DeveloperServerSeparator"
                        serverSeparator.Size = UDim2.new(1, -170, 0, 1)
                        serverSeparator.Position = UDim2.new(0, 85, 0, 28)
                        serverSeparator.BackgroundColor3 = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
                        serverSeparator.BackgroundTransparency = 0.35
                        serverSeparator.BorderSizePixel = 0
                        serverSeparator:SetAttribute("ArexansThemeAccent", true)
                        registerThemeElement(serverSeparator, "BackgroundColor3", serverSeparator.BackgroundColor3)
                        pcall(function()
                            if type(applyDeveloperGradient) == "function" then
                                applyDeveloperGradient(serverSeparator)
                            elseif type(UI._ArexansApplyDeveloperGradient) == "function" then
                                UI._ArexansApplyDeveloperGradient(serverSeparator)
                            end
                        end)
                    end

                    local nameLabel = Instance.new("TextLabel", card)
                    nameLabel.Size = UDim2.new(1, -165, 0, 20)
                    nameLabel.Position = UDim2.new(0, 85, 0, 4)
                    nameLabel.BackgroundTransparency = 1
                    nameLabel.Text = cachedGameName
                    nameLabel.TextColor3 = Color3.new(1, 1, 1)
                    nameLabel.TextXAlignment = Enum.TextXAlignment.Left
                    nameLabel.TextTruncate = Enum.TextTruncate.AtEnd
                    nameLabel.Font = Enum.Font.SourceSansBold
                    nameLabel.TextSize = 11

                    local idLabel = Instance.new("TextLabel", card)
                    idLabel.Size = UDim2.new(1, -165, 0, 18)
                    idLabel.Position = UDim2.new(0, 85, 0, 34)
                    idLabel.BackgroundTransparency = 1
                    idLabel.Text = "Place ID: " .. tostring(game.PlaceId)
                    idLabel.TextColor3 = Color3.fromRGB(210, 210, 210)
                    idLabel.TextXAlignment = Enum.TextXAlignment.Left
                    idLabel.TextTruncate = Enum.TextTruncate.AtEnd
                    idLabel.TextSize = 10

                    local playerLabel = Instance.new("TextLabel", card)
                    playerLabel.Size = UDim2.new(1, -165, 0, 18)
                    playerLabel.Position = UDim2.new(0, 85, 0, 55)
                    playerLabel.BackgroundTransparency = 1
                    playerLabel.Text = "Players: " .. tostring(server.playing) .. "/" .. tostring(server.maxPlayers)
                    playerLabel.TextColor3 = Color3.fromRGB(210, 210, 210)
                    playerLabel.TextXAlignment = Enum.TextXAlignment.Left
                    playerLabel.TextTruncate = Enum.TextTruncate.AtEnd
                    playerLabel.TextSize = 10

                    local joinBtn = UI.createButton(card, "Join", function()
                        TeleportService:TeleportToPlaceInstance(game.PlaceId, server.id, LocalPlayer)
                    end)
                    joinBtn.Size = UDim2.new(0, 60, 0, 30)
                    joinBtn.Position = UDim2.new(1, -70, 0, 10)
                    
                    local pingLabel = Instance.new("TextLabel", card)
                    pingLabel.Size = UDim2.new(0, 60, 0, 20)
                    pingLabel.Position = UDim2.new(1, -70, 0, 47)
                    pingLabel.BackgroundTransparency = 1
                    pingLabel.Text = server.ping and (tostring(server.ping) .. "ms") or ""
                    pingLabel.TextColor3 = Color3.fromRGB(205, 205, 205)
                    pingLabel.TextSize = 10
                end
                
                task.delay(0.1, function()
                    serverListContainer.Size = UDim2.new(1, 0, 0, serverListLayout.AbsoluteContentSize.Y)
                    setupCanvasSize(ServerListLayout, ServerTabContent)
                end)
            end
        end

        -- Patch v9: filter dibuat inline/collapsible supaya tidak menghalangi daftar server.
        local filterPanel = Instance.new("Frame", ServerTabContent)
        filterPanel.Name = "ServerFilterPanel"
        filterPanel.Size = UDim2.new(1, 0, 0, 0)
        filterPanel.BackgroundColor3 = Color3.fromRGB(18, 18, 18)
        filterPanel.BackgroundTransparency = 1
        filterPanel.BorderSizePixel = 0
        filterPanel.ClipsDescendants = true
        filterPanel.Visible = false
        filterPanel.LayoutOrder = 3

        local filterPanelCorner = Instance.new("UICorner", filterPanel)
        filterPanelCorner.CornerRadius = UDim.new(0, 10)

        local filterPanelStroke = Instance.new("UIStroke", filterPanel)
        filterPanelStroke.Name = "ThemeStroke"
        filterPanelStroke.Color = getResolvedThemeColor(getRoleDefaultThemeColor())
        filterPanelStroke.Thickness = 1.5
        filterPanelStroke.Transparency = 0.15
        registerThemeElement(filterPanelStroke, "Color", filterPanelStroke.Color)

        local filterPanelGradient = Instance.new("UIGradient", filterPanel)
        filterPanelGradient.Rotation = 0
        filterPanelGradient.Transparency = NumberSequence.new({
            NumberSequenceKeypoint.new(0, 0.08),
            NumberSequenceKeypoint.new(1, 0.38),
        })

        local filterContent = Instance.new("Frame", filterPanel)
        filterContent.Name = "FilterContent"
        filterContent.Size = UDim2.new(1, -10, 1, -8)
        filterContent.Position = UDim2.new(0, 5, 0, 4)
        filterContent.BackgroundTransparency = 1

        local filterLayout = Instance.new("UIListLayout", filterContent)
        filterLayout.FillDirection = Enum.FillDirection.Horizontal
        filterLayout.SortOrder = Enum.SortOrder.LayoutOrder
        filterLayout.Padding = UDim.new(0, 6)
        filterLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
        filterLayout.VerticalAlignment = Enum.VerticalAlignment.Center

        local filterButtons = {}
        local isFilterPanelOpen = false

        local function restyleFilterButtons()
            local themeColor = getResolvedThemeColor(getRoleDefaultThemeColor())
            for mode, btn in pairs(filterButtons) do
                local selected = (mode == currentSortMode)
                btn.BackgroundColor3 = selected and themeColor or Color3.fromRGB(28, 28, 28)
                btn.BackgroundTransparency = selected and 0.18 or 0.38
                btn.TextColor3 = selected and Color3.fromRGB(255, 255, 255) or Color3.fromRGB(220, 220, 220)
                local stroke = btn:FindFirstChild("ThemeStroke")
                if stroke then
                    stroke.Color = themeColor
                    stroke.Transparency = selected and 0 or 0.45
                end
            end
        end

        local function setFilterPanelVisible(visible)
            isFilterPanelOpen = visible
            if visible then filterPanel.Visible = true end
            local targetSize = visible and UDim2.new(1, 0, 0, 42) or UDim2.new(1, 0, 0, 0)
            local targetTransparency = visible and 0.12 or 1
            TweenService:Create(filterPanel, TweenInfo.new(0.18, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), {
                Size = targetSize,
                BackgroundTransparency = targetTransparency
            }):Play()
            task.delay(0.2, function()
                if filterPanel and filterPanel.Parent and not isFilterPanelOpen then
                    filterPanel.Visible = false
                end
                pcall(function() setupCanvasSize(ServerListLayout, ServerTabContent) end)
            end)
        end

        local function createFilterChip(text, icon, mode, order)
            local btn = Instance.new("TextButton", filterContent)
            btn.Name = "FilterChip_" .. tostring(mode)
            btn.Size = UDim2.new(0.333, -4, 1, 0)
            btn.BackgroundColor3 = Color3.fromRGB(28, 28, 28)
            btn.BackgroundTransparency = 0.38
            btn.BorderSizePixel = 0
            btn.Text = icon .. "  " .. text
            btn.TextColor3 = Color3.fromRGB(230, 230, 230)
            btn.Font = Enum.Font.SourceSansSemibold
            btn.TextSize = 12
            btn.LayoutOrder = order
            btn.AutoButtonColor = false

            local chipCorner = Instance.new("UICorner", btn)
            chipCorner.CornerRadius = UDim.new(0, 8)

            local chipStroke = Instance.new("UIStroke", btn)
            chipStroke.Name = "ThemeStroke"
            chipStroke.Color = getResolvedThemeColor(getRoleDefaultThemeColor())
            chipStroke.Thickness = 1
            chipStroke.Transparency = 0.45
            registerThemeElement(chipStroke, "Color", chipStroke.Color)

            local chipScale = Instance.new("UIScale", btn)
            chipScale.Name = "ChipScale"
            btn.MouseEnter:Connect(function()
                TweenService:Create(chipScale, TweenInfo.new(0.12), {Scale = 1.03}):Play()
            end)
            btn.MouseLeave:Connect(function()
                TweenService:Create(chipScale, TweenInfo.new(0.12), {Scale = 1}):Play()
            end)
            btn.MouseButton1Click:Connect(function()
                currentSortMode = mode
                restyleFilterButtons()
                setFilterPanelVisible(false)
                FetchServers(currentSortMode)
            end)

            filterButtons[mode] = btn
            return btn
        end

        createFilterChip("Low", "◒", "Asc", 1)
        createFilterChip("Ping", "PING", "Ping", 2)
        createFilterChip("Normal", "●", "Normal", 3)
        restyleFilterButtons()

        registerThemeElement(filterPanel, "BackgroundColor3", getResolvedThemeColor(getRoleDefaultThemeColor()), function(_, newColor)
            restyleFilterButtons()
        end)

        filterIconBtn.MouseButton1Click:Connect(function()
            setFilterPanelVisible(not isFilterPanelOpen)
        end)
        
        -- Hide filter panel when switching tabs to avoid floating/overlap.
        if TabsFrame then
            for _, btn in ipairs(TabsFrame:GetChildren()) do
                if btn:IsA("TextButton") then
                    btn.MouseButton1Click:Connect(function()
                        setFilterPanelVisible(false)
                    end)
                end
            end
        end

        local isServerRefreshing = false
        local refreshScale = Instance.new("UIScale", refreshIconBtn)
        refreshScale.Name = "RefreshClickScale"
        refreshScale.Scale = 1

        refreshIconBtn.MouseButton1Click:Connect(function()
            if isServerRefreshing then return end
            isServerRefreshing = true

            local baseRotation = refreshIconBtn.Rotation % 360
            refreshIconBtn.Rotation = baseRotation
            TweenService:Create(refreshScale, TweenInfo.new(0.1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {Scale = 0.86}):Play()
            task.delay(0.1, function()
                if refreshScale and refreshScale.Parent then
                    TweenService:Create(refreshScale, TweenInfo.new(0.18, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {Scale = 1}):Play()
                end
            end)

            local spinTween = TweenService:Create(refreshIconBtn, TweenInfo.new(0.55, Enum.EasingStyle.Linear, Enum.EasingDirection.InOut), {
                Rotation = baseRotation + 360
            })
            spinTween:Play()
            spinTween.Completed:Connect(function()
                if refreshIconBtn and refreshIconBtn.Parent then
                    refreshIconBtn.Rotation = baseRotation
                end
                isServerRefreshing = false
            end)

            task.spawn(function()
                FetchServers(currentSortMode)
            end)
        end)
        
        -- initial fetch
        task.spawn(function()
            FetchServers(currentSortMode)
        end)
    end
    
    -- Auto Perfect Recording
isAutoPerfectEnabled = false
autoPerfectSessionActive = false
autoPerfectRestarting = false
autoPerfectEnding = false
autoPerfectCombinedFrames = {}
autoPerfectRawSegments = {}
autoPerfectSegmentCount = 0
autoPerfectLastSafeTime = 0
autoPerfectLastGroundY = nil
autoPerfectLastSummitScan = 0
autoPerfectTouchConnection = nil
autoPerfectDiedConnection = nil
autoPerfectToggleSetState = nil
autoPerfectInitialAnimateSnapshot = nil
autoPerfectSummitStartValues = {}
autoPerfectSafeCutSeconds = 0.85
autoPerfectFallDropThreshold = 24
autoPerfectFallVelocityThreshold = -95
autoPerfectRecovery = {
    fallMinAirTime = 0.55,
    freefallStartedAt = nil,
    lastSafePosition = nil,
    lastSafeFrame = nil,
    lastSafeFrameTime = 0,
    lastCheckpointPosition = nil,
    lastCheckpointFrame = nil,
    lastCheckpointTime = 0,
    lastTouchedCheckpointPosition = nil,
    lastTouchedCheckpointAt = 0,
    teleportBackOnFall = false,
    fallTeleportYOffset = 3.0,
}
-- Penyambung Auto Perfect: dibuat lebih grounded agar karakter tidak terlihat terbang/ditarik magnet.
autoPerfectCheckpointRadius = 34
autoPerfectJoinSnapRadius = 3.25
autoPerfectJoinAnchorRadius = 24
autoPerfectBridgeSpeed = 16
autoPerfectBridgeMinDuration = 0.16
autoPerfectBridgeMaxDuration = 1.15
autoPerfectRespawnStableSeconds = 0.22
autoPerfectLoopEraseRadius = 6.5
autoPerfectLoopEraseVertical = 8
autoPerfectLoopEraseMinFrames = 10
autoPerfectSmoothStrength = 0.28
autoPerfectNormalWalkSpeed = 16
autoPerfectNormalRunSpeed = 22
autoPerfectMaxNormalGap = 5.5
autoPerfectJumpHeightThreshold = 2.15
JUMP_VELOCITY_THRESHOLD = tonumber(JUMP_VELOCITY_THRESHOLD) or 6
autoPerfectMaxGroundJoinFlatGap = 9.5
autoPerfectMaxGroundJoinVerticalGap = 5.25
autoPerfectMaxBridgeFlatGap = 28
autoPerfectMaxBridgeVerticalGap = 2.75
autoPerfectDiscontinuityFlatGap = 68
autoPerfectDiscontinuityVerticalGap = 18
autoPerfectPlaybackSoftCorrection = 0.18
autoPerfectPlaybackHardCorrectionFlat = 11
autoPerfectRecordedBaseWalkSpeed = 16
-- Full Route Stitch v2: jangan memotong terlalu jauh ke belakang.
-- Jika seam dekat tidak ditemukan, buat connector grounded dengan kecepatan normal daripada melewati segmen sampai hasil terlalu singkat.
autoPerfectRecentRollbackStrictFrames = 450
autoPerfectRecentRollbackLooseFrames = 1800
autoPerfectConnectorStepDistance = 1.15
autoPerfectConnectorMaxFrames = 900
autoPerfectConnectorMinSpeed = 11
autoPerfectConnectorMaxSpeed = 22
beginAutoPerfectSession = nil
finishAutoPerfectSession = nil
handleAutoPerfectFailure = nil

-- Auto Perfect Smooth/Low-Freeze v11
-- Mode ini mengurangi beban saat rekam: sample 60 FPS, live line sangat ringan, status UI di-throttle.
autoPerfectLiveLineLastDrawAt = 0
autoPerfectLiveLineLastFrameCount = 0
-- v12: live line tidak lagi redraw full. Ia append 1 segment ringan di belakang karakter.
autoPerfectLiveLineInterval = 0.03
autoPerfectLiveLineMinFrameStep = 1
autoPerfectLiveLineMaxFrames = 260
autoPerfectLastSummitCacheAt = 0
autoPerfectSummitCache = {}
autoPerfectCurrentAttemptHadFailure = false
autoPerfectCleanAttemptStartedAt = 0
autoPerfectStatusLastUpdateAt = 0
autoPerfectLastStatusText = nil
autoPerfectStatusInterval = 0.35
autoPerfectLastObservedPosition = nil
autoPerfectLastSummitCounterCheckAt = 0
autoPerfectSummitCounterInterval = 0.45
autoPerfectSmoothFinalFps = 60
autoPerfectSmoothMaxInsertedPerGap = 8
autoPerfectSmoothMaxFinalFrames = 20000
autoPerfectFinalLineMaxFrames = 1000

-- Auto Perfect Realtime Line v12
-- Target: garis selalu tertinggal realtime di belakang karakter tanpa redraw ribuan part.
autoPerfectRealtimeLineSegments = {}
autoPerfectRealtimeLineLastPosition = nil
autoPerfectRealtimeLineLastAppendAt = 0
autoPerfectRealtimeLineLastColorAt = 0
autoPerfectRealtimeLineCachedColor = nil
autoPerfectRealtimeLineMaxSegments = 520
autoPerfectRealtimeLineMinDistance = 0.58
autoPerfectRealtimeLineMinInterval = 0.04
autoPerfectRealtimeLineThickness = 0.16
autoPerfectRealtimeLineHardDistance = 60
autoPerfectRealtimeLineHardFlat = 48
autoPerfectRealtimeLineHardVertical = 22
autoPerfectRealtimeTrail = nil
autoPerfectRealtimeTrailAttachment0 = nil
autoPerfectRealtimeTrailAttachment1 = nil
autoPerfectRealtimeTrailLastEnsureAt = 0
autoPerfectRealtimeTrailLifetime = 24
autoPerfectRealtimeTrailWidth = 0.34

-- Auto Perfect Visual Line v13
-- Visual ON/OFF sekarang persistent: tetap hidup saat idle, saat merekam, dan setelah rekaman selesai.
autoPerfectVisualHeartbeatConnection = nil
autoPerfectVisualHeartbeatLastAt = 0
autoPerfectVisualHeartbeatInterval = 0.07
autoPerfectVisualSelectionSignature = ""
autoPerfectVisualLastStaticDrawAt = 0
autoPerfectVisualStaticRedrawInterval = 0.35
autoPerfectVisualHasStaticLine = false
autoPerfectVisualIdleFollowEnabled = true
autoPerfectVisualIdleMinDistance = 0.55
autoPerfectVisualIdleLineMaxSegments = 450
autoPerfectVisualLiveLineMaxSegments = 520

-- Auto Perfect Visual Line v14
-- Visual Line tetap manual saat playback: ON/OFF tidak boleh dimatikan otomatis oleh playback cleanup.
autoPerfectCurrentPlaybackRecordingData = nil
autoPerfectCurrentPlaybackOffset = 0
autoPerfectVisualPlaybackSignature = ""
autoPerfectVisualPlaybackRedrawInterval = 0.35

-- Recording Smooth Anti-Lag v15
-- Rekam dibuat lebih ringan, lalu hasil final dirapikan agar frame-drop/freeze saat record tidak ikut terasa di playback.
recordingLagGuardLastHeavyCheckAt = 0
recordingLagGuardHeavyCheckInterval = 0.075
recordingLagSpikeThreshold = 0.115
recordingSmoothFinalFps = 60
recordingSmoothMaxInsertedPerGap = 10
recordingSmoothMaxFinalFrames = 32000
recordingSmoothSpatialStrength = 0.08
recordingAutoPerfectSpatialStrength = 0.035
recordingMaxNormalizedGap = 0.16
recordingMaxVelocityForDt = 24
-- Timing dasar rekaman. Ini wajib ada supaya Auto Perfect/Visual Line tidak error nil.
SAMPLE_RATE = tonumber(SAMPLE_RATE) or 55
SAMPLE_INTERVAL = tonumber(SAMPLE_INTERVAL) or (1 / SAMPLE_RATE)
minSampleDistance = tonumber(minSampleDistance) or 0.055

-- Playback speed wajib punya default aman sebelum tombol speed dibuat / sebelum playback dijalankan.
-- Tanpa ini, heartbeat playback bisa error: number * nil.
playbackSpeed = tonumber(playbackSpeed) or 1
if playbackSpeed < 0.1 then
    playbackSpeed = 0.1
elseif playbackSpeed > 5 then
    playbackSpeed = 5
end

-- Default aman agar state-change playback tidak error saat nilai global belum dibuat.
STATE_CHANGE_COOLDOWN = tonumber(STATE_CHANGE_COOLDOWN) or 0.06

function getSafePlaybackSpeed()
    local speed = tonumber(playbackSpeed) or 1
    if speed < 0.1 then
        speed = 0.1
    elseif speed > 5 then
        speed = 5
    end
    playbackSpeed = speed
    return speed
end

recordingFrameDropCount = 0
recordingLastLoopAt = 0
recordingUiFrameCountLastAt = 0

function setRecordButtonsActive(active)
    local icon = active and UI.Icons.StopSquare or UI.Icons.RedCircle
    local fallbackText = active and (UI.IconText and UI.IconText.StopSquare or "■") or (UI.IconText and UI.IconText.RedCircle or "●")
    local buttons = {recordButton, quickRecordButton}
    for _, btn in ipairs(buttons) do
        if btn then
            if UI.applyIcon then
                UI.applyIcon(btn, icon, Color3.fromRGB(255, 255, 255))
            elseif btn:IsA("ImageButton") then
                btn.Image = "rbxassetid://" .. tostring(icon)
            else
                btn.Text = fallbackText
            end
            local stroke = btn:FindFirstChildOfClass("UIStroke")
            if stroke then stroke.Color = getResolvedThemeColor(Color3.fromRGB(0, 170, 255)) end
            if isGradientRole() then
                pcall(function()
                    applyDeveloperGradient(btn)
                    if stroke then applyDeveloperGradient(stroke) end
                end)
            end
        end
    end
end

function applyCompactGui(root)
    -- Versi nyaman klik: jangan mengecilkan font lagi, hanya rapikan truncation.
    if not root then return end
    for _, inst in ipairs(root:GetDescendants()) do
        if inst:IsA("TextLabel") or inst:IsA("TextButton") or inst:IsA("TextBox") then
            if inst.TextSize and inst.TextSize < 10 then
                inst.TextSize = 10
            end
            pcall(function() inst.TextWrapped = false end)
            pcall(function() inst.TextTruncate = Enum.TextTruncate.AtEnd end)
        end
    end
end

function tableClone(t)
    local out = {}
    if type(t) ~= "table" then return out end
    for k, v in pairs(t) do
        if type(v) == "table" then
            local inner = {}
            for ik, iv in pairs(v) do inner[ik] = iv end
            out[k] = inner
        else
            out[k] = v
        end
    end
    return out
end

function naturalCompare(a, b)
    local nameA = type(a) == "table" and a.Name or a or ""
    local nameB = type(b) == "table" and b.Name or b or ""
    local function split(s)
        local parts = {}
        for text, number in tostring(s):gmatch("([^%d]*)(%d*)") do
            if text ~= "" then table.insert(parts, text:lower()) end
            if number ~= "" then table.insert(parts, tonumber(number)) end
        end
        return parts
    end
    local partsA, partsB = split(nameA), split(nameB)
    for i = 1, math.min(#partsA, #partsB) do
        local partA, partB = partsA[i], partsB[i]
        if type(partA) ~= type(partB) then return type(partA) == "number" end
        if partA < partB then return true elseif partA > partB then return false end
    end
    return #partsA < #partsB
end

function vectorToTable(vector)
    return {x = vector.X, y = vector.Y, z = vector.Z}
end

function tableToVector(tbl)
    if typeof(tbl) == "Vector3" then return tbl end
    tbl = tbl or {}
    return Vector3.new(tonumber(tbl.x) or 0, tonumber(tbl.y) or 0, tonumber(tbl.z) or 0)
end

function getAnimationIdNumber(rawId)
    local id = tostring(rawId or ""):match("%d+")
    return id and tostring(id) or nil
end

function getRelativePath(root, instance)
    local path = {}
    local current = instance
    while current and current ~= root do
        table.insert(path, 1, current.Name)
        current = current.Parent
    end
    return table.concat(path, "/")
end

function findByRelativePath(root, path)
    if not root or type(path) ~= "string" or path == "" then return nil end
    local current = root
    for name in string.gmatch(path, "[^/]+") do
        current = current and current:FindFirstChild(name)
        if not current then return nil end
    end
    return current
end

function captureAnimateSnapshot(character)
    local animateScript = character and character:FindFirstChild("Animate")
    if not animateScript then return nil end
    local snapshot = { animations = {} }
    for _, desc in ipairs(animateScript:GetDescendants()) do
        if desc:IsA("Animation") then
            local id = getAnimationIdNumber(desc.AnimationId)
            if id then
                table.insert(snapshot.animations, {
                    path = getRelativePath(animateScript, desc),
                    name = desc.Name,
                    animationId = id,
                })
            end
        end
    end
    return (#snapshot.animations > 0) and snapshot or nil
end

function applyAnimateSnapshot(character, snapshot)
    if not (character and snapshot and type(snapshot.animations) == "table") then return false end
    local animateScript = character:FindFirstChild("Animate")
    if not animateScript then return false end
    local changed = false
    for _, item in ipairs(snapshot.animations) do
        local target = findByRelativePath(animateScript, item.path)
        if not target and item.name then
            target = animateScript:FindFirstChild(item.name, true)
        end
        if target and target:IsA("Animation") and item.animationId then
            local newId = "rbxassetid://" .. tostring(item.animationId)
            if target.AnimationId ~= newId then
                target.AnimationId = newId
                changed = true
            end
        end
    end
    if animateScript.Disabled then
        animateScript.Disabled = false
        changed = true
    end
    if changed then
        pcall(function()
            animateScript.Disabled = true
            task.wait()
            animateScript.Disabled = false
        end)
    end
    return true
end

function stopNonCorePlaybackTracks(humanoid)
    if not humanoid then return end
    for _, track in ipairs(humanoid:GetPlayingAnimationTracks()) do
        pcall(function() track:Stop(0.08) end)
    end
end

function drawVisualLine(recordingData, currentOffset)
    if autoPerfectDestroyRealtimeCharacterTrail then pcall(autoPerfectDestroyRealtimeCharacterTrail) end
    local folder = workspace:FindFirstChild("ArexansVisualLines")
    if folder then
        folder:ClearAllChildren()
        autoPerfectRealtimeLineSegments = {}
        autoPerfectRealtimeLineLastPosition = nil
        autoPerfectRealtimeLineLastAppendAt = 0
    else
        folder = Instance.new("Folder")
        folder.Name = "ArexansVisualLines"
        folder.Parent = workspace
    end
    if not recordingData or #recordingData < 2 then return end
    for i = 1, #recordingData - 1 do
        if recordingData[i].position and recordingData[i + 1].position then
            local point1 = tableToVector(recordingData[i].position)
            local point2 = tableToVector(recordingData[i + 1].position)
            point1 = Vector3.new(point1.X, point1.Y + (currentOffset or 0), point1.Z)
            point2 = Vector3.new(point2.X, point2.Y + (currentOffset or 0), point2.Z)
            local delta = point2 - point1
            local distance = delta.Magnitude
            local flatDistance = Vector3.new(delta.X, 0, delta.Z).Magnitude
            local verticalDistance = math.abs(delta.Y)
            local frameA = recordingData[i]
            local frameB = recordingData[i + 1]
            local sameSegment = (frameA and frameB and frameA.autoPerfectSegment == frameB.autoPerfectSegment)
            local isAutoPerfectLine = (frameA and frameA.autoPerfectStableRealFrame) or (frameB and frameB.autoPerfectStableRealFrame)
                or (frameA and frameA.autoPerfectSegment) or (frameB and frameB.autoPerfectSegment)
                or (frameB and (frameB.autoPerfectStableSeam or frameB.autoPerfectNoInterpolateFromPrevious or frameB.autoPerfectHardCut))
            local maxFlat = sameSegment and 55 or 18
            local maxVertical = sameSegment and 32 or 7.75
            local shouldDraw = distance > 0.01
            if isAutoPerfectLine then
                -- Hindari garis lurus panjang antar checkpoint/respawn/seam.
                -- Frame-nya tetap aman dipakai playback, tapi visual line tidak boleh menggambar gap teleport.
                if flatDistance > maxFlat or verticalDistance > maxVertical or distance > 70 then
                    shouldDraw = false
                end
                if frameB and (frameB.autoPerfectNoInterpolateFromPrevious or frameB.autoPerfectHardCut) then
                    shouldDraw = false
                end
            end
            if shouldDraw then
                local linePart = Instance.new("Part")
                linePart.Name = "LineSegment"
                linePart.Size = Vector3.new(0.2, 0.2, distance)
                linePart.CFrame = CFrame.lookAt(point1, point2) * CFrame.new(0, 0, -distance / 2)
                linePart.Anchored = true
                linePart.CanCollide = false
                linePart.CanQuery = false
                linePart.CanTouch = false
                linePart.Material = Enum.Material.Neon
                linePart.Color = getResolvedThemeColor(Color3.fromRGB(0, 170, 255))
                linePart.Parent = folder
            end
        end
    end
    autoPerfectVisualHasStaticLine = true
end

function autoPerfectGetVisualLineFolder(createIfMissing)
    local folder = workspace:FindFirstChild("ArexansVisualLines")
    if not folder and createIfMissing then
        folder = Instance.new("Folder")
        folder.Name = "ArexansVisualLines"
        folder.Parent = workspace
    end
    return folder
end

function autoPerfectGetRealtimeLineColor()
    local now = tick()
    if autoPerfectRealtimeLineCachedColor and (now - (autoPerfectRealtimeLineLastColorAt or 0)) < 0.45 then
        return autoPerfectRealtimeLineCachedColor
    end
    autoPerfectRealtimeLineCachedColor = getResolvedThemeColor(Color3.fromRGB(0, 170, 255))
    autoPerfectRealtimeLineLastColorAt = now
    return autoPerfectRealtimeLineCachedColor
end

function autoPerfectDestroyRealtimeCharacterTrail()
    if autoPerfectRealtimeTrail then
        pcall(function() autoPerfectRealtimeTrail:Destroy() end)
        autoPerfectRealtimeTrail = nil
    end
    if autoPerfectRealtimeTrailAttachment0 then
        pcall(function() autoPerfectRealtimeTrailAttachment0:Destroy() end)
        autoPerfectRealtimeTrailAttachment0 = nil
    end
    if autoPerfectRealtimeTrailAttachment1 then
        pcall(function() autoPerfectRealtimeTrailAttachment1:Destroy() end)
        autoPerfectRealtimeTrailAttachment1 = nil
    end
end

function autoPerfectEnsureRealtimeCharacterTrail()
    if not isVisualLineEnabled then return end
    local now = tick()
    if autoPerfectRealtimeTrail and autoPerfectRealtimeTrail.Parent then return end
    if (now - (autoPerfectRealtimeTrailLastEnsureAt or 0)) < 0.75 then return end
    autoPerfectRealtimeTrailLastEnsureAt = now

    local target = currentRecordingTarget or LocalPlayer
    local character = target and target.Character
    local hrp = character and character:FindFirstChild("HumanoidRootPart")
    if not hrp then return end

    autoPerfectDestroyRealtimeCharacterTrail()

    local a0 = Instance.new("Attachment")
    a0.Name = "ArexansRealtimeLineA"
    a0.Position = Vector3.new(-0.18, -2.35, 0)
    a0.Parent = hrp

    local a1 = Instance.new("Attachment")
    a1.Name = "ArexansRealtimeLineB"
    a1.Position = Vector3.new(0.18, -2.35, 0)
    a1.Parent = hrp

    local trail = Instance.new("Trail")
    trail.Name = "ArexansRealtimeCharacterTrail"
    trail.Attachment0 = a0
    trail.Attachment1 = a1
    trail.FaceCamera = true
    trail.LightEmission = 1
    trail.Lifetime = math.max(3, tonumber(autoPerfectRealtimeTrailLifetime) or 24)
    trail.MinLength = 0.08
    trail.WidthScale = NumberSequence.new(tonumber(autoPerfectRealtimeTrailWidth) or 0.34)
    trail.Color = ColorSequence.new(autoPerfectGetRealtimeLineColor())
    trail.Transparency = NumberSequence.new(0.12)
    trail.Parent = hrp

    autoPerfectRealtimeTrail = trail
    autoPerfectRealtimeTrailAttachment0 = a0
    autoPerfectRealtimeTrailAttachment1 = a1
end

function autoPerfectResetRealtimeLine(keepFolder)
    autoPerfectDestroyRealtimeCharacterTrail()
    autoPerfectRealtimeLineSegments = {}
    autoPerfectRealtimeLineLastPosition = nil
    autoPerfectRealtimeLineLastAppendAt = 0
    autoPerfectLiveLineLastDrawAt = 0
    autoPerfectLiveLineLastFrameCount = 0
    autoPerfectVisualSelectionSignature = ""
    autoPerfectVisualHasStaticLine = false
    if not keepFolder then
        local folder = workspace:FindFirstChild("ArexansVisualLines")
        if folder then folder:Destroy() end
    end
end

function clearVisualLine()
    autoPerfectResetRealtimeLine(false)
end

function autoPerfectAcquireRealtimeLinePart(folder)
    if not folder then return nil end
    local maxSegments = math.max(80, tonumber(isRecording and autoPerfectVisualLiveLineMaxSegments or autoPerfectVisualIdleLineMaxSegments) or tonumber(autoPerfectRealtimeLineMaxSegments) or 900)
    local part = nil
    if type(autoPerfectRealtimeLineSegments) ~= "table" then
        autoPerfectRealtimeLineSegments = {}
    end
    if #autoPerfectRealtimeLineSegments >= maxSegments then
        part = table.remove(autoPerfectRealtimeLineSegments, 1)
        if not (part and part.Parent) then part = nil end
    end
    if not part then
        part = Instance.new("Part")
        part.Name = "LiveLineSegment"
        part.Anchored = true
        part.CanCollide = false
        part.CanQuery = false
        part.CanTouch = false
        part.CastShadow = false
        part.Material = Enum.Material.Neon
    end
    part.Parent = folder
    table.insert(autoPerfectRealtimeLineSegments, part)
    return part
end

function autoPerfectAppendRealtimeLinePosition(position, offset, frameData)
    if not isVisualLineEnabled then return end
    if typeof(position) ~= "Vector3" then return end
    autoPerfectEnsureRealtimeCharacterTrail()

    local previous = autoPerfectRealtimeLineLastPosition
    if not previous then
        autoPerfectRealtimeLineLastPosition = position
        return
    end

    if frameData and (frameData.autoPerfectNoInterpolateFromPrevious or frameData.autoPerfectHardCut) then
        autoPerfectRealtimeLineLastPosition = position
        return
    end

    local now = tick()
    local delta = position - previous
    local distance = delta.Magnitude
    local flatDistance = Vector3.new(delta.X, 0, delta.Z).Magnitude
    local verticalDistance = math.abs(delta.Y)
    local minDistance = tonumber(autoPerfectRealtimeLineMinDistance) or 0.42
    local minInterval = tonumber(autoPerfectRealtimeLineMinInterval) or 0.025

    -- Jangan gambar gap teleport/rollback; reset anchor supaya line tetap sinkron dengan karakter.
    if distance > (tonumber(autoPerfectRealtimeLineHardDistance) or 60)
        or flatDistance > (tonumber(autoPerfectRealtimeLineHardFlat) or 48)
        or verticalDistance > (tonumber(autoPerfectRealtimeLineHardVertical) or 22) then
        autoPerfectRealtimeLineLastPosition = position
        return
    end

    if distance < minDistance and (now - (autoPerfectRealtimeLineLastAppendAt or 0)) < 0.10 then
        return
    end
    if (now - (autoPerfectRealtimeLineLastAppendAt or 0)) < minInterval then
        return
    end

    autoPerfectRealtimeLineLastAppendAt = now
    local folder = autoPerfectGetVisualLineFolder(true)
    local part = autoPerfectAcquireRealtimeLinePart(folder)
    if not part then return end

    local yOffset = tonumber(offset) or 0
    local point1 = Vector3.new(previous.X, previous.Y + yOffset, previous.Z)
    local point2 = Vector3.new(position.X, position.Y + yOffset, position.Z)
    local segmentDelta = point2 - point1
    local segmentDistance = segmentDelta.Magnitude
    if segmentDistance <= 0.01 then return end

    local thickness = tonumber(autoPerfectRealtimeLineThickness) or 0.16
    part.Size = Vector3.new(thickness, thickness, segmentDistance)
    part.CFrame = CFrame.lookAt(point1, point2) * CFrame.new(0, 0, -segmentDistance / 2)
    part.Color = autoPerfectGetRealtimeLineColor()
    part.Transparency = 0.05
    autoPerfectRealtimeLineLastPosition = position
end

function autoPerfectBuildLiveLineFrames(frames, forcedMaxFrames)
    if type(frames) ~= "table" then return {} end
    local count = #frames
    if count <= 2 then return frames end
    local maxFrames = tonumber(forcedMaxFrames) or tonumber(autoPerfectLiveLineMaxFrames) or 260
    if count <= maxFrames then return frames end
    local out = {}
    local step = math.max(1, math.ceil(count / maxFrames))
    for i = 1, count, step do
        local frame = frames[i]
        if frame then table.insert(out, frame) end
    end
    if out[#out] ~= frames[count] then table.insert(out, frames[count]) end
    return out
end

function autoPerfectBuildCappedFinalLineFrames(frames)
    return autoPerfectBuildLiveLineFrames(frames, tonumber(autoPerfectFinalLineMaxFrames) or 1200)
end

function autoPerfectMaybeDrawLiveLine(frames, offset)
    -- v12/v13: live line realtime tanpa redraw full.
    -- Ambil frame terakhir saja, lalu append 1 segment ringan di belakang karakter.
    if not isVisualLineEnabled then return end
    if type(frames) ~= "table" or #frames < 1 then return end
    local frame = frames[#frames]
    local pos = getAutoPerfectFramePosition(frame)
    if not pos then return end
    autoPerfectAppendRealtimeLinePosition(pos, offset or 0, frame)
    autoPerfectLiveLineLastFrameCount = #frames
end

function autoPerfectGetCurrentVisualPosition()
    local target = currentRecordingTarget or LocalPlayer
    local character = target and target.Character
    local hrp = character and character:FindFirstChild("HumanoidRootPart")
    if hrp then return hrp.Position end
    return nil
end

function autoPerfectGetSelectedRecordingForVisual()
    if type(selectedRecordings) ~= "table" or type(savedRecordings) ~= "table" then return nil, nil end
    local selectedNames = {}
    for name, selected in pairs(selectedRecordings or {}) do
        if selected and savedRecordings[name] and type(savedRecordings[name]) == "table" then
            table.insert(selectedNames, name)
        end
    end
    if #selectedNames == 0 then return nil, nil end
    table.sort(selectedNames, naturalCompare)
    local name = selectedNames[1]
    local rec = savedRecordings[name]
    local frames = rec and rec.frames
    if type(frames) ~= "table" or #frames < 2 then return nil, nil end
    return name, rec
end

function autoPerfectMakeVisualSignature(name, rec)
    local frames = rec and rec.frames
    if type(frames) ~= "table" then return "" end
    local first = frames[1] or {}
    local last = frames[#frames] or {}
    return tostring(name or "") .. "|" .. tostring(#frames) .. "|" .. tostring(first.time or 0) .. "|" .. tostring(last.time or 0)

end

function autoPerfectMakePlaybackVisualSignature(frames, offset)
    if type(frames) ~= "table" then return "" end
    local count = #frames
    local first = frames[1] or {}
    local last = frames[count] or {}
    return "playback|" .. tostring(count) .. "|" .. tostring(offset or 0) .. "|" .. tostring(first.time or 0) .. "|" .. tostring(last.time or 0)
end

function autoPerfectSetPlaybackVisualData(recordingData, offset)
    autoPerfectCurrentPlaybackRecordingData = recordingData
    autoPerfectCurrentPlaybackOffset = tonumber(offset) or 0
    autoPerfectVisualPlaybackSignature = ""
end

function autoPerfectDrawPlaybackVisual(force)
    if not isVisualLineEnabled or not (isPlaying or isPaused) then return false end
    local frames = autoPerfectCurrentPlaybackRecordingData
    if type(frames) ~= "table" or #frames < 2 then return false end

    local now = tick()
    local offset = tonumber(autoPerfectCurrentPlaybackOffset) or tonumber(playbackOffset) or 0
    local signature = autoPerfectMakePlaybackVisualSignature(frames, offset)
    if not force and signature == autoPerfectVisualPlaybackSignature and autoPerfectVisualHasStaticLine then
        return true
    end
    if not force and (now - (autoPerfectVisualLastStaticDrawAt or 0)) < (tonumber(autoPerfectVisualPlaybackRedrawInterval) or 0.35) then
        return true
    end

    autoPerfectVisualPlaybackSignature = signature
    autoPerfectVisualSelectionSignature = signature
    autoPerfectVisualLastStaticDrawAt = now
    local lineData = frames
    if type(lineData) == "table" and #lineData > (tonumber(autoPerfectFinalLineMaxFrames) or 1200) then
        lineData = autoPerfectBuildCappedFinalLineFrames(lineData)
    end
    drawVisualLine(lineData, offset)
    autoPerfectVisualHasStaticLine = true
    return true
end

function autoPerfectDrawSelectedStaticVisual(force)
    -- v14: boleh menggambar line saat playback juga. Jangan matikan visual otomatis hanya karena isPlaying/isPaused.
    if not isVisualLineEnabled or isRecording then return false end
    local name, rec = autoPerfectGetSelectedRecordingForVisual()
    if not name or not rec then
        if autoPerfectVisualHasStaticLine then
            autoPerfectResetRealtimeLine(false)
        end
        return false
    end

    local now = tick()
    local signature = autoPerfectMakeVisualSignature(name, rec)
    if not force and signature == autoPerfectVisualSelectionSignature and autoPerfectVisualHasStaticLine then
        return true
    end
    if not force and (now - (autoPerfectVisualLastStaticDrawAt or 0)) < (tonumber(autoPerfectVisualStaticRedrawInterval) or 0.35) then
        return true
    end

    autoPerfectVisualSelectionSignature = signature
    autoPerfectVisualLastStaticDrawAt = now
    local frames = rec.frames
    if type(frames) == "table" and #frames > (tonumber(autoPerfectFinalLineMaxFrames) or 1200) then
        frames = autoPerfectBuildCappedFinalLineFrames(frames)
    end
    drawVisualLine(frames, 0)
    autoPerfectVisualHasStaticLine = true
    return true
end

function autoPerfectRefreshVisualLine(force)
    if not isVisualLineEnabled then return end
    if isRecording then
        autoPerfectVisualHasStaticLine = false
        autoPerfectVisualSelectionSignature = ""
        if type(currentRecordingData) == "table" and #currentRecordingData > 0 then
            autoPerfectMaybeDrawLiveLine(currentRecordingData, 0)
        else
            local pos = autoPerfectGetCurrentVisualPosition()
            if pos then
                if not autoPerfectRealtimeLineLastPosition or force then
                    autoPerfectRealtimeLineLastPosition = pos
                else
                    autoPerfectAppendRealtimeLinePosition(pos, 0, nil)
                end
            end
            autoPerfectEnsureRealtimeCharacterTrail()
        end
        return
    end

    if (isPlaying or isPaused) and autoPerfectDrawPlaybackVisual(force) then return end
    if autoPerfectDrawSelectedStaticVisual(force) then return end

    if autoPerfectVisualIdleFollowEnabled then
        local pos = autoPerfectGetCurrentVisualPosition()
        if pos then
            if force or not autoPerfectRealtimeLineLastPosition then
                autoPerfectResetRealtimeLine(false)
                autoPerfectRealtimeLineLastPosition = pos
            else
                autoPerfectAppendRealtimeLinePosition(pos, 0, nil)
            end
            autoPerfectEnsureRealtimeCharacterTrail()
        end
    end
end

function autoPerfectDisconnectVisualHeartbeat()
    if autoPerfectVisualHeartbeatConnection then
        pcall(function() autoPerfectVisualHeartbeatConnection:Disconnect() end)
        autoPerfectVisualHeartbeatConnection = nil
    end
end

function autoPerfectEnsureVisualHeartbeat()
    if autoPerfectVisualHeartbeatConnection then return end
    autoPerfectVisualHeartbeatConnection = RunService.Heartbeat:Connect(function()
        if not isVisualLineEnabled then return end
        local now = tick()
        if (now - (autoPerfectVisualHeartbeatLastAt or 0)) < (tonumber(autoPerfectVisualHeartbeatInterval) or 0.05) then return end
        autoPerfectVisualHeartbeatLastAt = now
        pcall(function() autoPerfectRefreshVisualLine(false) end)
    end)
end

function setVisualLineEnabledPersistent(enabled, silent)
    isVisualLineEnabled = enabled == true
    if isVisualLineEnabled then
        autoPerfectEnsureVisualHeartbeat()
        autoPerfectRefreshVisualLine(true)
        if not silent then showNotification("Visual Line ON. Line tetap aktif saat idle/rekam/playback.", Color3.fromRGB(50, 200, 50)) end
    else
        autoPerfectDisconnectVisualHeartbeat()
        clearVisualLine()
        if not silent then showNotification("Visual Line OFF.", Color3.fromRGB(200, 150, 50)) end
    end
end

function setRecordingStatusSmooth(text, force, interval)
    if not recStatusLabel then return end
    text = tostring(text or "")
    local now = tick()
    local minInterval = tonumber(interval) or tonumber(autoPerfectStatusInterval) or 0.35
    if force or text ~= autoPerfectLastStatusText or (now - (autoPerfectStatusLastUpdateAt or 0)) >= minInterval then
        recStatusLabel.Text = text
        autoPerfectLastStatusText = text
        autoPerfectStatusLastUpdateAt = now
    end
end

function autoPerfectShouldCheckSummitCounter()
    local now = tick()
    local interval = tonumber(autoPerfectSummitCounterInterval) or 0.45
    if (now - (autoPerfectLastSummitCounterCheckAt or 0)) < interval then return false end
    autoPerfectLastSummitCounterCheckAt = now
    return true
end

function autoPerfectSmoothCloneInterpolatedFrame(frameA, frameB, alpha, timeValue)
    local out = tableClone(frameA or {})
    local posA = getAutoPerfectFramePosition(frameA)
    local posB = getAutoPerfectFramePosition(frameB)
    if posA and posB then
        out.position = vectorToTable(lerpVector3(posA, posB, alpha))
        local dir = normalizeAutoPerfectMoveDirection(posA, posB)
        if dir.Magnitude > 0 then out.moveDirection = vectorToTable(dir) end
    end
    if frameA and frameB and frameA.rotation and frameB.rotation then
        out.rotation = lerpAngle(frameA.rotation or 0, frameB.rotation or 0, alpha)
    end
    if frameA and frameB and frameA.velocity and frameB.velocity then
        out.velocity = vectorToTable(lerpVector3(tableToVector(frameA.velocity), tableToVector(frameB.velocity), alpha))
    end
    out.time = timeValue
    out.state = (alpha >= 0.5 and frameB and frameB.state) or (frameA and frameA.state) or "Running"
    out.jumping = (frameA and frameA.jumping == true) or (frameB and frameB.jumping == true and alpha >= 0.45)
    out.grounded = (frameA and frameA.grounded == true) and (frameB and frameB.grounded == true)
    out.autoPerfectSmoothInserted = true
    out.autoPerfectHardCut = nil
    out.autoPerfectNoInterpolateFromPrevious = nil
    return out
end

function autoPerfectDensifySmoothFrames(frames)
    if type(frames) ~= "table" or #frames < 2 then return frames or {} end
    local interval = 1 / math.max(30, tonumber(autoPerfectSmoothFinalFps) or 60)
    local maxInserted = math.max(1, tonumber(autoPerfectSmoothMaxInsertedPerGap) or 8)
    local maxFinal = math.max(#frames, tonumber(autoPerfectSmoothMaxFinalFrames) or 24000)
    local out = {}
    table.insert(out, tableClone(frames[1]))
    out[1].time = 0
    for i = 2, #frames do
        local prev = frames[i - 1]
        local curr = frames[i]
        local prevOutTime = tonumber(out[#out] and out[#out].time) or 0
        local rawDt = (tonumber(curr and curr.time) or 0) - (tonumber(prev and prev.time) or 0)
        if rawDt <= 0 then rawDt = interval end
        local posA = getAutoPerfectFramePosition(prev)
        local posB = getAutoPerfectFramePosition(curr)
        local distance = (posA and posB) and (posB - posA).Magnitude or 0
        local canInterpolate = curr and not (curr.autoPerfectNoInterpolateFromPrevious or curr.autoPerfectHardCut)
        local steps = 1
        if canInterpolate then
            steps = math.max(1, math.ceil(rawDt / interval))
            if distance > 1.35 then steps = math.max(steps, math.ceil(distance / 1.35)) end
            steps = math.min(steps, maxInserted + 1)
        end
        if canInterpolate and steps > 1 then
            for s = 1, steps - 1 do
                if #out >= maxFinal then break end
                local alpha = s / steps
                table.insert(out, autoPerfectSmoothCloneInterpolatedFrame(prev, curr, alpha, prevOutTime + (rawDt * alpha)))
            end
        end
        if #out >= maxFinal then break end
        local cloned = tableClone(curr)
        cloned.time = prevOutTime + rawDt
        if cloned.time <= prevOutTime then cloned.time = prevOutTime + interval end
        table.insert(out, cloned)
    end
    return out
end


function recordingIsHardCutFrame(frame)
    return frame and (frame.autoPerfectNoInterpolateFromPrevious or frame.autoPerfectHardCut or frame.autoPerfectSeamCut)
end

function recordingCloneFrame(frame)
    local cloned = tableClone(frame or {})
    if frame and type(frame.position) == "table" then cloned.position = tableClone(frame.position) end
    if frame and type(frame.velocity) == "table" then cloned.velocity = tableClone(frame.velocity) end
    if frame and type(frame.moveDirection) == "table" then cloned.moveDirection = tableClone(frame.moveDirection) end
    return cloned
end

function recordingInterpolateFrame(frameA, frameB, alpha, timeValue)
    local out = recordingCloneFrame(frameA or {})
    local posA = getAutoPerfectFramePosition(frameA)
    local posB = getAutoPerfectFramePosition(frameB)
    if posA and posB then
        out.position = vectorToTable(lerpVector3(posA, posB, alpha))
        local flat = Vector3.new(posB.X - posA.X, 0, posB.Z - posA.Z)
        if flat.Magnitude > 0.025 then out.moveDirection = vectorToTable(flat.Unit) end
    end
    if frameA and frameB and frameA.rotation and frameB.rotation then
        out.rotation = lerpAngle(frameA.rotation or 0, frameB.rotation or 0, alpha)
    end
    if frameA and frameB and frameA.velocity and frameB.velocity then
        out.velocity = vectorToTable(lerpVector3(tableToVector(frameA.velocity), tableToVector(frameB.velocity), alpha))
    end
    out.time = timeValue
    out.state = (alpha >= 0.5 and frameB and frameB.state) or (frameA and frameA.state) or "Running"
    out.jumping = (frameA and frameA.jumping == true) or (frameB and frameB.jumping == true and alpha >= 0.45)
    out.grounded = (frameA and frameA.grounded == true) and (frameB and frameB.grounded == true)
    out.floorMaterial = (alpha >= 0.5 and frameB and frameB.floorMaterial) or (frameA and frameA.floorMaterial)
    out.recordingSmoothInsertedV15 = true
    out.autoPerfectNoInterpolateFromPrevious = nil
    out.autoPerfectHardCut = nil
    return out
end

function recordingNormalizeGapDt(rawDt, distance, autoMode)
    local targetInterval = 1 / math.max(30, tonumber(recordingSmoothFinalFps) or 60)
    rawDt = tonumber(rawDt) or targetInterval
    if rawDt <= 0 then return targetInterval end
    if rawDt <= (tonumber(recordingLagSpikeThreshold) or 0.115) then return math.max(targetInterval, rawDt) end

    recordingFrameDropCount = (tonumber(recordingFrameDropCount) or 0) + 1
    local maxGap = tonumber(recordingMaxNormalizedGap) or 0.16
    local speed = tonumber(recordingMaxVelocityForDt) or 24
    local distDt = targetInterval
    if tonumber(distance) and distance > 0.05 then
        distDt = math.clamp(distance / math.max(12, speed), targetInterval, maxGap)
    end
    -- Saat executor/game freeze sebentar, jangan simpan jeda freeze itu ke hasil playback.
    return math.min(rawDt, distDt, maxGap)
end

function recordingRecomputeVelocities(frames)
    if type(frames) ~= "table" or #frames < 2 then return frames or {} end
    for i = 1, #frames - 1 do
        local frame = frames[i]
        local nextFrame = frames[i + 1]
        local posA = getAutoPerfectFramePosition(frame)
        local posB = getAutoPerfectFramePosition(nextFrame)
        local dt = (tonumber(nextFrame and nextFrame.time) or 0) - (tonumber(frame and frame.time) or 0)
        if frame and posA and posB and dt > 0 and not recordingIsHardCutFrame(nextFrame) then
            local delta = posB - posA
            local velocity = delta / dt
            if velocity.Magnitude < 220 then
                frame.velocity = vectorToTable(velocity)
            end
            local flat = Vector3.new(delta.X, 0, delta.Z)
            if flat.Magnitude > 0.025 then
                frame.moveDirection = vectorToTable(flat.Unit)
            end
        end
    end
    if frames[#frames - 1] and frames[#frames] then
        frames[#frames].velocity = frames[#frames].velocity or frames[#frames - 1].velocity
        frames[#frames].moveDirection = frames[#frames].moveDirection or frames[#frames - 1].moveDirection
    end
    return frames
end

function recordingApplyLightSpatialSmooth(frames, autoMode)
    if type(frames) ~= "table" or #frames < 5 then return frames or {} end
    local strength = autoMode and (tonumber(recordingAutoPerfectSpatialStrength) or 0.035) or (tonumber(recordingSmoothSpatialStrength) or 0.08)
    if strength <= 0 then return frames end
    local out = {}
    for i, frame in ipairs(frames) do
        local newFrame = recordingCloneFrame(frame)
        local pos = getAutoPerfectFramePosition(frame)
        local prev = getAutoPerfectFramePosition(frames[i - 1])
        local nextPos = getAutoPerfectFramePosition(frames[i + 1])
        local stateName = tostring(frame and frame.state or "Running")
        local canSmooth = pos and prev and nextPos
            and stateName ~= "Jumping"
            and stateName ~= "Freefall"
            and stateName ~= "Climbing"
            and not recordingIsHardCutFrame(frame)
            and not recordingIsHardCutFrame(frames[i + 1])
        if canSmooth then
            local flatPrev = Vector3.new(prev.X, pos.Y, prev.Z)
            local flatNext = Vector3.new(nextPos.X, pos.Y, nextPos.Z)
            local avg = Vector3.new((flatPrev.X + pos.X + flatNext.X) / 3, pos.Y, (flatPrev.Z + pos.Z + flatNext.Z) / 3)
            local smoothed = lerpVector3(pos, avg, strength)
            newFrame.position = vectorToTable(smoothed)
            newFrame.recordingLightSmoothedV15 = true
        end
        table.insert(out, newFrame)
    end
    return out
end

function optimizeRecordingFramesLowLag(frames, autoMode)
    if type(frames) ~= "table" or #frames < 2 then return frames or {} end
    local targetInterval = 1 / math.max(30, tonumber(recordingSmoothFinalFps) or 60)
    local maxInserted = math.max(1, tonumber(recordingSmoothMaxInsertedPerGap) or 10)
    local maxFinal = math.max(#frames, tonumber(recordingSmoothMaxFinalFrames) or 32000)
    local prepared = {}
    local firstTime = tonumber(frames[1] and frames[1].time) or 0
    local lastRawTime = nil
    local lastPos = nil

    for _, frame in ipairs(frames) do
        if frame and frame.position then
            local pos = getAutoPerfectFramePosition(frame)
            if pos then
                local rawTime = math.max(0, (tonumber(frame.time) or firstTime) - firstTime)
                local keep = (#prepared == 0)
                if not keep then
                    local moved = lastPos and (pos - lastPos).Magnitude or 0
                    local rawAdvanced = (lastRawTime == nil) or rawTime > (lastRawTime + 0.001)
                    keep = rawAdvanced and (moved >= 0.025 or recordingIsHardCutFrame(frame) or tostring(frame.state or "") == "Jumping" or tostring(frame.state or "") == "Freefall")
                end
                if keep then
                    local cloned = recordingCloneFrame(frame)
                    cloned.time = rawTime
                    cloned.recordingAntiLagV15 = true
                    table.insert(prepared, cloned)
                    lastPos = pos
                    lastRawTime = rawTime
                end
            end
        end
    end
    if #prepared < 2 then return prepared end

    local out = {}
    local first = recordingCloneFrame(prepared[1])
    first.time = 0
    table.insert(out, first)

    for i = 2, #prepared do
        if #out >= maxFinal then break end
        local prev = prepared[i - 1]
        local curr = prepared[i]
        local posA = getAutoPerfectFramePosition(prev)
        local posB = getAutoPerfectFramePosition(curr)
        local distance = (posA and posB) and (posB - posA).Magnitude or 0
        local rawDt = (tonumber(curr.time) or 0) - (tonumber(prev.time) or 0)
        local hardCut = recordingIsHardCutFrame(curr)
        local dt = hardCut and targetInterval or recordingNormalizeGapDt(rawDt, distance, autoMode)
        local steps = 1
        if not hardCut then
            if dt > targetInterval * 1.35 then steps = math.max(steps, math.ceil(dt / targetInterval)) end
            if distance > 1.15 then steps = math.max(steps, math.ceil(distance / 1.15)) end
            steps = math.min(steps, maxInserted + 1)
        end
        local outBaseTime = tonumber(out[#out] and out[#out].time) or 0
        if not hardCut and steps > 1 then
            for s = 1, steps - 1 do
                if #out >= maxFinal then break end
                local alpha = s / steps
                table.insert(out, recordingInterpolateFrame(prev, curr, alpha, outBaseTime + (dt * alpha)))
            end
        end
        if #out >= maxFinal then break end
        local cloned = recordingCloneFrame(curr)
        cloned.time = outBaseTime + math.max(targetInterval, dt)
        if hardCut then
            cloned.autoPerfectHardCut = true
            cloned.autoPerfectNoInterpolateFromPrevious = true
        end
        table.insert(out, cloned)
    end

    out = recordingApplyLightSpatialSmooth(out, autoMode == true)
    out = recordingRecomputeVelocities(out)
    for i = 1, #out do
        out[i].recordingSmoothAntiLagV15 = true
        if i == 1 then out[i].time = 0 end
        if i > 1 and (tonumber(out[i].time) or 0) <= (tonumber(out[i - 1].time) or 0) then
            out[i].time = (tonumber(out[i - 1].time) or 0) + targetInterval
        end
    end
    return out
end

function lerp(start, goal, alpha)
    return start + ((goal - start) * alpha)
end

function lerpVector3(start, goal, alpha)
    return Vector3.new(
        lerp(start.X, goal.X, alpha),
        lerp(start.Y, goal.Y, alpha),
        lerp(start.Z, goal.Z, alpha)
    )
end

function lerpAngle(start, goal, alpha)
    local diff = goal - start
    while diff > math.pi do diff = diff - (2 * math.pi) end
    while diff < -math.pi do diff = diff + (2 * math.pi) end
    return start + (diff * alpha)
end

function shouldSamplePosition(currentPosition)
    if not lastRecordedPosition then return true end
    return (currentPosition - lastRecordedPosition).Magnitude >= minSampleDistance
end

function getFrameVelocity(frame, moveState)
    if not frame or not frame.velocity then return Vector3.new(0, 0, 0) end
    local vel = tableToVector(frame.velocity)
    if moveState == "Running" or moveState == nil then vel = Vector3.new(vel.X, 0, vel.Z) end
    return vel
end

function findInterpolationIndices(data, targetTime)
    if #data == 0 then return nil, nil, 0 end
    if targetTime <= data[1].time then return 1, 1, 0 end
    if targetTime >= data[#data].time then return #data, #data, 0 end
    local left, right = 1, #data
    while left < (right - 1) do
        local mid = math.floor((left + right) / 2)
        if data[mid].time <= targetTime then left = mid else right = mid end
    end
    local timeDelta = data[right].time - data[left].time
    local alpha = 0
    if timeDelta > 0 then alpha = math.clamp((targetTime - data[left].time) / timeDelta, 0, 1) end
    return left, right, alpha
end

function getCurrentMoveState(humanoid)
    if not humanoid then return "Running" end
    local state = humanoid:GetState()
    if state == Enum.HumanoidStateType.Climbing then return "Climbing"
    elseif state == Enum.HumanoidStateType.Jumping then return "Jumping"
    elseif state == Enum.HumanoidStateType.Freefall then return "Freefall"
    elseif state == Enum.HumanoidStateType.Swimming then return "Swimming"
    else return "Running" end
end

function saveRecordingsData()
    if not writefile then return false, "Executor tidak mendukung writefile." end
    if type(safeMakeFolder) == "function" then
        safeMakeFolder(SAVE_FOLDER)
    elseif makefolder and isfolder and not isfolder(SAVE_FOLDER) then
        pcall(makefolder, SAVE_FOLDER)
    end
    local ok, jsonData = pcall(function() return HttpService:JSONEncode(savedRecordings or {}) end)
    if not ok then return false, tostring(jsonData) end
    local okWrite, writeErr = pcall(writefile, RECORDING_SAVE_FILE, jsonData)
    return okWrite, writeErr
end

function loadRecordingsData()
    if not (readfile and isfile and isfile(RECORDING_SAVE_FILE)) then return end
    local ok, content = pcall(readfile, RECORDING_SAVE_FILE)
    if not ok or type(content) ~= "string" or content == "" then return end
    local success, decoded = pcall(function() return HttpService:JSONDecode(content) end)
    if success and type(decoded) == "table" then
        savedRecordings = decoded
    end
end

function disconnectAutoPerfectSignals()
    if autoPerfectTouchConnection then autoPerfectTouchConnection:Disconnect(); autoPerfectTouchConnection = nil end
    if autoPerfectDiedConnection then autoPerfectDiedConnection:Disconnect(); autoPerfectDiedConnection = nil end
end

function setAutoPerfectToggleVisual(enabled)
    if autoPerfectToggleSetState then
        pcall(function() autoPerfectToggleSetState(enabled == true, true) end)
    end
end

function isAutoPerfectSummitObject(inst)
    local current = inst
    for _ = 1, 7 do
        if not current then break end
        local name = tostring(current.Name or ""):lower()
        if name:find("summit", 1, true)
            or name:find("puncak", 1, true)
            or name:find("finish", 1, true)
            or name:find("goal", 1, true)
            or name:find("tujuan", 1, true)
            or name:find("winner", 1, true)
            or name:find("victory", 1, true) then
            return true
        end
        current = current.Parent
    end
    return false
end

function isAutoPerfectCheckpointObject(inst)
    local current = inst
    for _ = 1, 7 do
        if not current then break end
        local name = tostring(current.Name or ""):lower()
        if name:find("checkpoint", 1, true)
            or name:find("check point", 1, true)
            or name:find("spawn", 1, true)
            or name:find("respawn", 1, true)
            or name:find("stage", 1, true)
            or name:find("save", 1, true)
            or name:find("flag", 1, true)
            or name == "cp"
            or name:match("^cp[%s_%-%d]+") then
            return true
        end
        current = current.Parent
    end
    return false
end

function isAutoPerfectSummitCounterName(name)
    name = tostring(name or ""):lower()
    return name:find("summit", 1, true) ~= nil or name:find("puncak", 1, true) ~= nil
end

function captureAutoPerfectSummitCounters()
    autoPerfectSummitStartValues = {}
    local leaderstats = LocalPlayer and LocalPlayer:FindFirstChild("leaderstats")
    if not leaderstats then return end
    for _, valueObj in ipairs(leaderstats:GetChildren()) do
        if isAutoPerfectSummitCounterName(valueObj.Name) and (valueObj:IsA("IntValue") or valueObj:IsA("NumberValue")) then
            autoPerfectSummitStartValues[valueObj.Name] = tonumber(valueObj.Value) or 0
        end
    end
end

function hasAutoPerfectSummitCounterIncreased()
    local leaderstats = LocalPlayer and LocalPlayer:FindFirstChild("leaderstats")
    if not leaderstats then return false end
    for _, valueObj in ipairs(leaderstats:GetChildren()) do
        if isAutoPerfectSummitCounterName(valueObj.Name) and (valueObj:IsA("IntValue") or valueObj:IsA("NumberValue")) then
            local current = tonumber(valueObj.Value) or 0
            local startValue = autoPerfectSummitStartValues[valueObj.Name]
            if startValue == nil then
                autoPerfectSummitStartValues[valueObj.Name] = current
            elseif current > startValue then
                return true
            end
        end
    end
    return false
end

function autoPerfectRefreshSummitCache(force)
    local now = tick()
    if (not force) and (now - (autoPerfectLastSummitCacheAt or 0)) < 4.0 then return end
    autoPerfectLastSummitCacheAt = now
    autoPerfectSummitCache = {}
    local checked = 0
    local ok, descendants = pcall(function() return workspace:GetDescendants() end)
    if not ok or type(descendants) ~= "table" then return end
    for _, inst in ipairs(descendants) do
        if inst:IsA("BasePart") and isAutoPerfectSummitObject(inst) then
            table.insert(autoPerfectSummitCache, inst)
            checked = checked + 1
            if checked >= 100 then break end
        end
    end
end

function isNearAutoPerfectSummit(position)
    if not position then return false end
    local now = tick()
    -- Low-Lag v10: cek summit lebih jarang dan pakai cache part, bukan GetDescendants tiap 0.65 detik.
    if (now - autoPerfectLastSummitScan) < 1.15 then return false end
    autoPerfectLastSummitScan = now
    autoPerfectRefreshSummitCache(false)
    for _, inst in ipairs(autoPerfectSummitCache or {}) do
        if inst and inst.Parent and inst:IsA("BasePart") then
            if (inst.Position - position).Magnitude <= math.max(10, (inst.Size.Magnitude * 0.5) + 4) then
                return true
            end
        end
    end
    return false
end

function updateAutoPerfectSafePoint(humanoid, hrp, stateName, sampleTime)
    if not (humanoid and hrp) then return end
    local isGrounded = false
    pcall(function()
        isGrounded = humanoid.FloorMaterial ~= Enum.Material.Air
    end)
    if isGrounded and stateName ~= "Freefall" and stateName ~= "Jumping" and humanoid.Health > 0 then
        autoPerfectLastSafeTime = math.max(0, tonumber(sampleTime) or currentSampleTime or 0)
        autoPerfectLastGroundY = hrp.Position.Y
        autoPerfectRecovery.lastSafePosition = hrp.Position
        autoPerfectRecovery.freefallStartedAt = nil
    elseif stateName ~= "Freefall" then
        autoPerfectRecovery.freefallStartedAt = nil
    end
end

function shouldAutoPerfectCutForFall(humanoid, hrp, stateName, velocity)
    if not autoPerfectSessionActive or not (humanoid and hrp) then return false end
    if humanoid.Health <= 0 then return true end

    -- v5: Freefall/drop jauh BUKAN kegagalan.
    -- Banyak map Roblox punya jalur turun, trampolin, dropper, atau objek di bawah.
    -- Rekaman hanya dipotong saat benar-benar mati/respawn atau ada teleport rollback ke checkpoint.
    if stateName == "Freefall" then
        autoPerfectRecovery.freefallStartedAt = autoPerfectRecovery.freefallStartedAt or tick()
    else
        autoPerfectRecovery.freefallStartedAt = nil
    end
    return false
end

function shouldAutoPerfectCutForRollbackTeleport(hrp, humanoid, stateName)
    if not autoPerfectSessionActive or not (hrp and humanoid) then return false end
    if humanoid.Health <= 0 then return true end

    local previousPosition = autoPerfectLastObservedPosition or lastRecordedPosition
    if not previousPosition then return false end

    local currentPosition = hrp.Position
    local delta = currentPosition - previousPosition
    local flatDelta = Vector3.new(delta.X, 0, delta.Z).Magnitude
    local verticalDelta = math.abs(delta.Y)
    local totalDelta = delta.Magnitude
    -- v12: checkpoint rollback tidak selalu jauh. Turunkan ambang, tapi tetap harus berupa snap instant
    -- lalu dikonfirmasi dekat checkpoint/frame lama agar drop/jump normal tidak ikut dipotong.
    local looksLikeInstantJump = (totalDelta >= 16 and (flatDelta >= 10 or verticalDelta >= 10))
    if not looksLikeInstantJump then return false end

    local checkpointPosition = autoPerfectRecovery.lastCheckpointPosition or autoPerfectRecovery.lastTouchedCheckpointPosition
    if checkpointPosition then
        local radius = math.max(10, autoPerfectCheckpointRadius)
        local currentNearCheckpoint = (currentPosition - checkpointPosition).Magnitude <= radius
        local previousNearCheckpoint = (previousPosition - checkpointPosition).Magnitude <= radius
        if currentNearCheckpoint and not previousNearCheckpoint then
            return true
        end
    end

    -- v11: beberapa map tidak menamai checkpoint dengan jelas, jadi rollback tidak selalu punya checkpointPosition.
    -- Deteksi tambahan: posisi tiba-tiba meloncat besar lalu kembali dekat jalur/frame lama.
    -- Jatuh biasa tidak kena aturan ini karena jatuh bergerak bertahap, bukan snap instant ke posisi lama.
    if type(currentRecordingData) == "table" and #currentRecordingData > 55 then
        local searchUntil = math.max(1, #currentRecordingData - 42)
        local searchStart = math.max(1, searchUntil - 4200)
        local step = math.max(1, math.floor((searchUntil - searchStart + 1) / 700))
        for i = searchUntil, searchStart, -step do
            local pos = getAutoPerfectFramePosition(currentRecordingData[i])
            if pos then
                local oldDelta = currentPosition - pos
                local oldFlat = Vector3.new(oldDelta.X, 0, oldDelta.Z).Magnitude
                local oldVertical = math.abs(oldDelta.Y)
                if oldFlat <= 13.5 and oldVertical <= 9.5 then
                    autoPerfectRecovery.lastCheckpointPosition = pos
                    autoPerfectRecovery.lastCheckpointFrame = tableClone(currentRecordingData[i])
                    autoPerfectRecovery.lastCheckpointTime = tonumber(currentRecordingData[i].time) or autoPerfectRecovery.lastCheckpointTime or 0
                    return true
                end
            end
        end
    end

    return false
end

function getAutoPerfectFramePosition(frame)
    if not (frame and frame.position) then return nil end
    return tableToVector(frame.position)
end

function rememberAutoPerfectSafeFrame(frame, explicitCheckpoint)
    if not autoPerfectSessionActive or type(frame) ~= "table" or not frame.position then return end
    local stateName = tostring(frame.state or "Running")
    if stateName == "Freefall" or stateName == "FallingDown" or stateName == "Dead" then return end
    local pos = getAutoPerfectFramePosition(frame)
    if not pos then return end

    autoPerfectRecovery.lastSafeFrame = tableClone(frame)
    autoPerfectRecovery.lastSafePosition = pos
    autoPerfectRecovery.lastSafeFrameTime = tonumber(frame.time) or autoPerfectRecovery.lastSafeFrameTime or 0

    local touchedCheckpoint = autoPerfectRecovery.lastTouchedCheckpointPosition
        and (tick() - (autoPerfectRecovery.lastTouchedCheckpointAt or 0)) <= 2.5
        and (pos - autoPerfectRecovery.lastTouchedCheckpointPosition).Magnitude <= math.max(10, autoPerfectCheckpointRadius)

    if explicitCheckpoint or touchedCheckpoint or not autoPerfectRecovery.lastCheckpointFrame then
        autoPerfectRecovery.lastCheckpointFrame = tableClone(frame)
        autoPerfectRecovery.lastCheckpointPosition = pos
        autoPerfectRecovery.lastCheckpointTime = tonumber(frame.time) or autoPerfectRecovery.lastCheckpointTime or 0
    end
end

function getAutoPerfectRollbackPosition()
    return autoPerfectRecovery.lastCheckpointPosition or autoPerfectRecovery.lastSafePosition
end

function teleportAutoPerfectBackToCheckpoint(reason)
    if not autoPerfectRecovery.teleportBackOnFall then return false end
    local rollbackPosition = getAutoPerfectRollbackPosition()
    if not rollbackPosition then return false end
    local char = LocalPlayer and LocalPlayer.Character
    local hrp = char and char:FindFirstChild("HumanoidRootPart")
    local humanoid = char and char:FindFirstChildOfClass("Humanoid")
    if not (hrp and humanoid and humanoid.Health > 0) then return false end

    local _, yRotation, _ = hrp.CFrame:ToOrientation()
    pcall(function()
        hrp.CFrame = CFrame.new(rollbackPosition.X, rollbackPosition.Y + autoPerfectRecovery.fallTeleportYOffset, rollbackPosition.Z) * CFrame.Angles(0, yRotation, 0)
        hrp.AssemblyLinearVelocity = Vector3.zero
        hrp.AssemblyAngularVelocity = Vector3.zero
        hrp.Velocity = Vector3.zero
        hrp.RotVelocity = Vector3.zero
        humanoid.PlatformStand = false
        humanoid:Move(Vector3.zero, false)
        humanoid:ChangeState(Enum.HumanoidStateType.GettingUp)
    end)
    return true
end

function normalizeAutoPerfectMoveDirection(fromPos, toPos)
    local delta = toPos - fromPos
    local flat = Vector3.new(delta.X, 0, delta.Z)
    if flat.Magnitude <= 0.001 then return Vector3.new(0, 0, 0) end
    return flat.Unit
end

function getAutoPerfectJoinStats(fromPos, toPos)
    if not (fromPos and toPos) then return math.huge, math.huge, math.huge end
    local delta = toPos - fromPos
    local flatDistance = Vector3.new(delta.X, 0, delta.Z).Magnitude
    local verticalDistance = math.abs(delta.Y)
    return flatDistance, verticalDistance, delta.Magnitude
end

function getAutoPerfectFrameSpeed(frame)
    local base = tonumber(autoPerfectRecordedBaseWalkSpeed) or autoPerfectNormalWalkSpeed
    local raw = tonumber(frame and frame.walkSpeed) or base
    local minSpeed = math.max(8, base - 1.5)
    local maxSpeed = math.min(24, base + 1.5)
    if maxSpeed < minSpeed then maxSpeed = minSpeed end
    return math.clamp(raw, minSpeed, maxSpeed)
end

function shouldUseNaturalAutoPerfectPlayback(recordingObject)
    if type(recordingObject) ~= "table" then return false end
    return recordingObject.autoPerfectNaturalAirborneV18 == true
        or recordingObject.autoPerfectManualLikeV17 == true
        or recordingObject.playbackLikeNormalRecording == true
        or recordingObject.autoPerfectNormalResultV17 == true
end

function getSafeStateChangeCooldown()
    return tonumber(STATE_CHANGE_COOLDOWN) or 0.06
end

function getAutoPerfectPlaybackTimingMultiplier(recordingObject, frames)
    -- Repair playback untuk rekaman Auto Perfect lama yang sudah tersimpan sebelum Timing Fix v16.
    -- Rekaman baru diberi autoPerfectTimingFixedV16 sehingga tidak disentuh.
    if not (recordingObject and recordingObject.autoPerfect == true) then return 1 end
    if recordingObject.autoPerfectTimingFixedV16 == true then return 1 end
    if type(frames) ~= "table" or #frames < 8 then return 1 end

    local duration = tonumber(frames[#frames] and frames[#frames].time) or 0
    if duration <= 0 then return 1 end

    local insertedCount = 0
    local estimatedDuration = 0
    local validGaps = 0

    for i = 2, #frames do
        local prev = frames[i - 1]
        local curr = frames[i]
        if type(curr) == "table" and (curr.autoPerfectSmoothInserted or curr.recordingSmoothInsertedV15) then
            insertedCount = insertedCount + 1
        end

        if not recordingIsHardCutFrame(curr) then
            local posA = getAutoPerfectFramePosition(prev)
            local posB = getAutoPerfectFramePosition(curr)
            if posA and posB then
                local delta = posB - posA
                local flat = Vector3.new(delta.X, 0, delta.Z).Magnitude
                local vertical = math.abs(delta.Y)
                local distanceForTiming = math.max(flat, vertical * 0.45)
                if distanceForTiming > 0.01 then
                    local speed = tonumber(prev and prev.walkSpeed) or tonumber(curr and curr.walkSpeed) or tonumber(autoPerfectRecordedBaseWalkSpeed) or 16
                    speed = math.clamp(speed, 8, 24)
                    local gapEstimate = distanceForTiming / speed
                    estimatedDuration = estimatedDuration + math.clamp(gapEstimate, 1 / 120, 0.14)
                    validGaps = validGaps + 1
                end
            end
        end
    end

    local insertedRatio = insertedCount / math.max(1, #frames)
    if insertedRatio < 0.18 or validGaps < 6 or estimatedDuration <= 0 then return 1 end

    local multiplier = duration / estimatedDuration
    -- Hanya koreksi jika memang jelas terlalu lambat. Clamp supaya tidak jadi terlalu cepat.
    if multiplier > 1.25 then
        return math.clamp(multiplier, 1, 4)
    end
    return 1
end

function canAutoPerfectJoinNormally(prevFrame, nextFrame)
    local prevPos = getAutoPerfectFramePosition(prevFrame)
    local nextPos = getAutoPerfectFramePosition(nextFrame)
    if not (prevPos and nextPos) then return false end
    local flatDistance, verticalDistance = getAutoPerfectJoinStats(prevPos, nextPos)
    if flatDistance <= autoPerfectJoinSnapRadius and verticalDistance <= autoPerfectMaxGroundJoinVerticalGap then
        return true
    end
    local nextState = tostring(nextFrame and nextFrame.state or "Running")
    local looksLikeNormalJump = (nextState == "Jumping" or nextState == "Climbing")
        and flatDistance <= autoPerfectMaxGroundJoinFlatGap
        and verticalDistance <= autoPerfectMaxGroundJoinVerticalGap
    return looksLikeNormalJump
end

function isAutoPerfectDiscontinuity(prevFrame, nextFrame)
    local prevPos = getAutoPerfectFramePosition(prevFrame)
    local nextPos = getAutoPerfectFramePosition(nextFrame)
    if not (prevPos and nextPos) then return false end
    local flatDistance, verticalDistance = getAutoPerfectJoinStats(prevPos, nextPos)
    if flatDistance >= autoPerfectDiscontinuityFlatGap then return true end
    if verticalDistance >= autoPerfectDiscontinuityVerticalGap then return true end
    return false
end

function findClosestAutoPerfectFrameIndex(frames, targetPosition, maxDistance, preferLast)
    if type(frames) ~= "table" or not targetPosition then return nil, math.huge end
    local bestIndex, bestDistance = nil, math.huge
    local startIndex, endIndex, step = 1, #frames, 1
    if preferLast then
        startIndex, endIndex, step = #frames, 1, -1
    end
    local i = startIndex
    local loopCounter = 0
    -- OPTIMIZATION: limit max search depth during active recording to prevent lag spikes
    local maxSearchFrames = 3000
    local framesSearched = 0
    
    while (step > 0 and i <= endIndex) or (step < 0 and i >= endIndex) do
        loopCounter = loopCounter + 1
        framesSearched = framesSearched + 1
        -- Yield less frequently, but guarantee we don't freeze the client
        if loopCounter % 2000 == 0 then task.wait() end
        if framesSearched > maxSearchFrames then break end
        
        local pos = getAutoPerfectFramePosition(frames[i])
        if pos then
            local distance = (pos - targetPosition).Magnitude
            if distance < bestDistance then
                bestIndex, bestDistance = i, distance
                if distance <= (maxDistance or autoPerfectCheckpointRadius) then
                    -- Saat preferLast aktif, index pertama yang ditemukan dari belakang adalah titik aman terakhir.
                    if preferLast then return bestIndex, bestDistance end
                end
            end
        end
        i = i + step
    end
    if bestIndex and bestDistance <= (maxDistance or autoPerfectCheckpointRadius) then
        return bestIndex, bestDistance
    end
    return nil, bestDistance
end

function trimAutoPerfectFailureFramesToRollback(frames, rollbackPosition)
    if type(frames) ~= "table" or #frames < 1 then return {} end
    local cutIndex = nil
    local cutDistance = math.huge

    if rollbackPosition then
        cutIndex, cutDistance = findClosestAutoPerfectFrameIndex(frames, rollbackPosition, math.max(8, autoPerfectJoinAnchorRadius), false)
    end

    if not cutIndex then
        local safeLimit = tonumber(autoPerfectRecovery.lastSafeFrameTime) or tonumber(autoPerfectLastSafeTime) or 0
        for i = #frames, 1, -1 do
            local frame = frames[i]
            local frameTime = tonumber(frame and frame.time) or 0
            local stateName = tostring(frame and frame.state or "Running")
            if stateName ~= "Freefall" and stateName ~= "FallingDown" and stateName ~= "Dead" and (safeLimit <= 0 or frameTime <= safeLimit + 0.15) then
                cutIndex = i
                break
            end
        end
    end

    if not cutIndex then return {} end

    local out = {}
    for i = 1, cutIndex do
        local frame = frames[i]
        local stateName = tostring(frame and frame.state or "Running")
        if frame and frame.position and stateName ~= "Freefall" and stateName ~= "FallingDown" and stateName ~= "Dead" then
            table.insert(out, tableClone(frame))
        end
    end
    return out
end

function appendAutoPerfectBridgeIfNeeded(firstNewFrame)
    -- No-Magnet mode: jangan membuat bridge/connector otomatis pada data gabungan.
    -- Hasil akhir tetap diambil dari rawSegments yang berisi frame asli rekaman.
    return true
end

function appendAutoPerfectFrames(frames, cutBeforeFailure, checkpointPosition)
    if type(frames) ~= "table" or #frames < 1 then return 0 end

    local cutTime = frames[#frames].time or 0
    if cutBeforeFailure then
        local checkpointIndex = nil
        if checkpointPosition then
            checkpointIndex = select(1, findClosestAutoPerfectFrameIndex(frames, checkpointPosition, autoPerfectCheckpointRadius, false))
        end

        if checkpointIndex and frames[checkpointIndex] then
            local checkpointTime = tonumber(frames[checkpointIndex].time) or 0
            local segmentDuration = tonumber(frames[#frames] and frames[#frames].time) or 0
            if checkpointTime >= math.min(0.25, math.max(0.05, segmentDuration * 0.01)) then
                cutTime = checkpointTime
            else
                checkpointIndex = nil
            end
        end

        if not checkpointIndex then
            local safeIndex = nil
            local safeLimit = tonumber(autoPerfectLastSafeTime) or 0
            for i = #frames, 1, -1 do
                local frame = frames[i]
                local frameTime = tonumber(frame and frame.time) or 0
                local stateName = tostring(frame and frame.state or "Running")
                local isSafeState = stateName ~= "Freefall" and stateName ~= "FallingDown" and stateName ~= "Dead"
                if isSafeState and (safeLimit <= 0 or frameTime <= safeLimit + 0.15) then
                    safeIndex = i
                    break
                end
            end
            if safeIndex and frames[safeIndex] then
                cutTime = math.max(0, (tonumber(frames[safeIndex].time) or 0) - 0.05)
            else
                cutTime = math.max(0, (tonumber(frames[#frames].time) or 0) - autoPerfectSafeCutSeconds)
            end
        end
    end

    local cleanFrames = {}
    for _, frame in ipairs(frames) do
        if frame and tonumber(frame.time) and tonumber(frame.time) <= cutTime then
            local stateName = tostring(frame.state or "Running")
            if not (cutBeforeFailure and (stateName == "Freefall" or stateName == "FallingDown" or stateName == "Dead")) then
                table.insert(cleanFrames, frame)
            end
        end
    end
    if #cleanFrames < 1 then return 0 end

    if #autoPerfectCombinedFrames > 0 and #cleanFrames > 1 then
        local lastPos = getAutoPerfectFramePosition(autoPerfectCombinedFrames[#autoPerfectCombinedFrames])
        while #cleanFrames > 1 do
            local firstPos = getAutoPerfectFramePosition(cleanFrames[1])
            if lastPos and firstPos and (firstPos - lastPos).Magnitude <= 0.25 then
                table.remove(cleanFrames, 1)
            else
                break
            end
        end
    end
    if #cleanFrames < 1 then return 0 end

    autoPerfectSegmentCount = autoPerfectSegmentCount + 1

    local rawSegment = {}
    for _, rawFrame in ipairs(cleanFrames) do
        local rawCopy = tableClone(rawFrame)
        rawCopy.autoPerfectCutBeforeFailure = (cutBeforeFailure == true)
        rawCopy.autoPerfectFinalAttempt = (cutBeforeFailure ~= true)
        rawCopy.autoPerfectCheckpointRollback = (checkpointPosition ~= nil)
        table.insert(rawSegment, rawCopy)
    end
    if #rawSegment > 0 then
        rawSegment.autoPerfectCutBeforeFailure = (cutBeforeFailure == true)
        rawSegment.autoPerfectFinalAttempt = (cutBeforeFailure ~= true)
        rawSegment.autoPerfectCheckpointRollback = (checkpointPosition ~= nil)
        table.insert(autoPerfectRawSegments, rawSegment)
    end

    appendAutoPerfectBridgeIfNeeded(cleanFrames[1])

    local segmentStartTime = tonumber(cleanFrames[1].time) or 0
    local outputOffset = 0
    if #autoPerfectCombinedFrames > 0 then
        outputOffset = (tonumber(autoPerfectCombinedFrames[#autoPerfectCombinedFrames].time) or 0) + SAMPLE_INTERVAL
    end

    local appended = 0
    for _, frame in ipairs(cleanFrames) do
        local newFrame = tableClone(frame)
        newFrame.time = math.max(0, (tonumber(frame.time) or 0) - segmentStartTime) + outputOffset
        newFrame.autoPerfectSegment = autoPerfectSegmentCount
        if #autoPerfectCombinedFrames == 0 or newFrame.time > (tonumber(autoPerfectCombinedFrames[#autoPerfectCombinedFrames].time) or -1) then
            table.insert(autoPerfectCombinedFrames, newFrame)
            appended = appended + 1
        end
    end
    return appended
end

function copyAutoPerfectFrame(frame)
    local cloned = tableClone(frame or {})
    if frame and type(frame.position) == "table" then cloned.position = tableClone(frame.position) end
    if frame and type(frame.velocity) == "table" then cloned.velocity = tableClone(frame.velocity) end
    if frame and type(frame.moveDirection) == "table" then cloned.moveDirection = tableClone(frame.moveDirection) end
    return cloned
end

function getAutoPerfectFlatDistance(a, b)
    if not (a and b) then return math.huge end
    local delta = a - b
    return Vector3.new(delta.X, 0, delta.Z).Magnitude
end

function removeAutoPerfectFailedLoops(frames)
    if type(frames) ~= "table" or #frames < 2 then return frames or {} end
    -- Konservatif: jangan hapus loop panjang/switchback alami karena itu bisa membuat hasil Auto Perfect terlalu singkat.
    -- Hanya bersihkan frame yang benar-benar duplikat/bergetar di titik yang sama.
    local clean = {}
    local lastPos = nil
    for _, frame in ipairs(frames) do
        local pos = getAutoPerfectFramePosition(frame)
        if pos then
            if not lastPos or (pos - lastPos).Magnitude >= 0.04 then
                table.insert(clean, copyAutoPerfectFrame(frame))
                lastPos = pos
            end
        end
    end
    return clean
end


function smoothAutoPerfectFrames(frames)
    if type(frames) ~= "table" or #frames < 5 then return frames or {} end
    local smoothed = {}
    for i, frame in ipairs(frames) do
        local newFrame = copyAutoPerfectFrame(frame)
        local stateName = tostring(frame.state or "Running")
        local currentPos = getAutoPerfectFramePosition(frame)
        local prevPos = getAutoPerfectFramePosition(frames[i - 1])
        local nextPos = getAutoPerfectFramePosition(frames[i + 1])
        local canSmooth = currentPos and prevPos and nextPos
            and stateName ~= "Jumping"
            and stateName ~= "Freefall"
            and not frame.autoPerfectAnchor
            and not frame.autoPerfectBridge
        if canSmooth then
            local avg = Vector3.new(
                (prevPos.X + currentPos.X + nextPos.X) / 3,
                currentPos.Y,
                (prevPos.Z + currentPos.Z + nextPos.Z) / 3
            )
            local outPos = lerpVector3(currentPos, avg, autoPerfectSmoothStrength)
            newFrame.position = vectorToTable(outPos)
        end
        table.insert(smoothed, newFrame)
    end
    return smoothed
end

function getAutoPerfectGroundedConnectorY(position, fallbackY, hipHeight)
    if not position then return fallbackY end
    local desiredY = tonumber(fallbackY) or position.Y
    local okParams, params = pcall(function()
        local rayParams = RaycastParams.new()
        rayParams.FilterType = Enum.RaycastFilterType.Blacklist
        local ignore = {}
        if LocalPlayer and LocalPlayer.Character then table.insert(ignore, LocalPlayer.Character) end
        local lineFolder = workspace and workspace:FindFirstChild("ArexansVisualLines")
        if lineFolder then table.insert(ignore, lineFolder) end
        rayParams.FilterDescendantsInstances = ignore
        return rayParams
    end)
    local origin = Vector3.new(position.X, desiredY + 55, position.Z)
    local direction = Vector3.new(0, -120, 0)
    local okRay, result = pcall(function()
        if okParams and params then
            return workspace:Raycast(origin, direction, params)
        end
        return workspace:Raycast(origin, direction)
    end)
    if okRay and result and result.Position then
        local rootOffset = (tonumber(hipHeight) or 2) + 1.65
        local candidateY = result.Position.Y + rootOffset
        -- Pakai hasil raycast hanya bila masuk akal. Jika terlalu jauh, tetap pakai Y rekaman agar tidak nyangkut di objek aneh.
        if math.abs(candidateY - desiredY) <= 9.5 then
            return candidateY
        end
    end
    return desiredY
end


function buildAutoPerfectNormalConnectorFrames(fromFrame, toFrame)
    -- Normal mode: jangan membuat frame sambungan sintetis.
    -- Connector buatan adalah penyebab gerakan terlihat kaku, melayang, atau seperti ditarik magnet.
    return {}
end


function appendAutoPerfectNormalConnector(outputFrames, nextFrame)
    -- Normal mode: tidak menambahkan connector buatan.
    return 0
end


function insertAutoPerfectNormalGapFrames(outputFrames, nextFrame)
    -- Normal mode: biarkan stitching memilih seam asli. Jangan isi gap dengan jalur buatan.
    return 0
end


function retimeAutoPerfectFrames(frames)
    if type(frames) ~= "table" or #frames < 1 then return {} end

    -- Normal Motion v3:
    -- Pertahankan timing, velocity, state, rotasi, dan jump asli dari rekaman.
    -- Yang diubah hanya waktu agar monoton setelah segmen gagal dipotong.
    -- Tidak ada perhitungan ulang velocity/jump yang membuat gerakan kaku.
    local output = {}
    local outputTime = 0
    local previousOriginalTime = nil
    local previousOutputFrame = nil

    for i, frame in ipairs(frames) do
        if frame and frame.position then
            local newFrame = copyAutoPerfectFrame(frame)
            local stateName = tostring(newFrame.state or "Running")
            if stateName == "FallingDown" or stateName == "Dead" then
                stateName = "Running"
            end
            newFrame.state = stateName
            newFrame.jumping = (stateName == "Jumping") or (newFrame.jumping == true)
            newFrame.walkSpeed = getAutoPerfectFrameSpeed(newFrame)
            newFrame.autoPerfectConnector = nil
            newFrame.autoPerfectBridge = nil
            newFrame.autoPerfectGroundedBridge = nil
            newFrame.autoPerfectNormalMotion = true
            newFrame.autoPerfectSingleLine = true

            if #output == 0 then
                newFrame.time = 0
                outputTime = 0
            else
                local originalTime = tonumber(frame.time) or 0
                local rawDt = nil
                if previousOriginalTime ~= nil and originalTime > previousOriginalTime then
                    rawDt = originalTime - previousOriginalTime
                end
                local dt = rawDt or SAMPLE_INTERVAL
                -- Saat ganti segmen, waktu asli biasanya reset. Kompres seam tanpa membuat interpolasi panjang.
                if not rawDt or dt <= 0 or dt > 0.45 then
                    dt = SAMPLE_INTERVAL
                    newFrame.autoPerfectSeamCut = true
                end

                local prevPos = getAutoPerfectFramePosition(previousOutputFrame)
                local pos = getAutoPerfectFramePosition(newFrame)
                if prevPos and pos then
                    local flatDistance, verticalDistance = getAutoPerfectJoinStats(prevPos, pos)
                    -- Jangan membuat karakter berjalan di udara melewati gap besar.
                    -- Tandai hard cut agar playback tidak melakukan lerp panjang antarsegmen.
                    if flatDistance > 26 or verticalDistance > 10 then
                        dt = SAMPLE_INTERVAL
                        newFrame.autoPerfectHardCut = true
                        newFrame.autoPerfectNoInterpolateFromPrevious = true
                    end
                end

                outputTime = outputTime + math.clamp(dt, SAMPLE_INTERVAL, 0.22)
                newFrame.time = outputTime
            end

            table.insert(output, newFrame)
            previousOriginalTime = tonumber(frame.time) or previousOriginalTime
            previousOutputFrame = newFrame
        end
    end
    return output
end

function isAutoPerfectBadFrame(frame)
    if type(frame) ~= "table" then return true end
    if frame.autoPerfectBridge then return true end
    if not frame.position then return true end
    local stateName = tostring(frame.state or "Running")
    if stateName == "FallingDown" or stateName == "Dead" then return true end
    return false
end

function getAutoPerfectRouteDirectionFromSegments(segments)
    local firstPos, lastPos = nil, nil
    if type(segments) == "table" then
        for _, segment in ipairs(segments) do
            if type(segment) == "table" then
                for _, frame in ipairs(segment) do
                    local pos = getAutoPerfectFramePosition(frame)
                    if pos then
                        firstPos = firstPos or pos
                        lastPos = pos
                    end
                end
            end
        end
    end
    if not (firstPos and lastPos) then return nil end
    local flat = Vector3.new(lastPos.X - firstPos.X, 0, lastPos.Z - firstPos.Z)
    if flat.Magnitude <= 1 then return nil end
    return flat.Unit
end

function sanitizeAutoPerfectSegment(segment)
    local out = {}
    local lastPos = nil
    if type(segment) ~= "table" then return out end
    for _, frame in ipairs(segment) do
        if not isAutoPerfectBadFrame(frame) then
            local newFrame = copyAutoPerfectFrame(frame)
            local pos = getAutoPerfectFramePosition(newFrame)
            if pos then
                local keep = true
                if lastPos then
                    local flatDistance, verticalDistance = getAutoPerfectJoinStats(lastPos, pos)
                    -- Buang frame teleport/respawn di dalam segmen. Gerakan normal Roblox tidak meloncat Y sangat jauh dalam satu sample.
                    if verticalDistance >= autoPerfectDiscontinuityVerticalGap and flatDistance <= autoPerfectMaxGroundJoinFlatGap then
                        keep = false
                    end
                end
                if keep and (not lastPos or (pos - lastPos).Magnitude >= 0.035) then
                    local stateName = tostring(newFrame.state or "Running")
                    if stateName == "FallingDown" or stateName == "Dead" then
                        stateName = "Running"
                    end
                    newFrame.state = stateName
                    newFrame.jumping = (stateName == "Jumping") or (newFrame.jumping == true)
                    newFrame.walkSpeed = getAutoPerfectFrameSpeed(newFrame)
                    newFrame.autoPerfectBridge = nil
                    newFrame.autoPerfectGroundedBridge = nil
                    newFrame.autoPerfectFinalClean = true
                    table.insert(out, newFrame)
                    lastPos = pos
                end
            end
        end
    end
    return out
end

function segmentsFromAutoPerfectCombined(frames)
    local segments, current, lastSegmentId = {}, {}, nil
    if type(frames) ~= "table" then return segments end
    for _, frame in ipairs(frames) do
        if not frame.autoPerfectBridge then
            local sid = frame.autoPerfectSegment or 1
            if lastSegmentId ~= nil and sid ~= lastSegmentId and #current > 0 then
                table.insert(segments, current)
                current = {}
            end
            table.insert(current, frame)
            lastSegmentId = sid
        end
    end
    if #current > 0 then table.insert(segments, current) end
    return segments
end

function getAutoPerfectForwardBonus(segment, index, routeDir)
    if not routeDir then return 0 end
    local pos = getAutoPerfectFramePosition(segment[index])
    if not pos then return 0 end
    local lookIndex = math.min(#segment, index + 18)
    local nextPos = getAutoPerfectFramePosition(segment[lookIndex])
    if not nextPos then return 0 end
    local delta = Vector3.new(nextPos.X - pos.X, 0, nextPos.Z - pos.Z)
    if delta.Magnitude <= 0.1 then return 0 end
    return delta.Unit:Dot(routeDir)
end


function findAutoPerfectCheckpointSeam(outputFrames, nextSegment, routeDir)
    if type(outputFrames) ~= "table" or #outputFrames < 1 or type(nextSegment) ~= "table" or #nextSegment < 1 then return nil end
    -- Cari seam dari awal segmen respawn/checkpoint ke SELURUH jalur sebelumnya.
    -- Ini membuang jalur gagal dengan memotong balik ke checkpoint asli, bukan membuat connector buatan.
    local best = nil
    local earlyLimit = math.min(#nextSegment, 80)
    local outputStep = math.max(1, math.floor(#outputFrames / 1800))
    local loopCounter = 0
    for j = 1, earlyLimit do
        local bPos = getAutoPerfectFramePosition(nextSegment[j])
        if bPos then
            for i = #outputFrames, 1, -outputStep do
                loopCounter = loopCounter + 1
                if loopCounter % 10000 == 0 then task.wait() end
                local aPos = getAutoPerfectFramePosition(outputFrames[i])
                if aPos then
                    local flatDistance, verticalDistance = getAutoPerfectJoinStats(aPos, bPos)
                    if flatDistance <= 18 and verticalDistance <= 7 then
                        local forward = getAutoPerfectForwardBonus(nextSegment, j, routeDir)
                        local rollbackFrames = #outputFrames - i
                        local score = flatDistance + (verticalDistance * 5.5) + (j * 0.08) + (rollbackFrames * 0.015)
                        if forward < -0.35 then score = score + 20 end
                        if (not best) or score < best.score then
                            best = {i = i, j = j, score = score, flat = flatDistance, vertical = verticalDistance, rollback = rollbackFrames, skipped = j - 1, checkpoint = true}
                        end
                    end
                end
            end
        end
    end
    return best
end

function findAutoPerfectBestSeam(outputFrames, nextSegment, routeDir, strict)
    if type(outputFrames) ~= "table" or #outputFrames < 1 or type(nextSegment) ~= "table" or #nextSegment < 1 then return nil end
    -- Normal Motion v3: seam harus berasal dari frame asli yang dekat.
    -- Jangan memilih seam yang membuat connector sintetis atau skip terlalu banyak frame berhasil.
    local maxFlat = strict and 6.5 or 12.5
    local maxVertical = strict and 3.75 or 5.5
    local rollbackLimit = strict and autoPerfectRecentRollbackStrictFrames or autoPerfectRecentRollbackLooseFrames
    local startOutputIndex = math.max(1, #outputFrames - rollbackLimit)
    local best = nil
    local segLimit = #nextSegment
    local finalStep = math.max(1, math.floor((#outputFrames - startOutputIndex + 1) / 900))
    local segStep = math.max(1, math.floor(segLimit / 900))

    for i = #outputFrames, startOutputIndex, -finalStep do
        local aPos = getAutoPerfectFramePosition(outputFrames[i])
        if aPos then
            for j = 1, segLimit, segStep do
                local bPos = getAutoPerfectFramePosition(nextSegment[j])
                if bPos then
                    local flatDistance, verticalDistance = getAutoPerfectJoinStats(aPos, bPos)
                    if flatDistance <= maxFlat and verticalDistance <= maxVertical then
                        local forward = getAutoPerfectForwardBonus(nextSegment, j, routeDir)
                        local rollbackFrames = #outputFrames - i
                        local skipFrames = j - 1
                        -- Hindari skip besar karena bisa membuat hasil terasa pendek dan lompat.
                        local score = flatDistance + (verticalDistance * 6.0) + (rollbackFrames * 0.018) + (skipFrames * 0.035)
                        if forward < -0.35 then score = score + 25 elseif forward < -0.05 then score = score + 6 end
                        if (not best) or score < best.score then
                            best = {i = i, j = j, score = score, flat = flatDistance, vertical = verticalDistance, rollback = rollbackFrames, skipped = skipFrames}
                        end
                    end
                end
            end
        end
    end
    return best
end

function appendAutoPerfectSegmentFrom(outputFrames, segment, startIndex)
    startIndex = math.max(1, tonumber(startIndex) or 1)
    local appended = 0
    for i = startIndex, #segment do
        local frame = copyAutoPerfectFrame(segment[i])
        frame.autoPerfectSingleLine = true
        frame.autoPerfectFinalLine = true
        table.insert(outputFrames, frame)
        appended = appended + 1
    end
    return appended
end

function buildAutoPerfectGroundedConnector(outputFrames, nextFrame)
    -- No-Magnet mode: connector sintetis dinonaktifkan.
    -- Kalau jarak sambungan belum dekat, lebih aman potong ke seam terdekat daripada membuat karakter melayang/ketarik.
    return false
end


function stitchAutoPerfectSegments(rawSegments, fallbackFrames)
    local sourceSegments = {}
    if type(rawSegments) == "table" and #rawSegments > 0 then
        for _, segment in ipairs(rawSegments) do
            local cleanSegment = sanitizeAutoPerfectSegment(segment)
            if #cleanSegment > 1 then table.insert(sourceSegments, cleanSegment) end
        end
    else
        for _, segment in ipairs(segmentsFromAutoPerfectCombined(fallbackFrames)) do
            local cleanSegment = sanitizeAutoPerfectSegment(segment)
            if #cleanSegment > 1 then table.insert(sourceSegments, cleanSegment) end
        end
    end

    if #sourceSegments == 0 then return {} end
    local routeDir = getAutoPerfectRouteDirectionFromSegments(sourceSegments)
    local output = {}
    appendAutoPerfectSegmentFrom(output, sourceSegments[1], 1)

    for sIndex = 2, #sourceSegments do
        local segment = sourceSegments[sIndex]
        if #segment > 1 then
            -- Prioritas: potong balik ke checkpoint asli jika awal segmen baru dekat dengan jalur lama.
            local seam = findAutoPerfectCheckpointSeam(output, segment, routeDir)
            if not seam then seam = findAutoPerfectBestSeam(output, segment, routeDir, true) end
            if not seam then seam = findAutoPerfectBestSeam(output, segment, routeDir, false) end

            if seam then
                -- Potong ekor jalur gagal sampai titik seam, lalu lanjut dengan frame asli dari segmen berhasil.
                for i = #output, seam.i + 1, -1 do output[i] = nil end
                local startIndex = seam.j
                if seam.flat <= 0.6 and seam.vertical <= 1.0 then
                    startIndex = math.min(#segment, seam.j + 1)
                end
                appendAutoPerfectSegmentFrom(output, segment, startIndex)
            else
                -- Tidak ada seam alami yang aman. Jangan membuat hard-cut/teleport/connector.
                -- Tetap simpan frame asli agar rute tidak pendek; mode playback human akan berjalan normal tanpa CFrame snap.
                appendAutoPerfectSegmentFrom(output, segment, 1)
            end
        end
    end
    return output
end


function removeAutoPerfectSharpTeleports(frames)
    if type(frames) ~= "table" then return {} end
    -- Mode normal tanpa anomali: jangan tandai hard cut dan jangan buat connector.
    -- Frame asli dipertahankan; playback Auto Perfect memakai gerak humanoid normal, bukan CFrame snap.
    local out = {}
    for _, frame in ipairs(frames) do
        local newFrame = copyAutoPerfectFrame(frame)
        newFrame.autoPerfectHardCut = nil
        newFrame.autoPerfectNoInterpolateFromPrevious = nil
        newFrame.autoPerfectConnector = nil
        newFrame.autoPerfectBridge = nil
        if newFrame.position then table.insert(out, newFrame) end
    end
    return out
end

function optimizeAutoPerfectFinalFrames(frames, rawSegments)
    local stitched = autoPerfectStableStitch(rawSegments, frames)
    if #stitched < 2 and type(frames) == "table" then
        stitched = autoPerfectStableCleanSegment(frames)
    end
    if #stitched < 2 then return stitched end

    for _, frame in ipairs(stitched) do
        local ws = tonumber(frame and frame.walkSpeed)
        if ws and ws > 0 then
            autoPerfectRecordedBaseWalkSpeed = ws
            break
        end
    end

    local clean = autoPerfectStableRemoveUnsafeFinalGaps(stitched)
    clean = autoPerfectStableRetime(clean)

    local final = {}
    for _, frame in ipairs(clean) do
        if frame and frame.position then
            local newFrame = copyAutoPerfectFrame(frame)
            local stateName = tostring(newFrame.state or "Running")
            if stateName == "FallingDown" or stateName == "Dead" then
                stateName = "Running"
            end
            newFrame.state = stateName
            newFrame.jumping = (stateName == "Jumping") or (newFrame.jumping == true)
            newFrame.walkSpeed = getAutoPerfectFrameSpeed(newFrame)
            newFrame.autoPerfectGrounded = false
            newFrame.autoPerfectSingleLine = true
            newFrame.autoPerfectPerfectedSeam = true
            newFrame.autoPerfectNormalMotion = true
            newFrame.autoPerfectConnector = nil
            newFrame.autoPerfectBridge = nil

            local last = final[#final]
            if last and (tonumber(newFrame.time) or 0) <= (tonumber(last.time) or 0) then
                newFrame.time = (tonumber(last.time) or 0) + SAMPLE_INTERVAL
            end
            table.insert(final, newFrame)
        end
    end

    -- Isi moveDirection yang kosong saja. Jangan timpa velocity/jump asli agar tidak kaku.
    for i = 2, #final do
        local prevPos = getAutoPerfectFramePosition(final[i - 1])
        local pos = getAutoPerfectFramePosition(final[i])
        if prevPos and pos then
            local moveDir = normalizeAutoPerfectMoveDirection(prevPos, pos)
            local currentMove = final[i].moveDirection and tableToVector(final[i].moveDirection) or Vector3.zero
            if currentMove.Magnitude <= 0.03 and moveDir.Magnitude > 0.001 and not final[i].autoPerfectHardCut then
                final[i].moveDirection = vectorToTable(moveDir)
            end
            if (not final[i].rotation) and moveDir.Magnitude > 0.001 then
                final[i].rotation = math.atan2(-moveDir.X, -moveDir.Z)
            end
        end
    end

    if #final > 0 then final[1].time = 0 end
    return final
end



-- Auto Perfect Stable v5 - Normal Result / No Magnet / No Float / No Glitch
-- Prinsip utama:
-- 1) Hasil akhir tetap memakai frame asli rekaman, bukan connector sintetis.
-- 2) Segment gagal dipotong sampai seam asli terdekat dengan segment berhasil berikutnya.
-- 3) Jika seam terlalu jauh/tinggi, segment itu tidak dipaksa agar tidak muncul teleport, magnet, atau melayang.
-- 4) Timing, velocity, rotasi, state, jump, dan WalkSpeed asli dipertahankan supaya playback terasa seperti rekaman biasa.
AUTO_PERFECT_STABLE_STRICT_FLAT = 8.25
AUTO_PERFECT_STABLE_STRICT_VERTICAL = 4.25
AUTO_PERFECT_STABLE_WIDE_FLAT = 14.75
AUTO_PERFECT_STABLE_WIDE_VERTICAL = 5.75
AUTO_PERFECT_STABLE_RESCUE_FLAT = 18.5
AUTO_PERFECT_STABLE_RESCUE_VERTICAL = 6.25
AUTO_PERFECT_STABLE_NATURAL_FLAT = 5.25
AUTO_PERFECT_STABLE_NATURAL_VERTICAL = 3.5
AUTO_PERFECT_STABLE_BAD_GAP_FLAT = 20
AUTO_PERFECT_STABLE_BAD_GAP_VERTICAL = 7.5
AUTO_PERFECT_STABLE_LOOKAHEAD = 2400
AUTO_PERFECT_STABLE_ROLLBACK = 36000

function autoPerfectStableFrameClone(frame)
    return copyAutoPerfectFrame(frame)
end

function autoPerfectStableIsBadFrame(frame)
    if type(frame) ~= "table" or not frame.position then return true end
    local stateName = tostring(frame.state or "Running")
    if stateName == "FallingDown" or stateName == "Dead" then return true end
    return false
end

function autoPerfectStableGetMotionVector(frame, nextFrame)
    local move = frame and frame.moveDirection and tableToVector(frame.moveDirection) or nil
    if move and move.Magnitude > 0.04 then
        return Vector3.new(move.X, 0, move.Z).Magnitude > 0.04 and Vector3.new(move.X, 0, move.Z).Unit or nil
    end
    local vel = frame and frame.velocity and tableToVector(frame.velocity) or nil
    if vel and Vector3.new(vel.X, 0, vel.Z).Magnitude > 0.35 then
        return Vector3.new(vel.X, 0, vel.Z).Unit
    end
    local aPos = getAutoPerfectFramePosition(frame)
    local bPos = getAutoPerfectFramePosition(nextFrame)
    if aPos and bPos then
        local delta = Vector3.new(bPos.X - aPos.X, 0, bPos.Z - aPos.Z)
        if delta.Magnitude > 0.04 then return delta.Unit end
    end
    return nil
end

function autoPerfectStableNormalizeFrame(frame)
    local newFrame = autoPerfectStableFrameClone(frame)
    local stateName = tostring(newFrame.state or "Running")
    if stateName == "FallingDown" or stateName == "Dead" then stateName = "Running" end
    newFrame.state = stateName
    newFrame.jumping = (stateName == "Jumping") or (newFrame.jumping == true)
    newFrame.walkSpeed = tonumber(newFrame.walkSpeed) or tonumber(autoPerfectRecordedBaseWalkSpeed) or autoPerfectNormalWalkSpeed
    newFrame.autoPerfectBridge = nil
    newFrame.autoPerfectConnector = nil
    newFrame.autoPerfectGroundedBridge = nil
    newFrame.autoPerfectHardCut = nil
    newFrame.autoPerfectNoInterpolateFromPrevious = nil
    newFrame.autoPerfectGrounded = nil
    newFrame.autoPerfectPerfectedSeam = nil
    newFrame.autoPerfectNormalMotion = nil
    newFrame.autoPerfectSingleLine = nil
    newFrame.autoPerfectStableRealFrame = true
    return newFrame
end

function autoPerfectStableCleanSegment(segment)
    local out = {}
    local lastPos = nil
    if type(segment) ~= "table" then return out end
    for _, frame in ipairs(segment) do
        if not autoPerfectStableIsBadFrame(frame) then
            local newFrame = autoPerfectStableNormalizeFrame(frame)
            local pos = getAutoPerfectFramePosition(newFrame)
            if pos then
                local keep = true
                if lastPos then
                    local flatDistance, verticalDistance = getAutoPerfectJoinStats(lastPos, pos)
                    -- Buang teleport/respawn internal. Freefall/jump normal tetap disimpan bila jaraknya masih wajar.
                    if flatDistance >= 45 or verticalDistance >= 35 then
                        keep = false
                    end
                end
                if keep and (not lastPos or (pos - lastPos).Magnitude >= 0.025) then
                    table.insert(out, newFrame)
                    lastPos = pos
                end
            end
        end
    end
    return out
end

function autoPerfectStableAppend(output, segment, startIndex, seamInfo)
    startIndex = math.max(1, tonumber(startIndex) or 1)
    local added = 0
    for i = startIndex, #segment do
        local frame = autoPerfectStableNormalizeFrame(segment[i])
        if added == 0 and seamInfo then
            frame.autoPerfectStableSeam = true
            frame.autoPerfectSeamFlat = seamInfo.flat
            frame.autoPerfectSeamVertical = seamInfo.vertical
            frame.autoPerfectSeamRollback = seamInfo.rollback
            frame.autoPerfectSeamSkipped = seamInfo.skipped
        else
            frame.autoPerfectStableSeam = nil
        end
        table.insert(output, frame)
        added = added + 1
    end
    return added
end

function autoPerfectStableSeamScore(outputFrames, nextSegment, i, j, maxFlat, maxVertical, mode)
    local aFrame = outputFrames and outputFrames[i]
    local bFrame = nextSegment and nextSegment[j]
    local aPos = getAutoPerfectFramePosition(aFrame)
    local bPos = getAutoPerfectFramePosition(bFrame)
    if not (aPos and bPos) then return nil end

    local flatDistance, verticalDistance = getAutoPerfectJoinStats(aPos, bPos)
    if flatDistance > maxFlat or verticalDistance > maxVertical then return nil end

    local rollbackFrames = #outputFrames - i
    local skipFrames = j - 1
    local score = flatDistance + (verticalDistance * 7.25) + (rollbackFrames * 0.015) + (skipFrames * 0.018)

    -- Seam yang sangat dekat boleh diprioritaskan karena hasilnya seperti rekaman normal tanpa anomali.
    if flatDistance <= 1.1 and verticalDistance <= 1.2 then score = score - 4 end
    if flatDistance <= 3.25 and verticalDistance <= 2.25 then score = score - 1.35 end

    -- Hindari menyambung ke bagian segment baru yang arahnya mundur berlawanan dari titik seam.
    local gap = Vector3.new(bPos.X - aPos.X, 0, bPos.Z - aPos.Z)
    local bMotion = autoPerfectStableGetMotionVector(bFrame, nextSegment[j + 1])
    if gap.Magnitude > 0.2 and bMotion then
        local dot = gap.Unit:Dot(bMotion)
        if dot < -0.45 then
            score = score + 18
        elseif dot < -0.1 then
            score = score + 5
        elseif dot > 0.25 then
            score = score - 0.65
        end
    end

    -- Mode rescue hanya dipakai bila tidak ada seam ketat; tetap diberi penalti agar tidak dipilih kecuali perlu.
    if mode == "wide" then
        if flatDistance > AUTO_PERFECT_STABLE_STRICT_FLAT then score = score + 4 end
        if verticalDistance > AUTO_PERFECT_STABLE_STRICT_VERTICAL then score = score + 7 end
    elseif mode == "rescue" then
        score = score + 16
        if flatDistance > AUTO_PERFECT_STABLE_WIDE_FLAT then score = score + 18 end
        if verticalDistance > AUTO_PERFECT_STABLE_WIDE_VERTICAL then score = score + 18 end
    end

    if skipFrames > 360 then score = score + 8 end
    if skipFrames > 900 then score = score + 24 end
    if rollbackFrames > 2400 then score = score + 10 end
    if rollbackFrames > 4200 then score = score + 30 end

    return {
        i = i,
        j = j,
        flat = flatDistance,
        vertical = verticalDistance,
        score = score,
        rollback = rollbackFrames,
        skipped = skipFrames,
        mode = mode,
    }
end

function autoPerfectStableFindSeamWithLimits(outputFrames, nextSegment, config)
    if type(outputFrames) ~= "table" or #outputFrames < 2 or type(nextSegment) ~= "table" or #nextSegment < 2 then return nil end
    config = config or {}
    local maxFlat = tonumber(config.maxFlat) or AUTO_PERFECT_STABLE_STRICT_FLAT
    local maxVertical = tonumber(config.maxVertical) or AUTO_PERFECT_STABLE_STRICT_VERTICAL
    local rollbackLimit = math.min(#outputFrames - 1, tonumber(config.rollbackLimit) or AUTO_PERFECT_STABLE_ROLLBACK)
    local lookaheadLimit = math.min(#nextSegment, tonumber(config.lookaheadLimit) or AUTO_PERFECT_STABLE_LOOKAHEAD)
    local mode = config.mode or "strict"
    local outputStart = math.max(1, #outputFrames - rollbackLimit)
    local outputCount = #outputFrames - outputStart + 1
    local outStep = math.max(1, math.floor(outputCount / (tonumber(config.outputSamples) or 1000)))
    local nextStep = math.max(1, math.floor(lookaheadLimit / (tonumber(config.nextSamples) or 800)))
    local best = nil

    local function consider(i, j)
        local candidate = autoPerfectStableSeamScore(outputFrames, nextSegment, i, j, maxFlat, maxVertical, mode)
        if candidate and ((not best) or candidate.score < best.score) then
            best = candidate
        end
    end

    local loopCounter = 0
    for i = #outputFrames, outputStart, -outStep do
        for j = 1, lookaheadLimit, nextStep do
            loopCounter = loopCounter + 1
            if loopCounter % 10000 == 0 then task.wait() end
            consider(i, j)
        end
    end

    -- Refine di sekitar hasil coarse supaya seam tidak meleset karena step sampling.
    if best then
        local refineIStart = math.max(outputStart, best.i - (outStep * 3))
        local refineIEnd = math.min(#outputFrames, best.i + (outStep * 3))
        local refineJStart = math.max(1, best.j - (nextStep * 3))
        local refineJEnd = math.min(lookaheadLimit, best.j + (nextStep * 3))
        for i = refineIStart, refineIEnd do
            for j = refineJStart, refineJEnd do
                consider(i, j)
            end
        end
    end

    return best
end

function autoPerfectStableFindSeam(outputFrames, nextSegment)
    return autoPerfectStableFindSeamWithLimits(outputFrames, nextSegment, {
        maxFlat = AUTO_PERFECT_STABLE_STRICT_FLAT,
        maxVertical = AUTO_PERFECT_STABLE_STRICT_VERTICAL,
        rollbackLimit = 1800,
        lookaheadLimit = 900,
        outputSamples = 900,
        nextSamples = 500,
        mode = "strict",
    })
end

function autoPerfectStableFindWideCheckpointSeam(outputFrames, nextSegment)
    return autoPerfectStableFindSeamWithLimits(outputFrames, nextSegment, {
        maxFlat = AUTO_PERFECT_STABLE_WIDE_FLAT,
        maxVertical = AUTO_PERFECT_STABLE_WIDE_VERTICAL,
        rollbackLimit = AUTO_PERFECT_STABLE_ROLLBACK,
        lookaheadLimit = AUTO_PERFECT_STABLE_LOOKAHEAD,
        outputSamples = 1400,
        nextSamples = 900,
        mode = "wide",
    })
end

function autoPerfectStableFindRescueSeam(outputFrames, nextSegment)
    return autoPerfectStableFindSeamWithLimits(outputFrames, nextSegment, {
        maxFlat = AUTO_PERFECT_STABLE_RESCUE_FLAT,
        maxVertical = AUTO_PERFECT_STABLE_RESCUE_VERTICAL,
        rollbackLimit = AUTO_PERFECT_STABLE_ROLLBACK,
        lookaheadLimit = math.max(AUTO_PERFECT_STABLE_LOOKAHEAD, 3600),
        outputSamples = 1600,
        nextSamples = 1000,
        mode = "rescue",
    })
end

function autoPerfectStableLastGapLooksNatural(outputFrames, nextFrame)
    if type(outputFrames) ~= "table" or #outputFrames < 1 or not nextFrame then return false end
    local aPos = getAutoPerfectFramePosition(outputFrames[#outputFrames])
    local bPos = getAutoPerfectFramePosition(nextFrame)
    if not (aPos and bPos) then return false end
    local flatDistance, verticalDistance = getAutoPerfectJoinStats(aPos, bPos)
    return flatDistance <= AUTO_PERFECT_STABLE_NATURAL_FLAT and verticalDistance <= AUTO_PERFECT_STABLE_NATURAL_VERTICAL
end

function autoPerfectStableFindNaturalStart(outputFrames, segment, maxLook)
    maxLook = math.min(#segment, tonumber(maxLook) or AUTO_PERFECT_STABLE_LOOKAHEAD)
    for j = 1, maxLook do
        if autoPerfectStableLastGapLooksNatural(outputFrames, segment[j]) then
            return j
        end
    end
    return nil
end

function autoPerfectStableBuildSegments(rawSegments, fallbackFrames)
    local segments = {}
    if type(rawSegments) == "table" and #rawSegments > 0 then
        for _, segment in ipairs(rawSegments) do
            local clean = autoPerfectStableCleanSegment(segment)
            if #clean > 1 then table.insert(segments, clean) end
        end
    else
        for _, segment in ipairs(segmentsFromAutoPerfectCombined(fallbackFrames)) do
            local clean = autoPerfectStableCleanSegment(segment)
            if #clean > 1 then table.insert(segments, clean) end
        end
    end
    return segments
end

function autoPerfectStableStitch(rawSegments, fallbackFrames)
    local sourceSegments = autoPerfectStableBuildSegments(rawSegments, fallbackFrames)
    if #sourceSegments == 0 then return {} end

    local output = {}
    autoPerfectStableAppend(output, sourceSegments[1], 1)

    for sIndex = 2, #sourceSegments do
        local segment = sourceSegments[sIndex]
        if #segment > 1 then
            -- Urutan seam: ketat -> checkpoint luas -> rescue. Semua tetap memakai frame asli.
            local seam = autoPerfectStableFindSeam(output, segment)
            if not seam then seam = autoPerfectStableFindWideCheckpointSeam(output, segment) end
            if not seam then seam = autoPerfectStableFindRescueSeam(output, segment) end

            if seam then
                -- Potong ekor jalur gagal sampai titik aman terdekat, lalu lanjut dari frame asli segment berhasil.
                for i = #output, seam.i + 1, -1 do output[i] = nil end
                local startIndex = seam.j
                if seam.flat <= 0.45 and seam.vertical <= 0.85 then
                    startIndex = math.min(#segment, seam.j + 1)
                end
                autoPerfectStableAppend(output, segment, startIndex, seam)
            else
                -- Fallback tanpa connector: hanya lanjut jika ada frame sukses yang sudah natural dari ujung terakhir.
                local startIndex = nil
                if autoPerfectStableLastGapLooksNatural(output, segment[1]) then
                    startIndex = 1
                else
                    startIndex = autoPerfectStableFindNaturalStart(output, segment, math.max(AUTO_PERFECT_STABLE_LOOKAHEAD, 3600))
                end
                if startIndex then
                    autoPerfectStableAppend(output, segment, startIndex, {flat = 0, vertical = 0, rollback = 0, skipped = startIndex - 1, mode = "natural"})
                else
                    -- Tidak ada sambungan aman. Segment ini dilewati agar hasil tidak teleport, melayang, atau ketarik magnet.
                    -- Segment berikutnya tetap akan dicoba karena mungkin punya checkpoint yang lebih dekat.
                end
            end
        end
    end
    return output
end

function autoPerfectStableRemoveUnsafeFinalGaps(frames)
    if type(frames) ~= "table" or #frames < 2 then return frames or {} end
    local out = {}
    for _, frame in ipairs(frames) do
        if frame and frame.position then
            local keep = true
            local last = out[#out]
            if last then
                local aPos = getAutoPerfectFramePosition(last)
                local bPos = getAutoPerfectFramePosition(frame)
                if aPos and bPos then
                    local flatDistance, verticalDistance = getAutoPerfectJoinStats(aPos, bPos)
                    local sameSegment = last.autoPerfectSegment == frame.autoPerfectSegment
                    -- Di dalam segment asli, biarkan lompatan normal. Di seam antar segment, buang gap besar.
                    local stateName = tostring(frame.state or "Running")
                    local airState = stateName == "Jumping" or stateName == "Freefall" or stateName == "Climbing"
                    if not sameSegment and (flatDistance > AUTO_PERFECT_STABLE_BAD_GAP_FLAT or verticalDistance > AUTO_PERFECT_STABLE_BAD_GAP_VERTICAL) then
                        keep = false
                    elseif sameSegment and (flatDistance > 45 or (verticalDistance > 35 and not airState)) then
                        -- Proteksi ekstra untuk rekaman gagal yang menyimpan teleport/respawn di dalam satu segment.
                        keep = false
                    end
                end
            end
            if keep then table.insert(out, frame) end
        end
    end
    return out
end

function autoPerfectStableRetime(frames)
    local out = {}
    local timeOut = 0
    local lastSourceTime = nil
    local lastSegment = nil
    for _, frame in ipairs(frames or {}) do
        if frame and frame.position then
            local newFrame = autoPerfectStableNormalizeFrame(frame)
            local sourceTime = tonumber(frame.time) or 0
            local seg = frame.autoPerfectSegment
            local dt = SAMPLE_INTERVAL
            if lastSourceTime ~= nil and (lastSegment == nil or seg == lastSegment) and sourceTime > lastSourceTime then
                -- Pertahankan timing asli seperti rekaman normal. Clamp atas hanya untuk mencegah pause/diam panjang menjadi kaku.
                dt = math.clamp(sourceTime - lastSourceTime, SAMPLE_INTERVAL, 0.14)
            end
            if #out == 0 then
                newFrame.time = 0
                timeOut = 0
            else
                timeOut = timeOut + dt
                newFrame.time = timeOut
            end
            table.insert(out, newFrame)
            lastSourceTime = sourceTime
            lastSegment = seg
        end
    end
    return out
end

optimizeAutoPerfectFinalFrames = function(frames, rawSegments)
    local stitched = autoPerfectStableStitch(rawSegments, frames)
    if #stitched < 2 then
        stitched = autoPerfectStableCleanSegment(frames)
    end
    if #stitched < 2 then return stitched end

    stitched = autoPerfectStableRemoveUnsafeFinalGaps(stitched)
    if #stitched < 2 then return stitched end

    local final = autoPerfectStableRetime(stitched)

    -- Isi moveDirection/rotasi yang kosong saja. Jangan timpa data asli supaya gerakan tidak kaku.
    for i = 1, #final do
        if i >= 2 then
            local prevPos = getAutoPerfectFramePosition(final[i - 1])
            local pos = getAutoPerfectFramePosition(final[i])
            if prevPos and pos then
                local moveDir = normalizeAutoPerfectMoveDirection(prevPos, pos)
                local currentMove = final[i].moveDirection and tableToVector(final[i].moveDirection) or Vector3.zero
                if currentMove.Magnitude <= 0.03 and moveDir.Magnitude > 0.001 then
                    final[i].moveDirection = vectorToTable(moveDir)
                end
                if (not final[i].rotation) and moveDir.Magnitude > 0.001 then
                    final[i].rotation = math.atan2(-moveDir.X, -moveDir.Z)
                end
            end
        end
        final[i].autoPerfectBridge = nil
        final[i].autoPerfectConnector = nil
        final[i].autoPerfectHardCut = nil
        final[i].autoPerfectNoInterpolateFromPrevious = nil
        final[i].autoPerfectNormalMotion = nil
        final[i].autoPerfectSingleLine = nil
        final[i].autoPerfectGrounded = nil
        final[i].autoPerfectPerfectedSeam = nil
    end

    if #final > 0 then final[1].time = 0 end
    return final
end



-- Auto Perfect Exact v9 - line/playback lockstep + anti-void tail + final attempt only
-- Helper ini sengaja dibuat global agar tidak menambah local di main chunk yang sudah besar.
function autoPerfectExactStateIsAir(stateName)
    stateName = tostring(stateName or "Running")
    return stateName == "Freefall" or stateName == "Jumping" or stateName == "FallingDown"
end

function autoPerfectExactFrameIsMarkedGrounded(frame)
    if type(frame) ~= "table" then return false end
    if frame.grounded == true then return true end
    local floor = tostring(frame.floorMaterial or "")
    if floor ~= "" and floor ~= "Air" and floor ~= "Enum.Material.Air" then return true end
    return false
end

function autoPerfectExactRayParams()
    local ok, params = pcall(function()
        local rayParams = RaycastParams.new()
        rayParams.FilterType = Enum.RaycastFilterType.Blacklist
        local ignore = {}
        if LocalPlayer and LocalPlayer.Character then table.insert(ignore, LocalPlayer.Character) end
        local lineFolder = workspace and workspace:FindFirstChild("ArexansVisualLines")
        if lineFolder then table.insert(ignore, lineFolder) end
        rayParams.FilterDescendantsInstances = ignore
        return rayParams
    end)
    if ok then return params end
    return nil
end

function autoPerfectExactPositionHasSupport(position, hipHeight, maxDrop)
    if not position or not workspace or not workspace.Raycast then return false end
    local drop = tonumber(maxDrop) or 10
    local rootOffset = (tonumber(hipHeight) or 2) + 2.25
    local origin = Vector3.new(position.X, position.Y + 1.5, position.Z)
    local direction = Vector3.new(0, -(drop + rootOffset + 1.5), 0)
    local params = autoPerfectExactRayParams()
    local ok, result = pcall(function()
        if params then return workspace:Raycast(origin, direction, params) end
        return workspace:Raycast(origin, direction)
    end)
    if ok and result and result.Instance and result.Position then
        local below = position.Y - result.Position.Y
        return below >= -2 and below <= (drop + rootOffset + 1.5)
    end
    return false
end

function autoPerfectExactFrameHasImmediateSupport(frame)
    if type(frame) ~= "table" or not frame.position then return false end
    if autoPerfectExactFrameIsMarkedGrounded(frame) then return true end
    local stateName = tostring(frame.state or "Running")
    if frame.grounded == nil and frame.floorMaterial == nil and not autoPerfectExactStateIsAir(stateName) and stateName ~= "Swimming" then
        -- Rekaman lama belum punya flag grounded. State Running/Climbing diasumsikan punya pijakan.
        return true
    end
    return autoPerfectExactPositionHasSupport(getAutoPerfectFramePosition(frame), frame.hipHeight, 7.5)
end

function autoPerfectExactFrameHasNearbyLanding(frame)
    if type(frame) ~= "table" or not frame.position then return false end
    if autoPerfectExactFrameHasImmediateSupport(frame) then return true end
    return autoPerfectExactPositionHasSupport(getAutoPerfectFramePosition(frame), frame.hipHeight, 32)
end

function autoPerfectExactSegmentHasGroundAfter(segment, startIndex, lookAhead)
    if type(segment) ~= "table" then return false end
    local last = math.min(#segment, (tonumber(startIndex) or 1) + (tonumber(lookAhead) or 240))
    for i = math.max(1, tonumber(startIndex) or 1), last do
        if autoPerfectExactFrameHasImmediateSupport(segment[i]) then return true end
    end
    return false
end

function autoPerfectExactFindSupportedStart(segment, maxLook, fromIndex)
    if type(segment) ~= "table" then return nil end
    local first = math.max(1, tonumber(fromIndex) or 1)
    local limit = math.min(#segment, first + (tonumber(maxLook) or 360) - 1)
    for i = first, limit do
        if autoPerfectExactFrameHasImmediateSupport(segment[i]) then return i end
    end
    -- Kalau respawn/checkpoint sempat spawn sedikit di udara, cari frame yang punya landing dekat di bawah.
    for i = first, limit do
        if autoPerfectExactFrameHasNearbyLanding(segment[i]) then return i end
    end
    return nil
end

function autoPerfectExactTrimUnsupportedAirTail(segment)
    if type(segment) ~= "table" or #segment < 2 then return segment or {} end
    local lastSafeIndex = #segment
    local tailStartIndex = nil

    for i = #segment, 1, -1 do
        local frame = segment[i]
        local stateName = tostring(frame and frame.state or "Running")
        local isAir = autoPerfectExactStateIsAir(stateName) or (frame and frame.grounded == false)
        local supported = autoPerfectExactFrameHasImmediateSupport(frame)
        if isAir and not supported then
            tailStartIndex = i
        else
            lastSafeIndex = i
            break
        end
    end

    if tailStartIndex then
        local firstTail = segment[tailStartIndex]
        local lastTail = segment[#segment]
        local tailDuration = math.max(0, (tonumber(lastTail and lastTail.time) or 0) - (tonumber(firstTail and firstTail.time) or 0))
        local hasLandingSoon = autoPerfectExactFrameHasNearbyLanding(lastTail)
        if tailDuration >= 0.35 and not hasLandingSoon then
            local out = {}
            for i = 1, math.max(1, lastSafeIndex) do table.insert(out, copyAutoPerfectFrame(segment[i])) end
            return out
        end
    end

    return segment
end

function autoPerfectExactGapStats(aFrame, bFrame)
    local aPos = getAutoPerfectFramePosition(aFrame)
    local bPos = getAutoPerfectFramePosition(bFrame)
    if not (aPos and bPos) then return math.huge, math.huge, math.huge end
    local flatDistance, verticalDistance, totalDistance = getAutoPerfectJoinStats(aPos, bPos)
    return flatDistance, verticalDistance, totalDistance
end

function autoPerfectExactGapIsNaturalForPlayback(aFrame, bFrame)
    local flatDistance, verticalDistance = autoPerfectExactGapStats(aFrame, bFrame)
    if flatDistance <= 1.65 and verticalDistance <= 1.35 then return true end
    if flatDistance > 7.25 or verticalDistance > 4.75 then return false end
    local aState = tostring(aFrame and aFrame.state or "Running")
    local bState = tostring(bFrame and bFrame.state or "Running")
    local airMove = autoPerfectExactStateIsAir(aState) or autoPerfectExactStateIsAir(bState)
    if airMove and flatDistance <= 5.5 and verticalDistance <= 4.75 then return true end
    return autoPerfectExactFrameHasImmediateSupport(aFrame) and autoPerfectExactFrameHasImmediateSupport(bFrame)
end

function autoPerfectExactShouldHardCut(aFrame, bFrame, seamInfo)
    if not seamInfo then return false end
    if not autoPerfectExactGapIsNaturalForPlayback(aFrame, bFrame) then return true end
    if (tonumber(seamInfo.skipped) or 0) > 0 or (tonumber(seamInfo.rollback) or 0) > 0 then
        local flatDistance, verticalDistance = autoPerfectExactGapStats(aFrame, bFrame)
        return flatDistance > 1.65 or verticalDistance > 1.35
    end
    return false
end

function autoPerfectExactMarkUnsafeGaps(frames)
    if type(frames) ~= "table" or #frames < 2 then return frames or {} end
    for i = 2, #frames do
        local prevFrame = frames[i - 1]
        local frame = frames[i]
        if prevFrame and frame then
            local sameSegment = prevFrame.autoPerfectSegment == frame.autoPerfectSegment
            local naturalGap = autoPerfectExactGapIsNaturalForPlayback(prevFrame, frame)
            local flatDistance, verticalDistance = autoPerfectExactGapStats(prevFrame, frame)
            if (not sameSegment and not naturalGap) or ((not naturalGap) and (flatDistance > 10 or verticalDistance > 6)) or flatDistance > 45 or verticalDistance > 35 then
                frame.autoPerfectHardCut = true
                frame.autoPerfectNoInterpolateFromPrevious = true
                frame.autoPerfectExactSeam = true
                frame.autoPerfectSeamFlat = flatDistance
                frame.autoPerfectSeamVertical = verticalDistance
            end
        end
    end
    return frames
end

function autoPerfectExactSegmentStartIsUsable(segment, startIndex)
    if type(segment) ~= "table" or not segment[startIndex] then return false end
    if autoPerfectExactFrameHasImmediateSupport(segment[startIndex]) then return true end
    -- Jangan mulai segment dari udara kosong. Toleransi hanya untuk spawn/checkpoint yang melayang tipis di atas pijakan.
    return autoPerfectExactFrameHasNearbyLanding(segment[startIndex])
end

-- Auto Perfect Exact v8 - hasil playback sama dengan line dan tidak menyambung void.
-- Tidak smoothing, tidak connector, tidak magnet, tidak humanoid-correction.
-- Yang dibersihkan hanya frame mati/fallingdown, duplikat kecil, dan ekor gagal setelah jatuh.
function autoPerfectExactCleanSegment(segment)
    local out = {}
    local lastPos = nil
    if type(segment) ~= "table" then return out end
    for _, frame in ipairs(segment) do
        if type(frame) == "table" and frame.position then
            local stateName = tostring(frame.state or "Running")
            if stateName ~= "FallingDown" and stateName ~= "Dead" then
                local newFrame = copyAutoPerfectFrame(frame)
                local pos = getAutoPerfectFramePosition(newFrame)
                if pos then
                    local keep = true
                    if lastPos then
                        local flatDistance, verticalDistance = getAutoPerfectJoinStats(lastPos, pos)
                        -- Sangat konservatif: jangan ubah lompatan/gerak asli. Hanya buang teleport internal ekstrem.
                        if flatDistance > 95 or verticalDistance > 70 then
                            keep = false
                        end
                        if keep and (pos - lastPos).Magnitude < 0.018 then
                            keep = false
                        end
                    end
                    if keep then
                        newFrame.state = stateName
                        newFrame.jumping = (stateName == "Jumping") or (newFrame.jumping == true)
                        newFrame.autoPerfectBridge = nil
                        newFrame.autoPerfectConnector = nil
                        newFrame.autoPerfectGroundedBridge = nil
                        newFrame.autoPerfectHardCut = nil
                        newFrame.autoPerfectNoInterpolateFromPrevious = nil
                        newFrame.autoPerfectNormalMotion = nil
                        newFrame.autoPerfectSingleLine = nil
                        newFrame.autoPerfectPerfectedSeam = nil
                        newFrame.autoPerfectGrounded = nil
                        newFrame.autoPerfectExactFrame = true
                        table.insert(out, newFrame)
                        lastPos = pos
                    end
                end
            end
        end
    end
    return autoPerfectExactTrimUnsupportedAirTail(out)
end

function autoPerfectExactBuildSegments(rawSegments, fallbackFrames)
    local segments = {}
    if type(rawSegments) == "table" and #rawSegments > 0 then
        for _, segment in ipairs(rawSegments) do
            local clean = autoPerfectExactCleanSegment(segment)
            local startIndex = autoPerfectExactFindSupportedStart(clean, 360)
            if startIndex and startIndex > 1 then
                local shifted = {}
                for i = startIndex, #clean do table.insert(shifted, clean[i]) end
                clean = shifted
            end
            if #clean > 1 and autoPerfectExactSegmentStartIsUsable(clean, 1) then table.insert(segments, clean) end
        end
    else
        for _, segment in ipairs(segmentsFromAutoPerfectCombined(fallbackFrames)) do
            local clean = autoPerfectExactCleanSegment(segment)
            local startIndex = autoPerfectExactFindSupportedStart(clean, 360)
            if startIndex and startIndex > 1 then
                local shifted = {}
                for i = startIndex, #clean do table.insert(shifted, clean[i]) end
                clean = shifted
            end
            if #clean > 1 and autoPerfectExactSegmentStartIsUsable(clean, 1) then table.insert(segments, clean) end
        end
    end
    return segments
end

function autoPerfectExactFindRollbackSeam(outputFrames, nextSegment)
    if type(outputFrames) ~= "table" or #outputFrames < 2 or type(nextSegment) ~= "table" or #nextSegment < 1 then return nil end
    local best = nil
    local outputStart = math.max(1, #outputFrames - 4200)
    local nextLimit = math.min(#nextSegment, 220)
    local outStep = math.max(1, math.floor((#outputFrames - outputStart + 1) / 1200))
    local loopCounter = 0

    for i = #outputFrames, outputStart, -outStep do
        local aPos = getAutoPerfectFramePosition(outputFrames[i])
        if aPos then
            for j = 1, nextLimit do
                loopCounter = loopCounter + 1
                if loopCounter % 12000 == 0 then task.wait() end
                local bPos = getAutoPerfectFramePosition(nextSegment[j])
                if bPos then
                    local flatDistance, verticalDistance = getAutoPerfectJoinStats(aPos, bPos)
                    if flatDistance <= 11.5 and verticalDistance <= 6.75 and autoPerfectExactSegmentStartIsUsable(nextSegment, j) then
                        local rollbackFrames = #outputFrames - i
                        local skippedFrames = j - 1
                        -- Prioritaskan seam yang dekat dan skip kecil supaya hasil tetap seperti rekaman asli.
                        local score = flatDistance + (verticalDistance * 5.5) + (rollbackFrames * 0.012) + (skippedFrames * 0.045)
                        if flatDistance <= 1.2 and verticalDistance <= 1.2 then score = score - 3 end
                        if skippedFrames > 90 then score = score + 5 end
                        if skippedFrames > 170 then score = score + 14 end
                        if (not best) or score < best.score then
                            best = {i = i, j = j, flat = flatDistance, vertical = verticalDistance, rollback = rollbackFrames, skipped = skippedFrames, score = score}
                        end
                    end
                end
            end
        end
    end

    if best then
        -- Refine sekitar hasil terbaik agar tidak salah titik karena outStep.
        local refineStart = math.max(outputStart, best.i - (outStep * 3))
        local refineEnd = math.min(#outputFrames, best.i + (outStep * 3))
        for i = refineStart, refineEnd do
            local aPos = getAutoPerfectFramePosition(outputFrames[i])
            if aPos then
                for j = math.max(1, best.j - 12), math.min(nextLimit, best.j + 12) do
                    local bPos = getAutoPerfectFramePosition(nextSegment[j])
                    if bPos then
                        local flatDistance, verticalDistance = getAutoPerfectJoinStats(aPos, bPos)
                        if flatDistance <= 11.5 and verticalDistance <= 6.75 and autoPerfectExactSegmentStartIsUsable(nextSegment, j) then
                            local rollbackFrames = #outputFrames - i
                            local skippedFrames = j - 1
                            local score = flatDistance + (verticalDistance * 5.5) + (rollbackFrames * 0.012) + (skippedFrames * 0.045)
                            if flatDistance <= 1.2 and verticalDistance <= 1.2 then score = score - 3 end
                            if skippedFrames > 90 then score = score + 5 end
                            if skippedFrames > 170 then score = score + 14 end
                            if score < best.score then
                                best = {i = i, j = j, flat = flatDistance, vertical = verticalDistance, rollback = rollbackFrames, skipped = skippedFrames, score = score}
                            end
                        end
                    end
                end
            end
        end
    end

    return best
end

function autoPerfectExactAppendSegment(outputFrames, segment, startIndex, segmentId, seamInfo)
    startIndex = math.max(1, tonumber(startIndex) or 1)
    local firstSourceTime = nil
    local lastOutTime = (#outputFrames > 0 and (tonumber(outputFrames[#outputFrames].time) or 0)) or 0
    local baseOutTime = (#outputFrames > 0 and (lastOutTime + SAMPLE_INTERVAL)) or 0
    local added = 0
    for i = startIndex, #segment do
        local src = segment[i]
        if src and src.position then
            local newFrame = copyAutoPerfectFrame(src)
            firstSourceTime = firstSourceTime or (tonumber(src.time) or 0)
            local relTime = math.max(0, (tonumber(src.time) or firstSourceTime) - firstSourceTime)
            newFrame.time = baseOutTime + relTime
            newFrame.autoPerfectSegment = segmentId
            newFrame.autoPerfectExactFrame = true
            newFrame.autoPerfectStableRealFrame = true
            newFrame.autoPerfectBridge = nil
            newFrame.autoPerfectConnector = nil
            newFrame.autoPerfectGroundedBridge = nil
            newFrame.autoPerfectHardCut = nil
            newFrame.autoPerfectNoInterpolateFromPrevious = nil
            newFrame.autoPerfectNormalMotion = nil
            newFrame.autoPerfectSingleLine = nil
            newFrame.autoPerfectPerfectedSeam = nil
            newFrame.autoPerfectGrounded = nil
            if added == 0 and seamInfo then
                newFrame.autoPerfectExactSeam = true
                newFrame.autoPerfectSeamFlat = seamInfo.flat
                newFrame.autoPerfectSeamVertical = seamInfo.vertical
                newFrame.autoPerfectSeamRollback = seamInfo.rollback
                newFrame.autoPerfectSeamSkipped = seamInfo.skipped
                local prevFrame = outputFrames[#outputFrames]
                if autoPerfectExactShouldHardCut(prevFrame, newFrame, seamInfo) then
                    newFrame.autoPerfectHardCut = true
                    newFrame.autoPerfectNoInterpolateFromPrevious = true
                end
            else
                newFrame.autoPerfectExactSeam = nil
            end
            table.insert(outputFrames, newFrame)
            added = added + 1
        end
    end
    return added
end

function autoPerfectExactBuildFinalFrames(rawSegments, fallbackFrames)
    local segments = autoPerfectExactBuildSegments(rawSegments, fallbackFrames)
    local output = {}
    if #segments == 0 then return output end

    local firstStart = autoPerfectExactFindSupportedStart(segments[1], 360) or 1
    autoPerfectExactAppendSegment(output, segments[1], firstStart, 1)

    for sIndex = 2, #segments do
        local segment = segments[sIndex]
        if #segment > 1 then
            local seam = autoPerfectExactFindRollbackSeam(output, segment)
            if seam then
                for i = #output, seam.i + 1, -1 do output[i] = nil end
                local startIndex = seam.j
                if seam.flat <= 0.45 and seam.vertical <= 0.85 then
                    startIndex = math.min(#segment, seam.j + 1)
                end
                if not autoPerfectExactSegmentStartIsUsable(segment, startIndex) then
                    startIndex = autoPerfectExactFindSupportedStart(segment, 360, startIndex) or startIndex
                end
                if autoPerfectExactSegmentStartIsUsable(segment, startIndex) then
                    autoPerfectExactAppendSegment(output, segment, startIndex, sIndex, seam)
                end
            else
                -- Jika tidak ada seam aman, hanya lanjutkan bila gap memang terlihat seperti pergerakan normal.
                local lastPos = getAutoPerfectFramePosition(output[#output])
                local firstPos = getAutoPerfectFramePosition(segment[1])
                if lastPos and firstPos then
                    local flatDistance, verticalDistance = getAutoPerfectJoinStats(lastPos, firstPos)
                    if flatDistance <= 5.5 and verticalDistance <= 3.75 and autoPerfectExactGapIsNaturalForPlayback(output[#output], segment[1]) and autoPerfectExactSegmentStartIsUsable(segment, 1) then
                        autoPerfectExactAppendSegment(output, segment, 1, sIndex, {flat = flatDistance, vertical = verticalDistance, rollback = 0, skipped = 0})
                    end
                end
            end
        end
    end

    -- Pastikan waktu monoton, tapi jangan ubah bentuk path/velocity/rotasi/moveDirection.
    for i = 1, #output do
        if i == 1 then
            output[i].time = 0
        elseif (tonumber(output[i].time) or 0) <= (tonumber(output[i - 1].time) or 0) then
            output[i].time = (tonumber(output[i - 1].time) or 0) + SAMPLE_INTERVAL
        end
    end

    output = autoPerfectExactMarkUnsafeGaps(output)
    return output
end

-- Auto Perfect v11 - potong rollback checkpoint yang lolos dari deteksi live.
-- Jika dalam satu attempt ada snap besar kembali ke frame/checkpoint lama, bagian sebelum snap dianggap gagal.
function autoPerfectFinalFlatVerticalDistance(a, b)
    if not (a and b) then return math.huge, math.huge, math.huge end
    local delta = a - b
    local flat = Vector3.new(delta.X, 0, delta.Z).Magnitude
    local vertical = math.abs(delta.Y)
    return flat, vertical, delta.Magnitude
end

function autoPerfectFinalFindPriorNearIndex(frames, targetPosition, beforeIndex)
    if type(frames) ~= "table" or not targetPosition then return nil end
    local stopIndex = math.max(1, (tonumber(beforeIndex) or #frames) - 45)
    local startIndex = math.max(1, stopIndex - 5200)
    if stopIndex < startIndex then return nil end
    local step = math.max(1, math.floor((stopIndex - startIndex + 1) / 850))
    local bestIndex, bestScore = nil, math.huge
    for i = stopIndex, startIndex, -step do
        local oldPos = getAutoPerfectFramePosition(frames[i])
        if oldPos then
            local flat, vertical = autoPerfectFinalFlatVerticalDistance(targetPosition, oldPos)
            if flat <= 13.5 and vertical <= 9.5 then
                local score = flat + (vertical * 3) + ((stopIndex - i) * 0.0005)
                if score < bestScore then
                    bestIndex, bestScore = i, score
                end
            end
        end
    end
    return bestIndex
end

function autoPerfectFinalFrameLooksLikeRollback(frames, index)
    if type(frames) ~= "table" or not index or index <= 1 or not frames[index] then return false end
    local currentPos = getAutoPerfectFramePosition(frames[index])
    local previousPos = getAutoPerfectFramePosition(frames[index - 1])
    if not (currentPos and previousPos) then return false end

    local flat, vertical, total = autoPerfectFinalFlatVerticalDistance(currentPos, previousPos)
    local currentTime = tonumber(frames[index].time) or 0
    local previousTime = tonumber(frames[index - 1].time) or currentTime
    local dt = math.max(SAMPLE_INTERVAL, currentTime - previousTime)
    local speed = total / math.max(dt, 0.01)

    -- v12 Clean Attempt Priority:
    -- rollback checkpoint kadang cuma snap sedang, bukan selalu >28 stud. Deteksi dibuat lebih peka,
    -- tetapi tetap perlu bukti: dekat checkpoint yang pernah disentuh/dibuang ATAU kembali dekat frame lama.
    local instantJump = total >= 16 and (flat >= 10 or vertical >= 10) and (dt <= 1.05 or speed >= 45)
    if not instantJump then return false end

    local checkpointPosition = autoPerfectRecovery and (autoPerfectRecovery.lastCheckpointPosition or autoPerfectRecovery.lastTouchedCheckpointPosition) or nil
    if checkpointPosition then
        local nearCheckpointFlat, nearCheckpointVertical = autoPerfectFinalFlatVerticalDistance(currentPos, checkpointPosition)
        if nearCheckpointFlat <= math.max(16, autoPerfectCheckpointRadius) and nearCheckpointVertical <= 14 then
            return true
        end
    end

    if autoPerfectLastDiscardedCheckpointPosition then
        local nearDiscardedFlat, nearDiscardedVertical = autoPerfectFinalFlatVerticalDistance(currentPos, autoPerfectLastDiscardedCheckpointPosition)
        if nearDiscardedFlat <= math.max(16, autoPerfectCheckpointRadius) and nearDiscardedVertical <= 14 then
            return true
        end
    end

    -- Jika frame setelah snap kembali dekat jalur lama, itu rollback checkpoint walau checkpoint tidak bernama.
    if autoPerfectFinalFindPriorNearIndex(frames, currentPos, index) ~= nil then
        return true
    end

    -- Cadangan: respawn/checkpoint sering membuat state mendadak grounded setelah gap besar.
    -- Jangan pakai aturan ini untuk Freefall/Jump normal karena harus ada snap besar dulu.
    local stateName = tostring(frames[index].state or "Running")
    local prevState = tostring(frames[index - 1].state or "Running")
    if stateName ~= "Freefall" and stateName ~= "Jumping" and prevState ~= "Climbing" and (flat >= 18 or vertical >= 18) then
        return true
    end

    return false
end
function autoPerfectFinalFindLastRollbackStart(frames)
    if type(frames) ~= "table" or #frames < 2 then return nil end
    local lastStart = nil
    for i = 2, #frames do
        local frame = frames[i]
        local stateName = tostring(frame and frame.state or "Running")
        if stateName == "Dead" or stateName == "FallingDown" then
            lastStart = math.min(#frames, i + 1)
        elseif autoPerfectFinalFrameLooksLikeRollback(frames, i) then
            lastStart = i
        elseif type(frame) == "table" and (frame.autoPerfectCutBeforeFailure == true or frame.autoPerfectCheckpointRollback == true) then
            lastStart = math.min(#frames, i + 1)
        end
    end
    return lastStart
end

function autoPerfectFinalSliceAfterLastRollback(frames)
    if type(frames) ~= "table" or #frames < 2 then return frames or {}, false end
    local startIndex = autoPerfectFinalFindLastRollbackStart(frames)
    if not startIndex or startIndex < 1 or startIndex > #frames then return frames, false end

    -- Pastikan awal attempt bersih dimulai dari frame yang punya pijakan/landing valid.
    local supportedStart = autoPerfectExactFindSupportedStart(frames, 520, startIndex) or startIndex
    local out = {}
    for i = supportedStart, #frames do
        if type(frames[i]) == "table" then
            local copy = copyAutoPerfectFrame(frames[i])
            copy.autoPerfectDeletedRollbackAttempts = true
            copy.autoPerfectFinalAttemptOnly = true
            table.insert(out, copy)
        end
    end
    return out, (#out > 1)
end


-- Auto Perfect v12 - Clean Attempt Priority
-- Saat Stop, simpan hanya attempt bersih terakhir. Semua attempt yang mati/respawn/rollback checkpoint dibuang,
-- bukan dijahit lagi ke hasil akhir.
function autoPerfectFinalSegmentHasFailureMarker(segment)
    if type(segment) ~= "table" then return false end
    if segment.autoPerfectCutBeforeFailure == true or segment.autoPerfectCheckpointRollback == true or segment.autoPerfectFailedAttempt == true then
        return true
    end
    for _, frame in ipairs(segment) do
        if type(frame) == "table" then
            local stateName = tostring(frame.state or "Running")
            if stateName == "Dead" or stateName == "FallingDown" then return true end
            if frame.autoPerfectCutBeforeFailure == true or frame.autoPerfectCheckpointRollback == true or frame.autoPerfectFailedAttempt == true then
                return true
            end
        end
    end
    return false
end

function autoPerfectFinalNormalizeAttemptFrames(frames)
    local clean = autoPerfectExactCleanSegment(frames)
    if #clean < 2 then return {} end
    local startIndex = autoPerfectExactFindSupportedStart(clean, 520) or 1
    if startIndex > 1 then
        local shifted = {}
        for i = startIndex, #clean do table.insert(shifted, clean[i]) end
        clean = shifted
    end
    if #clean < 2 or not autoPerfectExactSegmentStartIsUsable(clean, 1) then return {} end
    for i = 1, #clean do
        clean[i].autoPerfectSegment = 1
        clean[i].autoPerfectFinalAttemptOnly = true
        clean[i].autoPerfectDeletedRollbackAttempts = true
        clean[i].autoPerfectCleanPriority = true
        clean[i].autoPerfectBridge = nil
        clean[i].autoPerfectConnector = nil
        if i == 1 then
            clean[i].time = 0
        else
            local prevTime = tonumber(clean[i - 1].time) or 0
            local t = tonumber(clean[i].time) or 0
            if t <= prevTime then clean[i].time = prevTime + SAMPLE_INTERVAL end
        end
    end
    return autoPerfectExactMarkUnsafeGaps(clean)
end

function autoPerfectFinalCleanAttemptFromSegment(segment)
    if type(segment) ~= "table" or #segment < 2 then return nil, false end
    if autoPerfectFinalSegmentHasFailureMarker(segment) then
        return nil, true
    end

    local sliced, rollbackFound = autoPerfectFinalSliceAfterLastRollback(segment)
    local source = (rollbackFound and #sliced > 1) and sliced or segment
    local clean = autoPerfectFinalNormalizeAttemptFrames(source)
    if #clean > 1 then
        return clean, rollbackFound == true
    end
    return nil, rollbackFound == true
end

function autoPerfectFinalBuildSourceSegments(rawSegments, fallbackFrames)
    local source = {}
    if type(rawSegments) == "table" and #rawSegments > 0 then
        for _, segment in ipairs(rawSegments) do
            if type(segment) == "table" and #segment > 1 then table.insert(source, segment) end
        end
    elseif type(fallbackFrames) == "table" and #fallbackFrames > 0 then
        for _, segment in ipairs(segmentsFromAutoPerfectCombined(fallbackFrames)) do
            if type(segment) == "table" and #segment > 1 then table.insert(source, segment) end
        end
    end
    return source
end

function autoPerfectFinalSelectCleanPriorityAttempt(rawSegments, fallbackFrames)
    local source = autoPerfectFinalBuildSourceSegments(rawSegments, fallbackFrames)
    if #source == 0 then return nil, false end

    local sawFailure = (tonumber(autoPerfectDiscardedFailureSegments) or 0) > 0
    local chosen = nil
    local chosenIndex = 0

    for index, segment in ipairs(source) do
        local clean, failedOrRollback = autoPerfectFinalCleanAttemptFromSegment(segment)
        if failedOrRollback then
            sawFailure = true
        end
        if clean and #clean > 1 then
            -- Ambil attempt bersih paling akhir; attempt gagal sebelumnya otomatis tertimpa/dibuang.
            chosen = clean
            chosenIndex = index
        end
    end

    -- Fallback tambahan: kalau rawSegments belum lengkap, potong fallback dari rollback terakhir.
    if (not chosen or #chosen < 2) and type(fallbackFrames) == "table" and #fallbackFrames > 1 then
        local sliced, rollbackFound = autoPerfectFinalSliceAfterLastRollback(fallbackFrames)
        if rollbackFound then sawFailure = true end
        local cleanFallback = autoPerfectFinalNormalizeAttemptFrames((rollbackFound and #sliced > 1) and sliced or fallbackFrames)
        if #cleanFallback > 1 then
            chosen = cleanFallback
            chosenIndex = #source + 1
        end
    end

    if chosen and #chosen > 1 and (sawFailure or #source > 1 or chosenIndex > 1) then
        for i = 1, #chosen do
            chosen[i].autoPerfectOnlyCleanAttemptSaved = true
            chosen[i].autoPerfectDeletedFailedBeforeStop = true
        end
        return chosen, true
    end

    return nil, sawFailure
end

function autoPerfectCleanupSavedRollbackRecordings(currentName)
    if type(savedRecordings) ~= "table" then return 0 end
    local toDelete = {}
    for name, rec in pairs(savedRecordings) do
        if name ~= currentName and type(rec) == "table" and rec.autoPerfect == true and rec.autoPerfectManualLikeV17 ~= true and type(rec.frames) == "table" and #rec.frames > 1 then
            if autoPerfectFinalFindLastRollbackStart(rec.frames) ~= nil then
                table.insert(toDelete, name)
            end
        end
    end
    for _, name in ipairs(toDelete) do
        savedRecordings[name] = nil
        if type(selectedRecordings) == "table" then selectedRecordings[name] = nil end
    end
    return #toDelete
end

-- Auto Perfect v9 - Final Attempt Only
-- Jika pernah mati/respawn/rollback checkpoint, semua segmen gagal sebelumnya dibuang.
-- Hasil akhir memakai hanya percobaan terakhir yang tidak kembali checkpoint/mati/respawn.
function autoPerfectExactGetLastFinalAttemptSegment(rawSegments, fallbackFrames)
    local source = nil
    if type(rawSegments) == "table" and #rawSegments > 0 then
        source = rawSegments
    elseif type(fallbackFrames) == "table" and #fallbackFrames > 0 then
        source = segmentsFromAutoPerfectCombined(fallbackFrames)
    end
    if type(source) ~= "table" or #source == 0 then return nil end

    local sawFailedRollbackSegment = false
    local lastFinalSegment = nil
    for _, segment in ipairs(source) do
        if type(segment) == "table" and #segment > 1 then
            local isFailed = (segment.autoPerfectCutBeforeFailure == true) or (segment.autoPerfectCheckpointRollback == true)
            if not isFailed then
                for _, frame in ipairs(segment) do
                    if type(frame) == "table" and (frame.autoPerfectCutBeforeFailure == true or frame.autoPerfectCheckpointRollback == true) then
                        isFailed = true
                        break
                    end
                end
            end
            if isFailed then
                sawFailedRollbackSegment = true
            else
                local sourceSegment = segment
                local sliced, rollbackFound = autoPerfectFinalSliceAfterLastRollback(segment)
                if rollbackFound and #sliced > 1 then
                    sawFailedRollbackSegment = true
                    sourceSegment = sliced
                    autoPerfectDiscardedFailureSegments = (tonumber(autoPerfectDiscardedFailureSegments) or 0) + 1
                end

                local clean = autoPerfectExactCleanSegment(sourceSegment)
                local startIndex = autoPerfectExactFindSupportedStart(clean, 360) or 1
                if startIndex > 1 then
                    local shifted = {}
                    for i = startIndex, #clean do table.insert(shifted, clean[i]) end
                    clean = shifted
                end
                if #clean > 1 and autoPerfectExactSegmentStartIsUsable(clean, 1) then
                    lastFinalSegment = clean
                end
            end
        end
    end

    -- Aktif hanya bila memang ada segmen rollback/mati/respawn sebelumnya.
    -- Kalau tidak ada kegagalan, behavior tetap seperti rekaman biasa.
    if sawFailedRollbackSegment and lastFinalSegment and #lastFinalSegment > 1 then
        return lastFinalSegment
    end
    return nil
end

function autoPerfectExactBuildLastFinalAttemptOnly(rawSegments, fallbackFrames)
    local segment = autoPerfectExactGetLastFinalAttemptSegment(rawSegments, fallbackFrames)
    if not segment then return nil end
    local output = {}
    local startIndex = autoPerfectExactFindSupportedStart(segment, 360) or 1
    autoPerfectExactAppendSegment(output, segment, startIndex, 1, nil)
    for i = 1, #output do
        output[i].autoPerfectSegment = 1
        output[i].autoPerfectFinalAttemptOnly = true
        output[i].autoPerfectDeletedRollbackAttempts = true
        if i == 1 then
            output[i].time = 0
        elseif (tonumber(output[i].time) or 0) <= (tonumber(output[i - 1].time) or 0) then
            output[i].time = (tonumber(output[i - 1].time) or 0) + SAMPLE_INTERVAL
        end
    end
    return autoPerfectExactMarkUnsafeGaps(output)
end

optimizeAutoPerfectFinalFrames = function(frames, rawSegments)
    -- v12: prioritas mutlak ke attempt bersih terakhir.
    -- Jika pernah mati/respawn/teleport checkpoint, hasil sebelum failure dibuang total.
    local cleanPriority, usedCleanPriority = autoPerfectFinalSelectCleanPriorityAttempt(rawSegments, frames)
    local final = nil
    if usedCleanPriority and cleanPriority and #cleanPriority > 1 then
        final = cleanPriority
    else
        final = autoPerfectExactBuildLastFinalAttemptOnly(rawSegments, frames)
        if not final or #final < 2 then
            final = autoPerfectExactBuildFinalFrames(rawSegments, frames)
        end
    end
    if not final or #final < 2 then
        final = autoPerfectExactCleanSegment(frames)
        for i = 1, #final do
            final[i].time = (i - 1) * (tonumber(SAMPLE_INTERVAL) or (1 / (tonumber(SAMPLE_RATE) or 55)))
            final[i].autoPerfectSegment = final[i].autoPerfectSegment or 1
            final[i].autoPerfectExactFrame = true
            final[i].autoPerfectStableRealFrame = true
        end
    end
    final = autoPerfectExactMarkUnsafeGaps(final)
    -- Timing Fix v16:
    -- Jangan densify dulu lalu masuk ke optimizeRecordingFramesLowLag.
    -- Urutan lama membuat frame sisipan berdurasi kecil dipaksa minimal 1/60 detik satu per satu,
    -- akibatnya durasi Auto Perfect membengkak dan playback terasa lambat/berat seperti ketarik magnet.
    -- Bersihkan lag pada frame asli dulu, baru tambah frame halus tanpa mengubah total durasi.
    final = optimizeRecordingFramesLowLag(final, true)
    local autoPerfectDurationBeforeDensify = tonumber(final[#final] and final[#final].time) or 0
    final = autoPerfectDensifySmoothFrames(final)
    local autoPerfectDurationAfterDensify = tonumber(final[#final] and final[#final].time) or 0
    if autoPerfectDurationBeforeDensify > 0 and autoPerfectDurationAfterDensify > 0 and math.abs(autoPerfectDurationAfterDensify - autoPerfectDurationBeforeDensify) > 0.025 then
        local timingScale = autoPerfectDurationBeforeDensify / autoPerfectDurationAfterDensify
        for i = 2, #final do
            final[i].time = (tonumber(final[i].time) or 0) * timingScale
        end
    end
    final = recordingRecomputeVelocities(final)
    final = autoPerfectExactMarkUnsafeGaps(final)
    return final
end


-- Auto Perfect Manual-Like v17
-- Hasil Auto Perfect disimpan dan diputar seperti rekaman biasa:
-- tidak memakai connector, hard-cut, exact playback, human/magnet correction, atau smoothing tambahan khusus Auto Perfect.
function autoPerfectStripToManualRecordingFrames(frames)
    local out = {}
    if type(frames) ~= "table" then return out end
    local firstTime = nil
    local lastTime = nil
    local interval = tonumber(SAMPLE_INTERVAL) or (1 / math.max(30, tonumber(SAMPLE_RATE) or 55))

    for _, frame in ipairs(frames) do
        if type(frame) == "table" and frame.position then
            local newFrame = recordingCloneFrame(frame)
            firstTime = firstTime or (tonumber(frame.time) or 0)
            local t = math.max(0, (tonumber(frame.time) or firstTime) - firstTime)
            if lastTime ~= nil and t <= lastTime then
                t = lastTime + interval
            end
            newFrame.time = t

            -- Hapus semua marker yang membuat playback masuk mode Auto Perfect khusus.
            newFrame.autoPerfect = nil
            newFrame.autoPerfectSegment = nil
            newFrame.autoPerfectAnchor = nil
            newFrame.autoPerfectBridge = nil
            newFrame.autoPerfectConnector = nil
            newFrame.autoPerfectGroundedBridge = nil
            newFrame.autoPerfectGrounded = nil
            newFrame.autoPerfectHardCut = nil
            newFrame.autoPerfectNoInterpolateFromPrevious = nil
            newFrame.autoPerfectSeamCut = nil
            newFrame.autoPerfectExactFrame = nil
            newFrame.autoPerfectExactSeam = nil
            newFrame.autoPerfectStableRealFrame = nil
            newFrame.autoPerfectStableSeam = nil
            newFrame.autoPerfectNormalMotion = nil
            newFrame.autoPerfectSingleLine = nil
            newFrame.autoPerfectFinalLine = nil
            newFrame.autoPerfectPerfectedSeam = nil
            newFrame.autoPerfectFinalAttemptOnly = nil
            newFrame.autoPerfectDeletedRollbackAttempts = nil
            newFrame.autoPerfectDeletedFailedBeforeStop = nil
            newFrame.autoPerfectOnlyCleanAttemptSaved = nil
            newFrame.autoPerfectCleanPriority = nil
            newFrame.autoPerfectCutBeforeFailure = nil
            newFrame.autoPerfectFinalAttempt = nil
            newFrame.autoPerfectCheckpointRollback = nil
            newFrame.autoPerfectFailedAttempt = nil
            newFrame.autoPerfectSeamFlat = nil
            newFrame.autoPerfectSeamVertical = nil
            newFrame.autoPerfectSeamRollback = nil
            newFrame.autoPerfectSeamSkipped = nil

            table.insert(out, newFrame)
            lastTime = t
        end
    end
    if #out > 0 then out[1].time = 0 end
    return out
end

optimizeAutoPerfectFinalFrames = function(frames, rawSegments)
    -- Ambil jalur bersih seperti Auto Perfect lama, tetapi output akhirnya dibuat setara rekaman biasa.
    local cleanPriority, usedCleanPriority = autoPerfectFinalSelectCleanPriorityAttempt(rawSegments, frames)
    local final = nil
    if usedCleanPriority and cleanPriority and #cleanPriority > 1 then
        final = cleanPriority
    else
        final = autoPerfectExactBuildLastFinalAttemptOnly(rawSegments, frames)
        if not final or #final < 2 then
            final = autoPerfectExactBuildFinalFrames(rawSegments, frames)
        end
    end
    if not final or #final < 2 then
        final = autoPerfectExactCleanSegment(frames)
    end

    final = autoPerfectStripToManualRecordingFrames(final)
    if #final < 2 then return final end

    -- Pakai pipeline yang sama dengan stopRecording() biasa agar feel/timing/hasilnya sama.
    final = optimizeRecordingFramesLowLag(final, false)
    final = autoPerfectStripToManualRecordingFrames(final)
    return final
end


function stopCurrentRecordingConnectionOnly()
    isRecording = false
    isWaitingForMovement = false
    if recordingConnection then recordingConnection:Disconnect(); recordingConnection = nil end
    local indicatorGui = CoreGui:FindFirstChild("RecordingIndicatorGUI")
    if indicatorGui then indicatorGui:Destroy() end
    disconnectAutoPerfectSignals()
end

function makeUniqueRecordingName(baseName)
    local cleanBase = tostring(baseName or "Rekaman")
    local newName, i = cleanBase, 1
    while savedRecordings[newName] do
        i = i + 1
        newName = cleanBase .. " " .. tostring(i)
    end
    return newName
end

finishAutoPerfectSession = function(reason, showNotificationFlag)
    if autoPerfectEnding then return end
    autoPerfectEnding = true
    local animateSnapshotToSave = (isOriginalAnimRecordEnabled and (autoPerfectInitialAnimateSnapshot or recordingAnimateSnapshot)) or nil

    if isRecording and currentRecordingData and #currentRecordingData > 0 then
        appendAutoPerfectFrames(currentRecordingData, false)
    end

    stopCurrentRecordingConnectionOnly()
    recordingAnimateSnapshot = nil
    currentRecordingData = {}
    currentRecordingTarget = nil
    autoPerfectRestarting = false
    autoPerfectSessionActive = false
    isAutoPerfectEnabled = false
    setAutoPerfectToggleVisual(false)
    setRecordButtonsActive(false)

    if recStatusLabel then recStatusLabel.Text = "Auto Perfect: finalisasi smooth dan buang attempt gagal..." end
    -- Proses akhir dibuat ringan: tidak smoothing/connector; segmen mati/respawn/rollback dibuang.
    task.wait(0.35)
    autoPerfectCombinedFrames = optimizeAutoPerfectFinalFrames(autoPerfectCombinedFrames, autoPerfectRawSegments)

    -- CleanFinal v10: kalau sudah ada hasil akhir bersih, data percobaan yang mati/respawn/rollback tidak ikut disimpan sama sekali.
    if #autoPerfectCombinedFrames > 1 and (tonumber(autoPerfectDiscardedFailureSegments) or 0) > 0 then
        autoPerfectRawSegments = {}
    end
    if isVisualLineEnabled and #autoPerfectCombinedFrames > 1 then
        local finalLineFrames = autoPerfectBuildCappedFinalLineFrames(autoPerfectCombinedFrames)
        task.defer(function() pcall(function() drawVisualLine(finalLineFrames, 0) end) end)
    end

    local finalName = nil
    if #autoPerfectCombinedFrames > 1 then
        local username = LocalPlayer and tostring(LocalPlayer.Name or LocalPlayer.DisplayName or "Arexans") or "Arexans"
        local safeMapName = (type(getCurrentMapName) == "function" and getCurrentMapName()) or ("Place " .. tostring(game.PlaceId))
        local safeUsername = (type(sanitizeFileComponent) == "function" and sanitizeFileComponent(username)) or tostring(username or "Arexans")
        finalName = makeUniqueRecordingName("Auto Perfect Perfect - " .. tostring(safeMapName) .. " - " .. tostring(safeUsername))
        savedRecordings[finalName] = {
            frames = autoPerfectCombinedFrames,
            targetUserId = LocalPlayer and LocalPlayer.UserId or 0,
            startPosition = autoPerfectCombinedFrames[1].position,
            startRotation = autoPerfectCombinedFrames[1].rotation,
            animateSnapshot = animateSnapshotToSave,
            -- Manual-Like v17: tetap tercatat sebagai Auto Perfect, tetapi diputar lewat jalur rekaman biasa.
            autoPerfect = true,
            autoPerfectSource = true,
            autoPerfectManualLikeV17 = true,
            autoPerfectExactPlayback = false,
            autoPerfectSingleLine = false,
            autoPerfectNormalPlayback = false,
            autoPerfectNormalMotion = false,
            autoPerfectFullRoute = false,
            autoPerfectOneLineSeam = false,
            autoPerfectPerfectedSeam = false,
            autoPerfectGroundedPlayback = false,
            autoPerfectNoMagnetPlayback = false,
            autoPerfectHumanPlayback = false,
            autoPerfectNoAnomalyPlayback = false,
            autoPerfectStablePlayback = false,
            autoPerfectSegments = autoPerfectSegmentCount,
            autoPerfectFinalAttemptOnly = true,
            autoPerfectDiscardedFailureSegments = tonumber(autoPerfectDiscardedFailureSegments) or 0,
            autoPerfectSmoothLowLagV11 = true,
            autoPerfectRealtimeLineNoLagV12 = true,
            autoPerfectPersistentVisualV13 = true,
            autoPerfectSmoothAntiLagV15 = true,
            autoPerfectTimingFixedV16 = true,
            autoPerfectNormalResultV17 = true,
            autoPerfectNaturalAirborneV18 = true,
            playbackLikeNormalRecording = true,
            autoPerfectRecordFps = SAMPLE_RATE,
            autoPerfectFinalSmoothFps = tonumber(autoPerfectSmoothFinalFps) or 60,
            stopReason = reason or "manual",
        }
        local deletedRollbackRecordings = 0
        pcall(function()
            deletedRollbackRecordings = autoPerfectCleanupSavedRollbackRecordings(finalName)
        end)
        if savedRecordings[finalName] then
            savedRecordings[finalName].autoPerfectDeletedOldRollbackRecordings = deletedRollbackRecordings
        end
        selectedRecordings = {}
        selectedRecordings[finalName] = true
        saveRecordingsData()
        if updateRecordingsList then pcall(updateRecordingsList) end
        if isVisualLineEnabled then task.defer(function() pcall(function() autoPerfectRefreshVisualLine(true) end) end) end
    end

    local statusText
    if finalName then
        statusText = "Auto Perfect Perfect selesai: " .. finalName
    elseif reason == "summit" then
        statusText = "Auto Perfect sampai summit, tapi data terlalu singkat."
    else
        statusText = "Auto Perfect dihentikan. Data terlalu singkat."
    end
    if recStatusLabel then recStatusLabel.Text = statusText end
    if showNotificationFlag then
        showNotification(statusText, finalName and Color3.fromRGB(50, 200, 50) or Color3.fromRGB(200, 150, 50))
    end

    autoPerfectCombinedFrames = {}
    autoPerfectRawSegments = {}
    autoPerfectSegmentCount = 0
    autoPerfectDiscardedFailureSegments = 0
    autoPerfectLastDiscardedCheckpointPosition = nil
    autoPerfectInitialAnimateSnapshot = nil
    autoPerfectSummitStartValues = {}
    autoPerfectLastSafeTime = 0
    autoPerfectLastGroundY = nil
    autoPerfectLiveLineLastDrawAt = 0
    autoPerfectLiveLineLastFrameCount = 0
    autoPerfectLastSummitCacheAt = 0
    autoPerfectSummitCache = {}
    autoPerfectCurrentAttemptHadFailure = false
    autoPerfectCleanAttemptStartedAt = 0
    autoPerfectLastObservedPosition = nil
    autoPerfectLastSummitCounterCheckAt = 0
    autoPerfectStatusLastUpdateAt = 0
    autoPerfectLastStatusText = nil
    autoPerfectRecovery.freefallStartedAt = nil
    autoPerfectRecovery.lastSafePosition = nil
    autoPerfectRecovery.lastSafeFrame = nil
    autoPerfectRecovery.lastSafeFrameTime = 0
    autoPerfectRecovery.lastCheckpointPosition = nil
    autoPerfectRecovery.lastCheckpointFrame = nil
    autoPerfectRecovery.lastCheckpointTime = 0
    autoPerfectRecovery.lastTouchedCheckpointPosition = nil
    autoPerfectRecovery.lastTouchedCheckpointAt = 0
    task.defer(function() autoPerfectEnding = false end)
end

handleAutoPerfectFailure = function(reason)
    if not autoPerfectSessionActive or autoPerfectRestarting then return end

    local rollbackPosition = getAutoPerfectRollbackPosition()
    autoPerfectCurrentAttemptHadFailure = true
    -- Low-Lag/CleanFinal v10: jangan biarkan line percobaan gagal tetap tergambar saat sudah rollback/respawn.
    if isVisualLineEnabled then pcall(clearVisualLine) end
    -- v5: script tidak lagi men-teleport player hanya karena jatuh.
    -- Gagal hanya diproses setelah mati/respawn atau server/game mengembalikan player ke checkpoint.

    -- v7 Final Attempt Only: frame sebelum mati/respawn/rollback tidak disalin lagi,
    -- supaya jalur gagal benar-benar hilang dari hasil akhir dan tidak membebani memori.

    stopCurrentRecordingConnectionOnly()
    -- v12: begitu failure resmi terdeteksi, buang semua aggregate lama.
    -- Hasil final nanti hanya boleh berasal dari attempt bersih setelah respawn/checkpoint ini.
    autoPerfectCombinedFrames = {}
    autoPerfectRawSegments = {}
    autoPerfectSegmentCount = 0
    currentRecordingData = {}
    currentRecordingTarget = nil
    recordingAnimateSnapshot = nil
    autoPerfectRestarting = true
    setRecordButtonsActive(true)
    if recStatusLabel then recStatusLabel.Text = "Auto Perfect: mati/teleport checkpoint terdeteksi, segmen gagal dibuang..." end

    task.spawn(function()
        local startedAt = tick()
        local checkpointPosition = nil
        local stableStartedAt = nil
        local lastStablePosition = nil
        local firstGroundedAt = nil
        local firstGroundedPosition = nil

        while autoPerfectSessionActive and (tick() - startedAt) < 20 do
            local char = LocalPlayer and LocalPlayer.Character
            local hrp = char and char:FindFirstChild("HumanoidRootPart")
            local humanoid = char and char:FindFirstChildOfClass("Humanoid")
            if hrp and humanoid and humanoid.Health > 0 then
                local grounded = false
                pcall(function() grounded = humanoid.FloorMaterial ~= Enum.Material.Air end)
                local stateName = getCurrentMoveState(humanoid)
                if grounded and stateName ~= "Freefall" and stateName ~= "Jumping" then
                    firstGroundedAt = firstGroundedAt or tick()
                    firstGroundedPosition = firstGroundedPosition or hrp.Position
                    if lastStablePosition and (hrp.Position - lastStablePosition).Magnitude <= 4 then
                        stableStartedAt = stableStartedAt or tick()
                    else
                        stableStartedAt = tick()
                        lastStablePosition = hrp.Position
                    end
                    -- Jangan terlalu lama menunggu. Begitu menyentuh checkpoint/ground dengan stabil singkat, langsung lanjut.
                    if (stableStartedAt and (tick() - stableStartedAt) >= autoPerfectRespawnStableSeconds) or (firstGroundedAt and (tick() - firstGroundedAt) >= 0.38) then
                        checkpointPosition = firstGroundedPosition or hrp.Position
                        break
                    end
                else
                    stableStartedAt = nil
                    lastStablePosition = nil
                    firstGroundedAt = nil
                    firstGroundedPosition = nil
                end
            end
            task.wait(0.08)
        end

        local appendCheckpointPosition = checkpointPosition or rollbackPosition
        if autoPerfectSessionActive then
            -- v7 Final Attempt Only:
            -- Segmen yang berakhir karena mati/respawn/teleport balik checkpoint TIDAK dimasukkan ke hasil akhir.
            -- Begitu rekaman lanjut dari checkpoint dan sukses sampai akhir, hanya percobaan terakhir itu yang disimpan.
            autoPerfectDiscardedFailureSegments = (tonumber(autoPerfectDiscardedFailureSegments) or 0) + 1
            if appendCheckpointPosition then
                autoPerfectLastDiscardedCheckpointPosition = appendCheckpointPosition
            end
        end

        autoPerfectRestarting = false
        if autoPerfectSessionActive and not isRecording and startRecording then
            startRecording(LocalPlayer, false)
            if recStatusLabel then recStatusLabel.Text = "Auto Perfect lanjut: percobaan gagal sudah disingkirkan, merekam percobaan bersih..." end
        end
    end)
end

function setupAutoPerfectCharacterSignals(character, hrp, humanoid)
    disconnectAutoPerfectSignals()
    if not autoPerfectSessionActive then return end
    if hrp then
        autoPerfectTouchConnection = hrp.Touched:Connect(function(hit)
            if not (autoPerfectSessionActive and hit) then return end
            if isAutoPerfectCheckpointObject(hit) then
                autoPerfectRecovery.lastTouchedCheckpointPosition = hrp.Position
                autoPerfectRecovery.lastTouchedCheckpointAt = tick()
                if autoPerfectRecovery.lastSafeFrame then
                    autoPerfectRecovery.lastCheckpointFrame = tableClone(autoPerfectRecovery.lastSafeFrame)
                    autoPerfectRecovery.lastCheckpointPosition = getAutoPerfectFramePosition(autoPerfectRecovery.lastCheckpointFrame) or hrp.Position
                    autoPerfectRecovery.lastCheckpointTime = tonumber(autoPerfectRecovery.lastCheckpointFrame.time) or autoPerfectRecovery.lastCheckpointTime or 0
                end
            end
            if isAutoPerfectSummitObject(hit) then
                task.defer(function()
                    finishAutoPerfectSession("summit", true)
                end)
            end
        end)
    end
    if humanoid then
        autoPerfectDiedConnection = humanoid.Died:Connect(function()
            handleAutoPerfectFailure("mati")
        end)
    end
end

beginAutoPerfectSession = function()
    if autoPerfectSessionActive then return end
    if isPlaying or isPaused then
        if stopPlayback then stopPlayback(false, true) end
    end
    if isRecording then
        stopRecording(true)
    end
    autoPerfectCombinedFrames = {}
    autoPerfectRawSegments = {}
    autoPerfectSegmentCount = 0
    autoPerfectDiscardedFailureSegments = 0
    autoPerfectLastDiscardedCheckpointPosition = nil
    autoPerfectInitialAnimateSnapshot = nil
    autoPerfectSummitStartValues = {}
    autoPerfectLastSafeTime = 0
    autoPerfectLastGroundY = nil
    autoPerfectLiveLineLastDrawAt = 0
    autoPerfectLiveLineLastFrameCount = 0
    autoPerfectLastSummitCacheAt = 0
    autoPerfectSummitCache = {}
    autoPerfectCurrentAttemptHadFailure = false
    autoPerfectCleanAttemptStartedAt = 0
    autoPerfectLastObservedPosition = nil
    autoPerfectLastSummitCounterCheckAt = 0
    autoPerfectStatusLastUpdateAt = 0
    autoPerfectLastStatusText = nil
    autoPerfectRecovery.freefallStartedAt = nil
    autoPerfectRecovery.lastSafePosition = nil
    autoPerfectRecovery.lastSafeFrame = nil
    autoPerfectRecovery.lastSafeFrameTime = 0
    autoPerfectRecovery.lastCheckpointPosition = nil
    autoPerfectRecovery.lastCheckpointFrame = nil
    autoPerfectRecovery.lastCheckpointTime = 0
    autoPerfectRecovery.lastTouchedCheckpointPosition = nil
    autoPerfectRecovery.lastTouchedCheckpointAt = 0
    autoPerfectRecordedBaseWalkSpeed = 16
    autoPerfectRestarting = false
    autoPerfectEnding = false
    captureAutoPerfectSummitCounters()
    autoPerfectRefreshSummitCache(true)
    autoPerfectSessionActive = true
    isAutoPerfectEnabled = true
    setAutoPerfectToggleVisual(true)
    if recStatusLabel then recStatusLabel.Text = "Auto Perfect aktif. Rekaman dimulai..." end
    if startRecording then
        startRecording(LocalPlayer, false)
    end
    -- Notifikasi toggle Auto Perfect dimatikan sesuai request.
end


-- Patch UI aman: jangan buat GUI baru dari rekaman.lua.
-- Pakai ScreenGui/MainFrame/MiniToggleButton asli ArexansTools yang sudah dibuat di bagian atas.
_arexansLastMainFrameToggleAt = _arexansLastMainFrameToggleAt or 0
function _arexansClampMainFrameToViewportSafe()
    if not MainFrame then return end
    local camera = Workspace and Workspace.CurrentCamera
    local viewport = camera and camera.ViewportSize or Vector2.new(800, 600)
    local size = MainFrame.AbsoluteSize
    local pos = MainFrame.AbsolutePosition
    local margin = 8
    local x, y = pos.X, pos.Y
    local changed = false
    if x > viewport.X - margin then
        x = math.max(margin, viewport.X - size.X - margin)
        changed = true
    elseif x + size.X < margin then
        x = margin
        changed = true
    end
    if y > viewport.Y - margin then
        y = math.max(margin, viewport.Y - size.Y - margin)
        changed = true
    elseif y + 30 < margin then
        y = margin
        changed = true
    end
    if changed then
        MainFrame.Position = UDim2.new(0, x, 0, y)
    end
end

function toggleMainFrame(forceState)
    local now = (tick and tick()) or os.clock()
    if now - (_arexansLastMainFrameToggleAt or 0) < 0.12 then return end
    _arexansLastMainFrameToggleAt = now
    if ScreenGui then ScreenGui.Enabled = true end
    if MainFrame and ScreenGui and not MainFrame.Parent then MainFrame.Parent = ScreenGui end
    if not MainFrame then return end
    local shouldShow = (type(forceState) == "boolean") and forceState or (not MainFrame.Visible)
    if shouldShow then _arexansClampMainFrameToViewportSafe() end
    MainFrame.Visible = shouldShow
    if MiniToggleButton and UI and UI.Icons then
        MiniToggleButton.Text = shouldShow and (UI.Icons.Right or MiniToggleButton.Text) or (UI.Icons.Left or MiniToggleButton.Text)
    end
    if MainFrame.Visible and isGradientRole and isGradientRole() and refreshRoleGradientUI then
        pcall(function() refreshRoleGradientUI(ScreenGui) end)
    end
end

function cleanupSinglePlayback(isSequence)
    -- v14: jangan matikan/hapus Visual Line otomatis saat playback selesai/berganti.
    -- User bebas ON/OFF manual; clear hanya dilakukan kalau toggle memang OFF.
    if not isVisualLineEnabled then clearVisualLine() end
    local char = LocalPlayer.Character
    if not char then return end
    local hrp = char:FindFirstChild("HumanoidRootPart")
    local humanoid = char:FindFirstChildOfClass("Humanoid")
    local animateScript = char:FindFirstChild("Animate")
    if hrp then
        hrp.Anchored = false
        hrp.AssemblyLinearVelocity = Vector3.zero
        hrp.AssemblyAngularVelocity = Vector3.zero
        hrp.Velocity = Vector3.zero
        hrp.RotVelocity = Vector3.zero
    end
    if humanoid then
        humanoid.WalkSpeed = originalPlaybackWalkSpeed
        humanoid.PlatformStand = false
        humanoid.AutoRotate = true
        humanoid:Move(Vector3.new(0, 0, 0), false)
        stopNonCorePlaybackTracks(humanoid)
    end
    if playbackAppliedRecordedAnimate and playbackRestoreAnimateSnapshot then
        applyAnimateSnapshot(char, playbackRestoreAnimateSnapshot)
    elseif animateScript and animateScript.Disabled then
        animateScript.Disabled = false
    end
    playbackAppliedRecordedAnimate = false
    playbackRestoreAnimateSnapshot = nil
    if humanoid and humanoid:GetState() ~= Enum.HumanoidStateType.Dead then
        pcall(function() humanoid:ChangeState(Enum.HumanoidStateType.GettingUp) end)
        task.wait()
        pcall(function() humanoid:ChangeState(Enum.HumanoidStateType.Running) end)
    end
end

stopPlayback = function(isSequence, isManual)
    if not isPlaying and not isPaused then return end
    isPlaying = false
    isPaused = false
    if playbackConnection then playbackConnection:Disconnect(); playbackConnection = nil end
    cleanupSinglePlayback(isSequence)
    if playButton then
        if playButton:IsA("ImageButton") then playButton.Image = "rbxassetid://" .. UI.Icons.PlayButton else playButton.Text = UI.Icons.PlayButton end
        playButton.BackgroundColor3 = getResolvedThemeColor(Color3.fromRGB(0, 170, 255))
    end
    if recStatusLabel and not isRecording then recStatusLabel.Text = "Pemutaran ulang dihentikan." end
end

stopActions = function()
    if autoPerfectSessionActive then
        autoPerfectSessionActive = false
        isAutoPerfectEnabled = false
        autoPerfectRestarting = false
        autoPerfectCombinedFrames = {}
        autoPerfectRawSegments = {}
        autoPerfectSegmentCount = 0
        autoPerfectInitialAnimateSnapshot = nil
        autoPerfectSummitStartValues = {}
        autoPerfectRecovery.freefallStartedAt = nil
        autoPerfectRecovery.lastSafePosition = nil
        autoPerfectRecovery.lastSafeFrame = nil
        autoPerfectRecovery.lastSafeFrameTime = 0
        autoPerfectRecovery.lastCheckpointPosition = nil
        autoPerfectRecovery.lastCheckpointFrame = nil
        autoPerfectRecovery.lastCheckpointTime = 0
        autoPerfectRecovery.lastTouchedCheckpointPosition = nil
        autoPerfectRecovery.lastTouchedCheckpointAt = 0
        disconnectAutoPerfectSignals()
        setAutoPerfectToggleVisual(false)
    end
    isRecording = false
    if recordingConnection then recordingConnection:Disconnect(); recordingConnection = nil end
    local indicatorGui = CoreGui:FindFirstChild("RecordingIndicatorGUI")
    if indicatorGui then indicatorGui:Destroy() end
    setRecordButtonsActive(false)
    isPlaying = false
    isPaused = false
    if playbackConnection then playbackConnection:Disconnect(); playbackConnection = nil end
    cleanupSinglePlayback(false)
    if playButton then
        if playButton:IsA("ImageButton") then playButton.Image = "rbxassetid://" .. UI.Icons.PlayButton else playButton.Text = UI.Icons.PlayButton end
    end
    if recStatusLabel then recStatusLabel.Text = "Semua aksi dihentikan." end
end

playSingleRecording = function(recordingObject, onComplete)
    local char = LocalPlayer.Character
    local hrp = char and char:FindFirstChild("HumanoidRootPart")
    local humanoid = char and char:FindFirstChildOfClass("Humanoid")
    if not (hrp and humanoid) then if onComplete then onComplete() end; return end
    local recordingData = recordingObject.frames or recordingObject
    if not recordingData or #recordingData < 2 then if onComplete then onComplete() end; return end

    local startSample = recordingData[1]
    local startPosition = tableToVector(startSample.position)
    local startRotation = startSample.rotation or 0
    local recordedHipHeight = startSample.hipHeight or 2
    local currentHipHeight = humanoid.HipHeight
    playbackOffset = currentHipHeight - recordedHipHeight
    hrp.CFrame = CFrame.new(startPosition.X, startPosition.Y + playbackOffset, startPosition.Z) * CFrame.Angles(0, startRotation, 0)
    hrp.AssemblyLinearVelocity = Vector3.new(0, 0, 0)
    hrp.AssemblyAngularVelocity = Vector3.new(0, 0, 0)
    originalPlaybackWalkSpeed = humanoid.WalkSpeed
    humanoid:ChangeState(Enum.HumanoidStateType.Running)

    playbackAppliedRecordedAnimate = false
    playbackRestoreAnimateSnapshot = nil
    if isOriginalAnimRecordEnabled and recordingObject.animateSnapshot then
        playbackRestoreAnimateSnapshot = captureAnimateSnapshot(char)
        if applyAnimateSnapshot(char, recordingObject.animateSnapshot) then
            playbackAppliedRecordedAnimate = true
            stopNonCorePlaybackTracks(humanoid)
        end
    else
        local animateScript = char:FindFirstChild("Animate")
        if animateScript and animateScript.Disabled then animateScript.Disabled = false end
    end

    pcall(function() autoPerfectSetPlaybackVisualData(recordingData, playbackOffset) end)
    if isVisualLineEnabled then
        task.defer(function() pcall(function() autoPerfectRefreshVisualLine(true) end) end)
    end
    local recordingDuration = tonumber(recordingData[#recordingData] and recordingData[#recordingData].time) or 0
    if recordingDuration <= 0 then if onComplete then onComplete() end; return end
    local autoPerfectPlaybackTimingMultiplier = getAutoPerfectPlaybackTimingMultiplier(recordingObject, recordingData)
    local useNaturalAutoPerfectPlayback = shouldUseNaturalAutoPerfectPlayback(recordingObject)
    local stateChangeCooldown = getSafeStateChangeCooldown()

    lastPlaybackState = nil
    lastStateChangeTime = 0
    local lastPlaybackJumpTriggerTime = -999
    local playbackTime = 0
    local lastUpdateTime = tick()

    playbackConnection = RunService.Heartbeat:Connect(function()
        if not isPlaying then
            if playbackConnection then playbackConnection:Disconnect(); playbackConnection = nil end
            return
        end
        if isPaused then
            lastUpdateTime = tick()
            return
        end
        local currentTime = tick()
        local realDelta = currentTime - lastUpdateTime
        lastUpdateTime = currentTime
        realDelta = math.min(tonumber(realDelta) or 0, 0.1)
        playbackTime = playbackTime + (realDelta * getSafePlaybackSpeed() * (autoPerfectPlaybackTimingMultiplier or 1))
        if playbackTime >= recordingDuration then
            if playbackConnection then playbackConnection:Disconnect(); playbackConnection = nil end
            cleanupSinglePlayback(onComplete ~= nil)
            if onComplete then onComplete() end
            return
        end
        local index1, index2, alpha = findInterpolationIndices(recordingData, playbackTime)
        local sample1, sample2 = recordingData[index1], recordingData[index2]
        if not sample1 or not sample2 then return end
        if sample2.autoPerfectNoInterpolateFromPrevious or sample2.autoPerfectHardCut then
            -- Hindari interpolasi panjang antarsegmen yang terlihat seperti terbang/melayang.
            -- Untuk Auto Perfect, hard cut hanya dipakai bila tidak ada seam asli yang cukup dekat.
            alpha = (playbackTime >= (tonumber(sample2.time) or playbackTime)) and 1 or 0
            if alpha >= 1 then sample1 = sample2 end
        end
        local pos1 = tableToVector(sample1.position)
        local pos2 = tableToVector(sample2.position)
        local rot1 = sample1.rotation or 0
        local rot2 = sample2.rotation or 0
        local moveDir1 = tableToVector(sample1.moveDirection or {x = 0, y = 0, z = 0})
        local moveDir2 = tableToVector(sample2.moveDirection or {x = 0, y = 0, z = 0})
        local targetPosition = lerpVector3(pos1, pos2, alpha)
        local targetRotation = lerpAngle(rot1, rot2, alpha)
        local targetMoveDir = lerpVector3(moveDir1, moveDir2, alpha)
        local sampleState = sample1.state or "Running"
        local frameVel = getFrameVelocity(sample1, sampleState)
        if frameVel.Y > JUMP_VELOCITY_THRESHOLD and sampleState ~= "Jumping" then sampleState = "Jumping"
        elseif frameVel.Y < -5 and sampleState ~= "Freefall" then sampleState = "Freefall" end
        local desiredCFrame = CFrame.new(targetPosition.X, targetPosition.Y + playbackOffset, targetPosition.Z) * CFrame.Angles(0, targetRotation, 0)
        if useNaturalAutoPerfectPlayback or ((recordingObject.autoPerfectHumanPlayback or recordingObject.autoPerfectNoAnomalyPlayback or recordingObject.autoPerfectStablePlayback or recordingObject.autoPerfectNormalPlayback) and not recordingObject.autoPerfect and not recordingObject.autoPerfectExactPlayback) then
            -- Auto Perfect Natural v18:
            -- Saat Jumping/Freefall jangan kunci Y dan jangan paksa velocity vertikal rekaman.
            -- Y dibiarkan oleh physics Roblox supaya lompatan/jatuh terlihat seperti player asli.
            local playbackWalkSpeed = getAutoPerfectFrameSpeed(sample1)
            humanoid.WalkSpeed = playbackWalkSpeed
            humanoid.AutoRotate = true
            humanoid.PlatformStand = false

            local naturalMoveDir = targetMoveDir
            if naturalMoveDir.Magnitude <= 0.04 then
                local flatDelta = Vector3.new(pos2.X - pos1.X, 0, pos2.Z - pos1.Z)
                if flatDelta.Magnitude > 0.05 and flatDelta.Magnitude < 45 then naturalMoveDir = flatDelta.Unit end
            end
            if naturalMoveDir.Magnitude > 1 then naturalMoveDir = naturalMoveDir.Unit end
            if sampleState == "FallingDown" or sampleState == "Dead" then sampleState = "Running" end

            local wantsJump = (sampleState == "Jumping") or (sample1 and sample1.jumping == true) or (sample2 and sample2.jumping == true)
            local airborne = (sampleState == "Jumping" or sampleState == "Freefall")
            local currentPos = hrp.Position
            local desiredPos = desiredCFrame.Position
            local flatDeltaToRecord = Vector3.new(desiredPos.X - currentPos.X, 0, desiredPos.Z - currentPos.Z)
            local flatError = flatDeltaToRecord.Magnitude

            if flatError > 1.35 and naturalMoveDir.Magnitude <= 0.05 then
                naturalMoveDir = flatDeltaToRecord.Unit
            end
            humanoid:Move(naturalMoveDir, false)

            local cooldown = tonumber(stateChangeCooldown) or getSafeStateChangeCooldown()
            local canTriggerJump = wantsJump
                and ((sampleState ~= lastPlaybackState) or humanoid.FloorMaterial ~= Enum.Material.Air)
                and ((currentTime - (tonumber(lastPlaybackJumpTriggerTime) or -999)) >= 0.18)
            if canTriggerJump then
                pcall(function() humanoid.Jump = true end)
                pcall(function() humanoid:ChangeState(Enum.HumanoidStateType.Jumping) end)
                lastPlaybackJumpTriggerTime = currentTime
            end

            if airborne then
                -- Koreksi horizontal sangat pelan; Y/arc lompatan tidak disentuh.
                local correctionAlpha = 0
                if flatError > 12 then
                    correctionAlpha = math.clamp(realDelta * 1.10, 0.025, 0.075)
                elseif flatError > 4 then
                    correctionAlpha = math.clamp(realDelta * 0.80, 0.015, 0.045)
                elseif flatError > 1.25 then
                    correctionAlpha = math.clamp(realDelta * 0.45, 0.006, 0.022)
                end
                if correctionAlpha > 0 then
                    currentPos = Vector3.new(
                        lerp(currentPos.X, desiredPos.X, correctionAlpha),
                        currentPos.Y,
                        lerp(currentPos.Z, desiredPos.Z, correctionAlpha)
                    )
                end
                hrp.CFrame = CFrame.new(currentPos) * CFrame.Angles(0, targetRotation, 0)

                local currentVel = hrp.AssemblyLinearVelocity
                local targetFlatVel = Vector3.new(naturalMoveDir.X * playbackWalkSpeed, 0, naturalMoveDir.Z * playbackWalkSpeed)
                local flatBlend = math.clamp(realDelta * 3.2, 0.025, 0.14)
                hrp.AssemblyLinearVelocity = Vector3.new(
                    lerp(currentVel.X, targetFlatVel.X, flatBlend),
                    currentVel.Y,
                    lerp(currentVel.Z, targetFlatVel.Z, flatBlend)
                )
            else
                -- Di tanah tetap boleh mengikuti rekaman, tapi koreksi dibuat smooth agar tidak patah.
                local groundAlpha = 1
                if useNaturalAutoPerfectPlayback then
                    if flatError > 10 then
                        groundAlpha = math.clamp(realDelta * 5.0, 0.18, 0.55)
                    elseif flatError > 2 then
                        groundAlpha = math.clamp(realDelta * 4.0, 0.10, 0.35)
                    elseif flatError > 0.35 then
                        groundAlpha = math.clamp(realDelta * 3.0, 0.05, 0.22)
                    end
                end
                if groundAlpha >= 0.98 then
                    hrp.CFrame = desiredCFrame
                else
                    local smoothPos = Vector3.new(
                        lerp(currentPos.X, desiredPos.X, groundAlpha),
                        lerp(currentPos.Y, desiredPos.Y, math.min(groundAlpha, 0.28)),
                        lerp(currentPos.Z, desiredPos.Z, groundAlpha)
                    )
                    hrp.CFrame = CFrame.new(smoothPos) * CFrame.Angles(0, targetRotation, 0)
                end
                local targetVel = frameVel
                if targetVel.Magnitude <= 0.05 then
                    targetVel = Vector3.new(naturalMoveDir.X * playbackWalkSpeed, 0, naturalMoveDir.Z * playbackWalkSpeed)
                end
                hrp.AssemblyLinearVelocity = Vector3.new(targetVel.X, math.min(targetVel.Y, 2), targetVel.Z)
            end

            if sampleState ~= lastPlaybackState and (currentTime - (tonumber(lastStateChangeTime) or 0)) >= cooldown then
                if wantsJump then
                    pcall(function() humanoid:ChangeState(Enum.HumanoidStateType.Jumping) end)
                elseif sampleState == "Climbing" then
                    pcall(function() humanoid:ChangeState(Enum.HumanoidStateType.Climbing) end)
                    humanoid.PlatformStand = false
                elseif sampleState == "Swimming" then
                    pcall(function() humanoid:ChangeState(Enum.HumanoidStateType.Swimming) end)
                elseif sampleState ~= "Freefall" then
                    pcall(function() humanoid:ChangeState(Enum.HumanoidStateType.Running) end)
                end
                lastPlaybackState = sampleState
                lastStateChangeTime = currentTime
            end
            hrp.AssemblyAngularVelocity = Vector3.zero
            return
        end

        if (recordingObject.autoPerfectNormalPlayback or recordingObject.autoPerfectSingleLine or recordingObject.autoPerfectStablePlayback) and not recordingObject.autoPerfect and not recordingObject.autoPerfectExactPlayback and not recordingObject.autoPerfectNoMagnetPlayback then
            local currentPos = hrp.Position
            local desiredPos = desiredCFrame.Position
            local flatDelta = Vector3.new(desiredPos.X - currentPos.X, 0, desiredPos.Z - currentPos.Z)
            local flatError = flatDelta.Magnitude
            local playbackWalkSpeed = getAutoPerfectFrameSpeed(sample1)
            humanoid.WalkSpeed = playbackWalkSpeed

            local naturalMoveDir = targetMoveDir
            if naturalMoveDir.Magnitude <= 0.05 and flatError > 0.05 then
                naturalMoveDir = flatDelta.Unit
            end
            if sampleState == "Freefall" or sampleState == "FallingDown" or sampleState == "Dead" then
                sampleState = "Running"
            end
            humanoid:Move(naturalMoveDir, false)

            -- Auto Perfect tidak mengunci Y ke data rekaman. Koreksi hanya horizontal + rotasi,
            -- supaya karakter tetap menapak/melompat normal dan tidak terlihat terbang/ditarik magnet.
            local correctionAlpha = 0
            if recordingObject.autoPerfectGroundedPlayback or recordingObject.autoPerfectPerfectedSeam or recordingObject.autoPerfectStablePlayback then
                -- Hasil Auto Perfect yang sudah disempurnakan jangan ditarik keras.
                -- Koreksi hanya halus supaya playback tetap tampak seperti jalan/lompat normal.
                if flatError > 14 then
                    correctionAlpha = math.clamp(realDelta * 0.75, 0.015, 0.045)
                elseif flatError > 3.5 then
                    correctionAlpha = math.clamp(realDelta * 0.85, 0.012, 0.035)
                elseif flatError > 1.2 then
                    correctionAlpha = math.clamp(realDelta * 0.55, 0.006, 0.02)
                end
            else
                if flatError > autoPerfectPlaybackHardCorrectionFlat then
                    correctionAlpha = math.clamp(realDelta * 1.35, 0.025, 0.09)
                elseif flatError > 1.15 then
                    correctionAlpha = math.clamp(realDelta * 2.25, 0.035, autoPerfectPlaybackSoftCorrection)
                elseif flatError > 0.35 then
                    correctionAlpha = math.clamp(realDelta * 1.25, 0.02, 0.08)
                end
            end
            if correctionAlpha > 0 then
                local correctedPos = Vector3.new(
                    lerp(currentPos.X, desiredPos.X, correctionAlpha),
                    currentPos.Y,
                    lerp(currentPos.Z, desiredPos.Z, correctionAlpha)
                )
                hrp.CFrame = CFrame.new(correctedPos) * CFrame.Angles(0, targetRotation, 0)
            else
                -- Rotasi tetap mengikuti rekaman, posisi dibiarkan oleh physics/humanoid.
                hrp.CFrame = CFrame.new(currentPos) * CFrame.Angles(0, targetRotation, 0)
            end

            local currentVel = hrp.AssemblyLinearVelocity
            local yVelocity = currentVel.Y
            if sampleState == "Jumping" and frameVel.Y > JUMP_VELOCITY_THRESHOLD then
                yVelocity = math.clamp(frameVel.Y, JUMP_VELOCITY_THRESHOLD, 42)
            end
            if recordingObject.autoPerfectGroundedPlayback or recordingObject.autoPerfectPerfectedSeam then
                local currentVel = hrp.AssemblyLinearVelocity
                local targetVel = Vector3.new(naturalMoveDir.X * playbackWalkSpeed, yVelocity, naturalMoveDir.Z * playbackWalkSpeed)
                hrp.AssemblyLinearVelocity = Vector3.new(
                    lerp(currentVel.X, targetVel.X, math.clamp(realDelta * 8, 0.12, 0.45)),
                    yVelocity,
                    lerp(currentVel.Z, targetVel.Z, math.clamp(realDelta * 8, 0.12, 0.45))
                )
            else
                hrp.AssemblyLinearVelocity = Vector3.new(naturalMoveDir.X * playbackWalkSpeed, yVelocity, naturalMoveDir.Z * playbackWalkSpeed)
            end
        else
            if recordingObject.autoPerfectStablePlayback then
                -- Stable Auto Perfect diputar seperti rekaman normal: tidak ada magnet/correction/human force.
                humanoid.WalkSpeed = tonumber(sample1.walkSpeed) or tonumber(autoPerfectRecordedBaseWalkSpeed) or originalPlaybackWalkSpeed
                humanoid.AutoRotate = true
                humanoid.PlatformStand = false
            end
            hrp.CFrame = desiredCFrame
            hrp.AssemblyLinearVelocity = frameVel
            humanoid:Move(targetMoveDir, false)
        end
        hrp.AssemblyAngularVelocity = Vector3.zero
        local cooldown = tonumber(stateChangeCooldown) or getSafeStateChangeCooldown()
        if sampleState ~= lastPlaybackState and (currentTime - (tonumber(lastStateChangeTime) or 0)) >= cooldown then
            if sampleState == "Jumping" then pcall(function() humanoid:ChangeState(Enum.HumanoidStateType.Jumping) end)
            elseif sampleState == "Freefall" then pcall(function() humanoid:ChangeState(Enum.HumanoidStateType.Freefall) end)
            elseif sampleState == "Climbing" then pcall(function() humanoid:ChangeState(Enum.HumanoidStateType.Climbing) end); humanoid.PlatformStand = false
            elseif sampleState == "Swimming" then pcall(function() humanoid:ChangeState(Enum.HumanoidStateType.Swimming) end)
            else pcall(function() humanoid:ChangeState(Enum.HumanoidStateType.Running) end) end
            lastPlaybackState = sampleState
            lastStateChangeTime = currentTime
        end
    end)
end

function playSequence(replayCountBox)
    if isPlaying then return end
    local sortedNames = {}
    for name in pairs(savedRecordings or {}) do table.insert(sortedNames, name) end
    table.sort(sortedNames, naturalCompare)
    local sequenceToPlay = {}
    for _, recName in ipairs(sortedNames) do
        if selectedRecordings[recName] then
            table.insert(sequenceToPlay, {name = recName, data = savedRecordings[recName]})
        end
    end
    if #sequenceToPlay == 0 then
        recStatusLabel.Text = "Pilih rekaman untuk diputar."
        showNotification("Pilih rekaman dulu.", Color3.fromRGB(200, 150, 50))
        return
    end
    local countText = replayCountBox.Text
    local replayCount = tonumber(countText)
    if countText == "" or countText == "0" then replayCount = math.huge elseif not replayCount or replayCount < 1 then replayCount = 1 end
    isPlaying = true
    isPaused = false
    if playButton:IsA("ImageButton") then playButton.Image = "rbxassetid://" .. UI.Icons.Pause else playButton.Text = UI.Icons.Pause end
    playButton.BackgroundColor3 = Color3.fromRGB(80, 80, 80)
    local currentPlayRun = 1
    local currentSequenceIndex = 1
    local function playNextInSequence()
        if not isPlaying then stopPlayback(); return end
        while isPaused do
            if not isPlaying then stopPlayback(); return end
            task.wait(0.1)
        end
        if currentSequenceIndex > #sequenceToPlay then
            currentPlayRun = currentPlayRun + 1
            if currentPlayRun > replayCount then
                stopPlayback()
                recStatusLabel.Text = "Pemutaran sekuens selesai."
                return
            end
            cleanupSinglePlayback(false)
            task.wait(0.2)
            currentSequenceIndex = 1
            recStatusLabel.Text = string.format("Memutar sekuens: %d/%s", currentPlayRun, replayCount == math.huge and UI.Icons.Infinity or tostring(replayCount))
        end
        local item = sequenceToPlay[currentSequenceIndex]
        recStatusLabel.Text = string.format("Memutar: %s (%d/%d)", item.name, currentSequenceIndex, #sequenceToPlay)
        playSingleRecording(item.data, function()
            currentSequenceIndex = currentSequenceIndex + 1
            task.wait(0.35)
            playNextInSequence()
        end)
    end
    recStatusLabel.Text = string.format("Memutar sekuens: %d/%s", currentPlayRun, replayCount == math.huge and UI.Icons.Infinity or tostring(replayCount))
    playNextInSequence()
end

startRecording = function(targetPlayer, showNotificationFlag)
    if isRecording then return end
    targetPlayer = targetPlayer or LocalPlayer
    currentRecordingTarget = targetPlayer

    local recordingIndicatorGui = Instance.new("ScreenGui", CoreGui)
    recordingIndicatorGui.Name = "RecordingIndicatorGUI"
    recordingIndicatorGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    recordingIndicatorGui.DisplayOrder = 99
    local indicatorFrame = Instance.new("Frame", recordingIndicatorGui)
    indicatorFrame.AnchorPoint = Vector2.new(1, 0)
    indicatorFrame.Position = UDim2.new(1, -10, 0, 10)
    indicatorFrame.Size = UDim2.new(0, 110, 0, 25)
    indicatorFrame.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
    indicatorFrame.BackgroundTransparency = 0.5
    Instance.new("UICorner", indicatorFrame).CornerRadius = UDim.new(0, 8)
    local indicatorLabel = Instance.new("TextLabel", indicatorFrame)
    indicatorLabel.Size = UDim2.new(1, 0, 1, 0)
    indicatorLabel.BackgroundTransparency = 1
    indicatorLabel.Font = Enum.Font.SourceSansBold
    indicatorLabel.Text = (UI.IconText and UI.IconText.RedCircle or "●") .. " Recording..."
    indicatorLabel.TextColor3 = Color3.fromRGB(255, 80, 80)
    indicatorLabel.TextSize = 14

    local char = targetPlayer.Character
    local hrp = char and char:FindFirstChild("HumanoidRootPart")
    local humanoid = char and char:FindFirstChildOfClass("Humanoid")
    if not (hrp and humanoid) then
        if recordingIndicatorGui then recordingIndicatorGui:Destroy() end
        if recStatusLabel then recStatusLabel.Text = "Karakter target tidak ditemukan." end
        showNotification("Icon rekam belum bisa dipakai: karakter belum siap/respawn dulu.", Color3.fromRGB(200, 150, 50))
        currentRecordingTarget = nil
        return
    end

    recordingAnimateSnapshot = nil
    if isOriginalAnimRecordEnabled and type(captureAnimateSnapshot) == "function" then
        recordingAnimateSnapshot = captureAnimateSnapshot(char)
    end
    if autoPerfectSessionActive then
        if not autoPerfectInitialAnimateSnapshot then
            autoPerfectInitialAnimateSnapshot = recordingAnimateSnapshot
        end
        indicatorLabel.Text = (UI.IconText and UI.IconText.RedCircle or "●") .. " Auto Perfect..."
        setupAutoPerfectCharacterSignals(char, hrp, humanoid)
    end
    isRecording = true
    isWaitingForMovement = not autoPerfectSessionActive
    currentRecordingData = {}
    wasMoving = false
    if autoPerfectSessionActive then
        autoPerfectResetRealtimeLine(false)
        autoPerfectLiveLineLastDrawAt = 0
        autoPerfectLiveLineLastFrameCount = 0
        autoPerfectCleanAttemptStartedAt = tick()
        autoPerfectCurrentAttemptHadFailure = false
        autoPerfectLastObservedPosition = hrp.Position
        autoPerfectStatusLastUpdateAt = 0
        autoPerfectLastStatusText = nil
    end
    if isVisualLineEnabled then
        autoPerfectResetRealtimeLine(false)
        autoPerfectRealtimeLineLastPosition = hrp.Position
        autoPerfectEnsureVisualHeartbeat()
        autoPerfectEnsureRealtimeCharacterTrail()
    end
    lastRecordedPosition = nil
    currentSampleTime = 0
    recordStartTime = tick()
    recordingLagGuardLastHeavyCheckAt = 0
    recordingFrameDropCount = 0
    recordingLastLoopAt = recordStartTime
    recordingUiFrameCountLastAt = 0
    autoPerfectLastSafeTime = 0
    autoPerfectLastGroundY = hrp.Position.Y
    if autoPerfectSessionActive then
        autoPerfectRecordedBaseWalkSpeed = tonumber(humanoid.WalkSpeed) or autoPerfectRecordedBaseWalkSpeed or 16
        local _, initialRotation, _ = hrp.CFrame:ToOrientation()
        local initialState = getCurrentMoveState(humanoid)
        local initialAutoPerfectFrame = {
            time = 0,
            position = vectorToTable(hrp.Position),
            rotation = initialRotation,
            velocity = vectorToTable(Vector3.new(0, 0, 0)),
            moveDirection = vectorToTable(Vector3.new(0, 0, 0)),
            jumping = false,
            state = initialState == "Freefall" and "Running" or initialState,
            hipHeight = humanoid.HipHeight,
            walkSpeed = humanoid.WalkSpeed,
            grounded = (humanoid.FloorMaterial ~= Enum.Material.Air),
            floorMaterial = tostring(humanoid.FloorMaterial):gsub("Enum.Material.", ""),
            autoPerfectAnchor = true,
        }
        table.insert(currentRecordingData, initialAutoPerfectFrame)
        rememberAutoPerfectSafeFrame(initialAutoPerfectFrame, true)
        lastRecordedPosition = hrp.Position
        setRecordingStatusSmooth("Auto Perfect: siap. Mode smooth low-lag aktif...", true)
    else
        setRecordingStatusSmooth("Menunggu pergerakan... " .. (UI.IconText and UI.IconText.RedCircle or "●"), true)
    end
    if showNotificationFlag then showNotification("Recording started (tekan C untuk stop)", Color3.fromRGB(50, 200, 50)) end
    setRecordButtonsActive(true)

    recordingConnection = RunService.Heartbeat:Connect(function()
        if not isRecording then return end
        char = currentRecordingTarget and currentRecordingTarget.Character
        hrp = char and char:FindFirstChild("HumanoidRootPart")
        humanoid = char and char:FindFirstChildOfClass("Humanoid")
        if not (hrp and humanoid and humanoid.Health > 0) then
            if autoPerfectSessionActive then
                handleAutoPerfectFailure("respawn/mati")
            else
                recStatusLabel.Text = "Target hilang, perekaman dihentikan."
                stopActions()
            end
            return
        end
        local loopNow = tick()
        local loopDt = loopNow - (tonumber(recordingLastLoopAt) or loopNow)
        recordingLastLoopAt = loopNow
        if loopDt > (tonumber(recordingLagSpikeThreshold) or 0.115) then
            recordingFrameDropCount = (tonumber(recordingFrameDropCount) or 0) + 1
        end
        local velocity = hrp.AssemblyLinearVelocity
        local hSpeed = Vector3.new(velocity.X, 0, velocity.Z).Magnitude
        local stateName = getCurrentMoveState(humanoid)
        local autoPerfectSampleTime = loopNow - recordStartTime
        local allowHeavyCheck = true
        if autoPerfectSessionActive then
            allowHeavyCheck = (loopNow - (tonumber(recordingLagGuardLastHeavyCheckAt) or 0)) >= (tonumber(recordingLagGuardHeavyCheckInterval) or 0.075)
            if allowHeavyCheck then recordingLagGuardLastHeavyCheckAt = loopNow end
            if allowHeavyCheck and shouldAutoPerfectCutForRollbackTeleport(hrp, humanoid, stateName) then
                handleAutoPerfectFailure("teleport checkpoint")
                return
            end
            autoPerfectLastObservedPosition = hrp.Position
        end
        if (not autoPerfectSessionActive) or allowHeavyCheck then
            updateAutoPerfectSafePoint(humanoid, hrp, stateName, autoPerfectSampleTime)
        end
        if autoPerfectSessionActive and allowHeavyCheck then
            if isNearAutoPerfectSummit(hrp.Position) or (autoPerfectShouldCheckSummitCounter() and hasAutoPerfectSummitCounterIncreased()) then
                finishAutoPerfectSession("summit", true)
                return
            end
            if shouldAutoPerfectCutForFall(humanoid, hrp, stateName, velocity) then
                handleAutoPerfectFailure("jatuh")
                return
            end
        end
        local isJumpingOrFalling = stateName == "Jumping" or stateName == "Freefall"
        local isMovingNow = hSpeed > 0.5 or isJumpingOrFalling
        if isWaitingForMovement then
            if isMovingNow then
                isWaitingForMovement = false
                recordStartTime = tick()
                currentSampleTime = 0
                setRecordingStatusSmooth("Merekam: " .. targetPlayer.DisplayName .. " " .. (UI.IconText and UI.IconText.RedCircle or "●"), true)
            else
                return
            end
        end
        local sampleTime = loopNow - recordStartTime
        if ((tonumber(sampleTime) or 0) - (tonumber(currentSampleTime) or 0)) < (tonumber(SAMPLE_INTERVAL) or (1 / (tonumber(SAMPLE_RATE) or 55))) then return end
        if not isMovingNow then
            if wasMoving then setRecordingStatusSmooth("Menjeda (diam)... | " .. #currentRecordingData .. " frame", false, 0.5) end
            wasMoving = false
            recordStartTime = tick() - currentSampleTime
            return
        end
        if not wasMoving then setRecordingStatusSmooth("Merekam: " .. targetPlayer.DisplayName .. " " .. (UI.IconText and UI.IconText.RedCircle or "●"), true) end
        wasMoving = true
        local position = hrp.Position
        if not shouldSamplePosition(position) then return end
        lastRecordedPosition = position
        currentSampleTime = sampleTime
        local _, yRotation, _ = hrp.CFrame:ToOrientation()
        local frameData = {
            time = sampleTime,
            position = vectorToTable(position),
            rotation = yRotation,
            velocity = vectorToTable(velocity),
            moveDirection = vectorToTable(humanoid.MoveDirection),
            jumping = (stateName == "Jumping"),
            state = stateName,
            hipHeight = humanoid.HipHeight,
            walkSpeed = humanoid.WalkSpeed,
            grounded = (humanoid.FloorMaterial ~= Enum.Material.Air),
            floorMaterial = tostring(humanoid.FloorMaterial):gsub("Enum.Material.", ""),
        }
        table.insert(currentRecordingData, frameData)
        if (loopNow - (tonumber(recordingUiFrameCountLastAt) or 0)) >= 0.75 then
            recordingUiFrameCountLastAt = loopNow
            if recordingFrameDropCount and recordingFrameDropCount > 0 then
                setRecordingStatusSmooth("Merekam smooth: " .. tostring(#currentRecordingData) .. " frame | lag dibersihkan saat simpan", false, 0.75)
            end
        end
        if autoPerfectSessionActive then
            local explicitCheckpoint = autoPerfectRecovery.lastTouchedCheckpointPosition
                and (tick() - (autoPerfectRecovery.lastTouchedCheckpointAt or 0)) <= 2.5
                and (position - autoPerfectRecovery.lastTouchedCheckpointPosition).Magnitude <= math.max(10, autoPerfectCheckpointRadius)
            rememberAutoPerfectSafeFrame(frameData, explicitCheckpoint)
        end
        if isVisualLineEnabled then
            -- v11: jangan redraw line penuh tiap sample; pakai preview ringan supaya rekam tidak freeze.
            autoPerfectMaybeDrawLiveLine(currentRecordingData, 0)
        end
    end)
end

stopRecording = function(showNotificationFlag)
    if autoPerfectSessionActive then
        finishAutoPerfectSession("manual", showNotificationFlag)
        return
    end
    if not isRecording then return end
    isRecording = false
    isWaitingForMovement = false
    if recordingConnection then recordingConnection:Disconnect(); recordingConnection = nil end
    local indicatorGui = CoreGui:FindFirstChild("RecordingIndicatorGUI")
    if indicatorGui then indicatorGui:Destroy() end
    if showNotificationFlag then showNotification("Recording stopped.", Color3.fromRGB(200, 50, 50)) end
    local dataToSave = optimizeRecordingFramesLowLag(currentRecordingData, false)
    local targetForSave = currentRecordingTarget
    local animateSnapshotToSave = (isOriginalAnimRecordEnabled and recordingAnimateSnapshot) or nil
    recordingAnimateSnapshot = nil
    currentRecordingData = {}
    currentRecordingTarget = nil
    setRecordButtonsActive(false)
    if #dataToSave > 1 then
        local baseName = (targetForSave and targetForSave.Name ~= LocalPlayer.Name) and "Rekaman " .. targetForSave.Name or "Rekaman Diri"
        local newName, i = baseName .. " 1", 1
        while savedRecordings[newName] do i = i + 1; newName = baseName .. " " .. i end
        local recordingObject = {
            frames = dataToSave,
            targetUserId = targetForSave and targetForSave.UserId or 0,
            startPosition = dataToSave[1].position,
            startRotation = dataToSave[1].rotation,
            animateSnapshot = animateSnapshotToSave,
            smoothAntiLagV15 = true,
            recordFps = SAMPLE_RATE,
            finalSmoothFps = tonumber(recordingSmoothFinalFps) or 60,
            cleanedLagSpikes = tonumber(recordingFrameDropCount) or 0,
        }
        savedRecordings[newName] = recordingObject
        selectedRecordings = {}
        selectedRecordings[newName] = true
        if updateRecordingsList then pcall(updateRecordingsList) end
        if isVisualLineEnabled then task.defer(function() pcall(function() autoPerfectRefreshVisualLine(true) end) end) end
        recStatusLabel.Text = "Rekaman disimpan sebagai: " .. newName
        local ok, err = saveRecordingsData()
        if ok then showNotification("Rekaman disimpan: " .. newName, Color3.fromRGB(50, 200, 50))
        else showNotification("Memori OK, file gagal: " .. tostring(err), Color3.fromRGB(200, 150, 50)) end
    else
        recStatusLabel.Text = "Perekaman dibatalkan (terlalu singkat)."
        showNotification("Perekaman dibatalkan (terlalu singkat).", Color3.fromRGB(200, 150, 50))
    end
end

function showTrimPrompt(recordingName, recordingData, callback)
    local coreGuiParent = CoreGui
    local old = coreGuiParent:FindFirstChild("TrimPromptGUI")
    if old then old:Destroy() end
    local gui = Instance.new("ScreenGui", coreGuiParent)
    gui.Name = "TrimPromptGUI"
    gui.DisplayOrder = 25
    gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    local frame = Instance.new("Frame", gui)
    frame.Size = UDim2.new(0, 250, 0, 155)
    frame.Position = UDim2.new(1, -265, 0.5, -78)
    frame.BackgroundColor3 = Color3.fromRGB(16, 18, 28)
    frame.BackgroundTransparency = 0.08
    frame.BorderSizePixel = 0
    Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 8)
    local stroke = Instance.new("UIStroke", frame)
    stroke.Name = "TrimPromptStroke"
    stroke.Color = getResolvedThemeColor(Color3.fromRGB(0, 170, 255))
    stroke.Thickness = 1
    registerThemeElement(stroke, "Color", stroke.Color)
    local title = Instance.new("TextLabel", frame)
    title.Size = UDim2.new(1, -34, 0, 24)
    title.Position = UDim2.new(0, 10, 0, 2)
    title.BackgroundTransparency = 1
    title.Text = "Pangkas: " .. recordingName
    title.TextColor3 = Color3.fromRGB(255, 255, 255)
    title.TextSize = 12
    title.Font = Enum.Font.SourceSansBold
    title.TextXAlignment = Enum.TextXAlignment.Left
    local close = Instance.new("TextButton", frame)
    close.Size = UDim2.new(0, 22, 0, 22)
    close.Position = UDim2.new(1, -26, 0, 2)
    close.BackgroundTransparency = 1
    close.Text = "X"
    close.TextColor3 = Color3.fromRGB(255, 255, 255)
    close.Font = Enum.Font.SourceSansBold
    close.MouseButton1Click:Connect(function() gui:Destroy() end)
    UI.MakeDraggable(frame, title, function() return true end, nil)

    local duration = recordingData.frames[#recordingData.frames].time or 0
    local function makeBox(labelText, y, defaultText)
        local label = Instance.new("TextLabel", frame)
        label.Size = UDim2.new(0.45, -10, 0, 22)
        label.Position = UDim2.new(0, 10, 0, y)
        label.BackgroundTransparency = 1
        label.Text = labelText
        label.TextColor3 = Color3.fromRGB(210, 210, 210)
        label.TextSize = 12
        label.Font = Enum.Font.SourceSans
        label.TextXAlignment = Enum.TextXAlignment.Left
        local box = Instance.new("TextBox", frame)
        box.Size = UDim2.new(0.55, -15, 0, 22)
        box.Position = UDim2.new(0.45, 5, 0, y)
        box.BackgroundTransparency = 1
        box.Text = tostring(defaultText)
        box.PlaceholderText = tostring(defaultText)
        box.TextColor3 = Color3.fromRGB(255, 255, 255)
        box.TextSize = 12
        box.Font = Enum.Font.SourceSans
        box.ClearTextOnFocus = false
        Instance.new("UICorner", box).CornerRadius = UDim.new(0, 5)
        local bs = Instance.new("UIStroke", box)
        bs.Color = getResolvedThemeColor(Color3.fromRGB(0, 170, 255))
        bs.Thickness = 1
        registerThemeElement(bs, "Color", bs.Color)
        return box
    end
    local nameBox = makeBox("Nama baru", 32, recordingName .. " Trim")
    local startBox = makeBox("Mulai detik", 60, "0")
    local endBox = makeBox("Akhir detik", 88, string.format("%.2f", duration))
    local saveBtn = UI.createButton(frame, "Simpan Pangkas", function()
        local newName = tostring(nameBox.Text or "")
        local startTime = tonumber(startBox.Text) or 0
        local endTime = tonumber(endBox.Text) or duration
        startTime = math.clamp(startTime, 0, duration)
        endTime = math.clamp(endTime, 0, duration)
        if newName == "" then showNotification("Nama tidak boleh kosong.", Color3.fromRGB(200, 50, 50)); return end
        if endTime <= startTime then showNotification("Akhir harus lebih besar dari mulai.", Color3.fromRGB(200, 50, 50)); return end
        local finalName = newName
        local counter = 2
        while savedRecordings[finalName] do
            finalName = newName .. " " .. counter
            counter = counter + 1
        end
        callback(finalName, startTime, endTime)
        gui:Destroy()
    end)
    saveBtn.Size = UDim2.new(1, -20, 0, 25)
    saveBtn.Position = UDim2.new(0, 10, 1, -33)
    if isGradientRole() then refreshRoleGradientUI(gui) end
end

setupRekamanTab = function()
    if not RekamanTabContent then return end

    -- Tab Rekaman dirapikan tanpa menyentuh TabsFrame/tab lain.
    -- Kontrol rekaman diperkecil dan bisa disembunyikan agar daftar rekaman punya ruang.
    local controlsExpanded = true
    local expandedControlsHeight = 142
    local collapsedControlsHeight = 26
    local compactIconSize = 28
    local recordingsListFrame

    local controlsContainer = Instance.new("Frame")
    controlsContainer.Name = "ControlsContainer"
    controlsContainer.Size = UDim2.new(1, 0, 0, expandedControlsHeight)
    controlsContainer.Position = UDim2.new(0, 0, 0, 0)
    controlsContainer.BackgroundTransparency = 1
    controlsContainer.Parent = RekamanTabContent

    local controlsLayout = Instance.new("UIListLayout", controlsContainer)
    controlsLayout.Padding = UDim.new(0, 4)
    controlsLayout.SortOrder = Enum.SortOrder.LayoutOrder
    controlsLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center

    local controlsHeader = Instance.new("Frame", controlsContainer)
    controlsHeader.Name = "ControlsHeader"
    controlsHeader.Size = UDim2.new(1, 0, 0, 22)
    controlsHeader.BackgroundTransparency = 1
    controlsHeader.LayoutOrder = 1

    local controlsTitle = Instance.new("TextLabel", controlsHeader)
    controlsTitle.Name = "ControlsTitle"
    controlsTitle.Size = UDim2.new(1, -36, 1, 0)
    controlsTitle.Position = UDim2.new(0, 4, 0, 0)
    controlsTitle.BackgroundTransparency = 1
    controlsTitle.Font = Enum.Font.SourceSansBold
    controlsTitle.Text = "Kontrol Rekaman"
    controlsTitle.TextColor3 = Color3.fromRGB(220, 220, 220)
    controlsTitle.TextSize = 12
    controlsTitle.TextXAlignment = Enum.TextXAlignment.Left

    local hideControlsButton = Instance.new("TextButton", controlsHeader)
    hideControlsButton.Name = "HideControlsButton"
    hideControlsButton.Size = UDim2.new(0, 28, 0, 22)
    hideControlsButton.Position = UDim2.new(1, -30, 0, 0)
    hideControlsButton.BackgroundTransparency = 1
    hideControlsButton.Font = Enum.Font.SourceSansBold
    hideControlsButton.Text = UI.Icons.Up or "^"
    hideControlsButton.TextColor3 = getResolvedThemeColor(Color3.fromRGB(0, 170, 255))
    hideControlsButton.TextSize = 14
    registerThemeElement(hideControlsButton, "TextColor3", hideControlsButton.TextColor3)
    UI.RegisterButtonEffect(hideControlsButton)

    local controlsBody = Instance.new("Frame", controlsContainer)
    controlsBody.Name = "ControlsBody"
    controlsBody.Size = UDim2.new(1, 0, 0, expandedControlsHeight - 26)
    controlsBody.BackgroundTransparency = 1
    controlsBody.LayoutOrder = 2

    local bodyLayout = Instance.new("UIListLayout", controlsBody)
    bodyLayout.Padding = UDim.new(0, 4)
    bodyLayout.SortOrder = Enum.SortOrder.LayoutOrder
    bodyLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center

    local actionIconsScrollFrame = Instance.new("ScrollingFrame")
    actionIconsScrollFrame.Name = "ActionIconsScrollFrame"
    actionIconsScrollFrame.Size = UDim2.new(1, 0, 0, 32)
    actionIconsScrollFrame.BackgroundTransparency = 1
    actionIconsScrollFrame.BorderSizePixel = 0
    actionIconsScrollFrame.CanvasSize = UDim2.new(0, 0, 0, 0)
    actionIconsScrollFrame.ScrollBarThickness = 2
    actionIconsScrollFrame.ScrollBarImageColor3 = getResolvedThemeColor(Color3.fromRGB(0, 170, 255))
    actionIconsScrollFrame.ScrollingDirection = Enum.ScrollingDirection.X
    actionIconsScrollFrame.ScrollingEnabled = true
    actionIconsScrollFrame.Active = true
    actionIconsScrollFrame.ClipsDescendants = true
    actionIconsScrollFrame.LayoutOrder = 1
    actionIconsScrollFrame.Parent = controlsBody
    pcall(function() actionIconsScrollFrame.AutomaticCanvasSize = Enum.AutomaticSize.X end)
    registerThemeElement(actionIconsScrollFrame, "ScrollBarImageColor3", actionIconsScrollFrame.ScrollBarImageColor3)

    local actionIconsLayout = Instance.new("UIListLayout", actionIconsScrollFrame)
    actionIconsLayout.FillDirection = Enum.FillDirection.Horizontal
    actionIconsLayout.Padding = UDim.new(0, 5)
    actionIconsLayout.SortOrder = Enum.SortOrder.LayoutOrder
    actionIconsLayout.HorizontalAlignment = Enum.HorizontalAlignment.Left
    actionIconsLayout.VerticalAlignment = Enum.VerticalAlignment.Center

    local actionIconsPadding = Instance.new("UIPadding", actionIconsScrollFrame)
    actionIconsPadding.PaddingTop = UDim.new(0, 2)
    actionIconsPadding.PaddingBottom = UDim.new(0, 2)
    actionIconsPadding.PaddingLeft = UDim.new(0, 4)
    actionIconsPadding.PaddingRight = UDim.new(0, 4)

    local function refreshActionIconsCanvas()
        if not actionIconsScrollFrame or not actionIconsScrollFrame.Parent then return end
        local oldCanvasPosition = actionIconsScrollFrame.CanvasPosition or Vector2.new(0, 0)
        local contentWidth = (actionIconsLayout and actionIconsLayout.AbsoluteContentSize.X or 0) + 14
        actionIconsScrollFrame.CanvasSize = UDim2.new(0, contentWidth, 0, 0)
        task.defer(function()
            if not actionIconsScrollFrame or not actionIconsScrollFrame.Parent then return end
            local visibleWidth = tonumber(actionIconsScrollFrame.AbsoluteWindowSize.X) or tonumber(actionIconsScrollFrame.AbsoluteSize.X) or 0
            local maxX = math.max(0, contentWidth - visibleWidth)
            actionIconsScrollFrame.CanvasPosition = Vector2.new(math.clamp(tonumber(oldCanvasPosition.X) or 0, 0, maxX), 0)
        end)
    end
    actionIconsLayout:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(refreshActionIconsCanvas)

    local replaySpeedRow = Instance.new("Frame", controlsBody)
    replaySpeedRow.Name = "ReplaySpeedRow"
    replaySpeedRow.Size = UDim2.new(1, -8, 0, 24)
    replaySpeedRow.BackgroundTransparency = 1
    replaySpeedRow.LayoutOrder = 2

    local replayLabel = Instance.new("TextLabel", replaySpeedRow)
    replayLabel.Size = UDim2.new(0, 74, 1, 0)
    replayLabel.Position = UDim2.new(0, 0, 0, 0)
    replayLabel.BackgroundTransparency = 1
    replayLabel.Font = Enum.Font.SourceSans
    replayLabel.Text = "Ulang:"
    replayLabel.TextColor3 = Color3.fromRGB(200, 200, 200)
    replayLabel.TextSize = 11
    replayLabel.TextXAlignment = Enum.TextXAlignment.Left

    local replayCountBox = Instance.new("TextBox", replaySpeedRow)
    replayCountBox.Name = "ReplayCountBox"
    replayCountBox.Size = UDim2.new(0, 54, 1, 0)
    replayCountBox.Position = UDim2.new(0, 50, 0, 0)
    replayCountBox.BackgroundTransparency = 1
    replayCountBox.Font = Enum.Font.SourceSans
    replayCountBox.Text = "1"
    replayCountBox.PlaceholderText = "1"
    replayCountBox.TextColor3 = Color3.fromRGB(220, 220, 220)
    replayCountBox.TextSize = 11
    replayCountBox.ClearTextOnFocus = false
    local replayBoxStroke = Instance.new("UIStroke", replayCountBox)
    replayBoxStroke.Color = getResolvedThemeColor(Color3.fromRGB(0, 170, 255))
    replayBoxStroke.Thickness = 1
    replayBoxStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    registerThemeElement(replayBoxStroke, "Color", replayBoxStroke.Color)
    Instance.new("UICorner", replayCountBox).CornerRadius = UDim.new(0, 4)
    replayCountBox:GetPropertyChangedSignal("Text"):Connect(function()
        replayCountBox.Text = replayCountBox.Text:gsub("%D", "")
    end)

    local speedLabel = Instance.new("TextLabel", replaySpeedRow)
    speedLabel.Size = UDim2.new(0, 64, 1, 0)
    speedLabel.Position = UDim2.new(0, 116, 0, 0)
    speedLabel.BackgroundTransparency = 1
    speedLabel.Font = Enum.Font.SourceSans
    speedLabel.Text = "Speed:"
    speedLabel.TextColor3 = Color3.fromRGB(200, 200, 200)
    speedLabel.TextSize = 11
    speedLabel.TextXAlignment = Enum.TextXAlignment.Left

    local speedBox = Instance.new("TextBox", replaySpeedRow)
    speedBox.Name = "PlaybackSpeedBox"
    speedBox.Size = UDim2.new(0, 58, 1, 0)
    speedBox.Position = UDim2.new(0, 166, 0, 0)
    speedBox.BackgroundTransparency = 1
    speedBox.Font = Enum.Font.SourceSans
    speedBox.Text = tostring(getSafePlaybackSpeed())
    speedBox.PlaceholderText = "1"
    speedBox.TextColor3 = Color3.fromRGB(220, 220, 220)
    speedBox.TextSize = 11
    speedBox.ClearTextOnFocus = false
    local speedBoxStroke = Instance.new("UIStroke", speedBox)
    speedBoxStroke.Color = getResolvedThemeColor(Color3.fromRGB(0, 170, 255))
    speedBoxStroke.Thickness = 1
    speedBoxStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    registerThemeElement(speedBoxStroke, "Color", speedBoxStroke.Color)
    Instance.new("UICorner", speedBox).CornerRadius = UDim.new(0, 4)
    speedBox.FocusLost:Connect(function()
        playbackSpeed = math.clamp(tonumber(speedBox.Text) or 1, 0.1, 5)
        speedBox.Text = tostring(playbackSpeed)
        showNotification("Playback speed: " .. tostring(playbackSpeed), Color3.fromRGB(50, 200, 50))
    end)

    local compactTogglesRow = Instance.new("Frame", controlsBody)
    compactTogglesRow.Name = "CompactTogglesRow"
    compactTogglesRow.Size = UDim2.new(1, -8, 0, 30)
    compactTogglesRow.BackgroundTransparency = 1
    compactTogglesRow.LayoutOrder = 3

    local compactTogglesLayout = Instance.new("UIListLayout", compactTogglesRow)
    compactTogglesLayout.FillDirection = Enum.FillDirection.Horizontal
    compactTogglesLayout.Padding = UDim.new(0, 5)
    compactTogglesLayout.SortOrder = Enum.SortOrder.LayoutOrder
    compactTogglesLayout.VerticalAlignment = Enum.VerticalAlignment.Center

    local function makeCompactToggle(parent, labelText, initialState, callback, order)
        local state = initialState == true
        local frame = Instance.new("Frame", parent)
        frame.Name = tostring(labelText):gsub("%s+", "") .. "CompactToggle"
        frame.Size = UDim2.new(0.333, -4, 1, 0)
        frame.BackgroundTransparency = 1
        frame.LayoutOrder = order or 1

        local label = Instance.new("TextLabel", frame)
        label.Size = UDim2.new(1, -34, 1, 0)
        label.Position = UDim2.new(0, 0, 0, 0)
        label.BackgroundTransparency = 1
        label.Font = Enum.Font.SourceSans
        label.Text = labelText
        label.TextColor3 = Color3.fromRGB(220, 220, 220)
        label.TextSize = 10
        label.TextXAlignment = Enum.TextXAlignment.Left
        label.TextTruncate = Enum.TextTruncate.AtEnd

        local switch = Instance.new("TextButton", frame)
        switch.Name = "Switch"
        switch.Size = UDim2.new(0, 30, 0, 16)
        switch.Position = UDim2.new(1, -30, 0.5, -8)
        switch.Text = ""
        switch.BorderSizePixel = 0
        Instance.new("UICorner", switch).CornerRadius = UDim.new(1, 0)

        local knob = Instance.new("Frame", switch)
        knob.Name = "Knob"
        knob.Size = UDim2.new(0, 12, 0, 12)
        knob.BorderSizePixel = 0
        knob.BackgroundColor3 = Color3.fromRGB(245, 245, 245)
        Instance.new("UICorner", knob).CornerRadius = UDim.new(1, 0)

        local clickLayer = Instance.new("TextButton", frame)
        clickLayer.Name = "ClickLayer"
        clickLayer.Size = UDim2.new(1, 0, 1, 0)
        clickLayer.BackgroundTransparency = 1
        clickLayer.Text = ""
        clickLayer.ZIndex = switch.ZIndex + 1

        local function render()
            switch.BackgroundColor3 = state and getResolvedThemeColor(Color3.fromRGB(0, 170, 255)) or Color3.fromRGB(45, 55, 65)
            knob.Position = state and UDim2.new(1, -14, 0.5, -6) or UDim2.new(0, 2, 0.5, -6)
        end
        local function setState(newState, silent)
            state = newState == true
            render()
            if not silent and callback then
                __ArexansToggleCallbackDepth = (__ArexansToggleCallbackDepth or 0) + 1
                local ok, err = pcall(callback, state)
                __ArexansToggleCallbackDepth = math.max((__ArexansToggleCallbackDepth or 1) - 1, 0)
                if not ok then warn("Toggle " .. tostring(labelText) .. " error: " .. tostring(err)) end
            end
        end
        clickLayer.MouseButton1Click:Connect(function() setState(not state, false) end)
        switch.MouseButton1Click:Connect(function() setState(not state, false) end)
        render()
        return frame, switch, function(newState) setState(newState, true) end
    end

    local function styleWindowIconButton(button, order)
        if not button then return end
        button.LayoutOrder = order
        button.Size = UDim2.new(0, compactIconSize, 0, compactIconSize)
        button.BackgroundTransparency = 1
        local stroke = button:FindFirstChildOfClass("UIStroke")
        if stroke then
            stroke.Thickness = 1
            stroke.Transparency = 0.02
        end
        local image = button:FindFirstChild("ArexansIconImage") or button:FindFirstChildOfClass("ImageLabel")
        if image then image.Size = UDim2.new(0.76, 0, 0.76, 0) end
    end

    local exportButton = UI.createIconButton(actionIconsScrollFrame, UI.Icons.ExportFile, Color3.fromRGB(50, 150, 200), compactIconSize)
    styleWindowIconButton(exportButton, 1)
    local importButton = UI.createIconButton(actionIconsScrollFrame, UI.Icons.ImportFile, Color3.fromRGB(50, 150, 200), compactIconSize)
    styleWindowIconButton(importButton, 2)
    recordButton = UI.createIconButton(actionIconsScrollFrame, UI.Icons.RedCircle or UI.Icons.StartRecord, getResolvedThemeColor(Color3.fromRGB(0, 170, 255)), compactIconSize)
    if recordButton then recordButton.Name = "RecordingControlButton" end
    styleWindowIconButton(recordButton, 3)
    playButton = UI.createIconButton(actionIconsScrollFrame, UI.Icons.PlayButton, getResolvedThemeColor(Color3.fromRGB(0, 170, 255)), compactIconSize)
    styleWindowIconButton(playButton, 4)
    local stopButton = UI.createIconButton(actionIconsScrollFrame, UI.Icons.ResetStopRecord, Color3.fromRGB(200, 80, 80), compactIconSize)
    styleWindowIconButton(stopButton, 5)
    local selectAllButton = UI.createIconButton(actionIconsScrollFrame, UI.Icons.CheckBallot, Color3.fromRGB(120, 120, 120), compactIconSize)
    styleWindowIconButton(selectAllButton, 6)
    local trimButton = UI.createIconButton(actionIconsScrollFrame, UI.Icons.Scissors, Color3.fromRGB(200, 150, 50), compactIconSize)
    styleWindowIconButton(trimButton, 7)
    local joinButton = UI.createIconButton(actionIconsScrollFrame, UI.Icons.Link, Color3.fromRGB(100, 200, 100), compactIconSize)
    styleWindowIconButton(joinButton, 8)
    local deleteSelectedButton = UI.createIconButton(actionIconsScrollFrame, UI.Icons.DeleteRecord, Color3.fromRGB(200, 50, 50), compactIconSize)
    styleWindowIconButton(deleteSelectedButton, 9)
    task.defer(refreshActionIconsCanvas)

    local visualLineToggle
    visualLineToggle, _, autoPerfectVisualToggleSetState = makeCompactToggle(compactTogglesRow, "Visual Line", isVisualLineEnabled, function(v)
        setVisualLineEnabledPersistent(v, false)
    end, 1)

    local originalAnimToggle
    originalAnimToggle = makeCompactToggle(compactTogglesRow, "Original Anim", isOriginalAnimRecordEnabled, function(v)
        isOriginalAnimRecordEnabled = v == true
        -- Notifikasi toggle dimatikan sesuai request.
    end, 2)

    local autoPerfectToggle
    autoPerfectToggle, _, autoPerfectToggleSetState = makeCompactToggle(compactTogglesRow, "Auto Perfect", isAutoPerfectEnabled, function(v)
        isAutoPerfectEnabled = v == true
        if isAutoPerfectEnabled then
            beginAutoPerfectSession()
        else
            if autoPerfectSessionActive then
                finishAutoPerfectSession("manual", false)
            else
                -- Notifikasi toggle dimatikan sesuai request.
            end
        end
    end, 3)

    recStatusLabel = Instance.new("TextLabel", controlsBody)
    recStatusLabel.Name = "StatusLabel"
    recStatusLabel.Size = UDim2.new(1, -8, 0, 18)
    recStatusLabel.BackgroundTransparency = 1
    recStatusLabel.Font = Enum.Font.SourceSansItalic
    recStatusLabel.Text = "Siap."
    recStatusLabel.TextColor3 = Color3.fromRGB(180, 180, 180)
    recStatusLabel.TextSize = 10
    recStatusLabel.TextXAlignment = Enum.TextXAlignment.Left
    recStatusLabel.LayoutOrder = 4

    recordingsListFrame = Instance.new("ScrollingFrame")
    recordingsListFrame.Name = "RecordingsListFrame"
    recordingsListFrame.BackgroundTransparency = 1
    recordingsListFrame.BorderSizePixel = 0
    recordingsListFrame.CanvasSize = UDim2.new(0, 0, 0, 0)
    recordingsListFrame.ScrollBarThickness = 4
    recordingsListFrame.ScrollBarImageColor3 = getResolvedThemeColor(Color3.fromRGB(0, 170, 255))
    recordingsListFrame.ScrollingDirection = Enum.ScrollingDirection.Y
    recordingsListFrame.Parent = RekamanTabContent
    registerThemeElement(recordingsListFrame, "ScrollBarImageColor3", recordingsListFrame.ScrollBarImageColor3)

    local recListLayout = Instance.new("UIListLayout", recordingsListFrame)
    recListLayout.Padding = UDim.new(0, 4)
    recListLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
    recListLayout.SortOrder = Enum.SortOrder.LayoutOrder
    local recListPadding = Instance.new("UIPadding", recordingsListFrame)
    recListPadding.PaddingTop = UDim.new(0, 5)
    recListPadding.PaddingBottom = UDim.new(0, 5)
    recListPadding.PaddingLeft = UDim.new(0, 5)
    recListPadding.PaddingRight = UDim.new(0, 5)

    local function applyRecordingControlsLayout()
        local newHeight = controlsExpanded and expandedControlsHeight or collapsedControlsHeight
        controlsContainer.Size = UDim2.new(1, 0, 0, newHeight)
        controlsBody.Visible = controlsExpanded
        hideControlsButton.Text = controlsExpanded and (UI.Icons.Up or "^") or (UI.Icons.Down or "v")
        if recordingsListFrame then
            recordingsListFrame.Position = UDim2.new(0, 0, 0, newHeight + 4)
            recordingsListFrame.Size = UDim2.new(1, 0, 1, -(newHeight + 8))
        end
    end

    hideControlsButton.MouseButton1Click:Connect(function()
        controlsExpanded = not controlsExpanded
        applyRecordingControlsLayout()
    end)
    applyRecordingControlsLayout()

    updateRecordingsList = function()
        if not recordingsListFrame then return end
        local scrollPos = recordingsListFrame.CanvasPosition
        local sortedNames = {}
        for name in pairs(savedRecordings or {}) do table.insert(sortedNames, name) end
        table.sort(sortedNames, naturalCompare)
        local existingFrames = {}
        for _, child in ipairs(recordingsListFrame:GetChildren()) do
            if child:IsA("Frame") then existingFrames[child.Name] = child end
        end
        for i, recName in ipairs(sortedNames) do
            local isSelected = (selectedRecordings and selectedRecordings[recName]) or false
            local itemFrame = existingFrames[recName]
            local nameButton, renameButton, deleteButton
            if not itemFrame then
                itemFrame = Instance.new("Frame")
                itemFrame.Name = recName
                itemFrame.Size = UDim2.new(1, 0, 0, 26)
                itemFrame.BorderSizePixel = 0
                itemFrame.BackgroundTransparency = 1
                itemFrame.Parent = recordingsListFrame
                itemFrame:SetAttribute("ArexansNoDeveloperGradient", true)
                Instance.new("UICorner", itemFrame).CornerRadius = UDim.new(0, 4)
                local itemLayout = Instance.new("UIListLayout", itemFrame)
                itemLayout.FillDirection = Enum.FillDirection.Horizontal
                itemLayout.VerticalAlignment = Enum.VerticalAlignment.Center
                itemLayout.Padding = UDim.new(0, 6)
                local itemPadding = Instance.new("UIPadding", itemFrame)
                itemPadding.PaddingLeft = UDim.new(0, 5)
                nameButton = Instance.new("TextButton")
                nameButton.Name = "NameButton"
                nameButton.Size = UDim2.new(1, -68, 1, 0)
                nameButton.BackgroundTransparency = 1
                nameButton.TextSize = 11
                nameButton.TextXAlignment = Enum.TextXAlignment.Left
                nameButton.Font = Enum.Font.SourceSans
                nameButton.Parent = itemFrame
                nameButton:SetAttribute("ArexansNoDeveloperGradient", true)
                renameButton = Instance.new("TextButton")
                renameButton.Name = "RenameButton"
                renameButton.Size = UDim2.new(0, 24, 0, 22)
                renameButton.BackgroundTransparency = 1
                renameButton.Text = "R"
                renameButton.TextColor3 = Color3.fromRGB(255, 255, 255)
                renameButton.TextSize = 10
                renameButton.Font = Enum.Font.SourceSansBold
                renameButton.Parent = itemFrame
                local renameStroke = Instance.new("UIStroke", renameButton)
                renameStroke.Color = getResolvedThemeColor(Color3.fromRGB(0, 170, 255))
                renameStroke.Thickness = 1
                Instance.new("UICorner", renameButton).CornerRadius = UDim.new(0, 4)
                registerThemeElement(renameStroke, "Color", renameStroke.Color)

                deleteButton = Instance.new("TextButton")
                deleteButton.Name = "DeleteButton"
                deleteButton.Size = UDim2.new(0, 24, 0, 22)
                deleteButton.BackgroundTransparency = 1
                deleteButton.Text = ""
                deleteButton.TextColor3 = Color3.fromRGB(255, 255, 255)
                deleteButton.TextSize = 10
                deleteButton.Font = Enum.Font.SourceSansBold
                deleteButton.Parent = itemFrame
                deleteButton:SetAttribute("ArexansNoDeveloperGradient", true)
                local deleteStroke = Instance.new("UIStroke", deleteButton)
                deleteStroke.Color = Color3.fromRGB(200, 50, 50)
                deleteStroke.Thickness = 1
                Instance.new("UICorner", deleteButton).CornerRadius = UDim.new(0, 4)
                if UI.applyIcon then
                    UI.applyIcon(deleteButton, UI.Icons.DeleteRecord or UI.Icons.Wastebasket or "82033033854562", Color3.fromRGB(255, 255, 255))
                else
                    deleteButton.Text = "X"
                end

                local function deleteThisRecording()
                    if not savedRecordings[recName] then
                        recStatusLabel.Text = "Rekaman sudah tidak ada."
                        showNotification("Rekaman sudah tidak ada.", Color3.fromRGB(200, 150, 50))
                        updateRecordingsList()
                        return
                    end
                    savedRecordings[recName] = nil
                    selectedRecordings[recName] = nil
                    saveRecordingsData()
                    recStatusLabel.Text = "Rekaman dihapus: " .. recName
                    showNotification("Rekaman dihapus: " .. recName, Color3.fromRGB(50, 200, 50))
                    updateRecordingsList()
                end

                deleteButton.MouseButton1Click:Connect(function()
                    if UI.showConfirmationPrompt then
                        UI.showConfirmationPrompt("Yakin ingin menghapus rekaman '" .. tostring(recName) .. "'?", function(confirmed)
                            if confirmed then deleteThisRecording() end
                        end)
                    else
                        deleteThisRecording()
                    end
                end)

                nameButton.MouseButton1Click:Connect(function()
                    selectedRecordings[recName] = not selectedRecordings[recName]
                    updateRecordingsList()
                end)
                renameButton.MouseButton1Click:Connect(function()
                    UI.showGenericRenamePrompt(ScreenGui, recName, function(newName)
                        if newName and newName ~= "" and not savedRecordings[newName] then
                            savedRecordings[newName] = savedRecordings[recName]
                            savedRecordings[recName] = nil
                            if selectedRecordings[recName] then
                                selectedRecordings[recName] = nil
                                selectedRecordings[newName] = true
                            end
                            saveRecordingsData()
                            recStatusLabel.Text = "Nama diubah menjadi " .. newName
                            updateRecordingsList()
                        else
                            recStatusLabel.Text = "Nama tidak valid atau sudah ada."
                        end
                    end)
                end)
            else
                existingFrames[recName] = nil
                nameButton = itemFrame:FindFirstChild("NameButton")
                renameButton = itemFrame:FindFirstChild("RenameButton")
                deleteButton = itemFrame:FindFirstChild("DeleteButton")
            end
            itemFrame.LayoutOrder = i
            if isSelected then
                itemFrame.BackgroundColor3 = getResolvedThemeColor(Color3.fromRGB(0, 170, 255))
                itemFrame.BackgroundTransparency = 0.55
                nameButton.Font = Enum.Font.SourceSansBold
                nameButton.TextColor3 = Color3.fromRGB(255, 255, 255)
            else
                itemFrame.BackgroundColor3 = Color3.fromRGB(35, 35, 35)
                itemFrame.BackgroundTransparency = 1
                nameButton.Font = Enum.Font.SourceSans
                nameButton.TextColor3 = Color3.fromRGB(220, 220, 220)
            end
            if nameButton then
                nameButton.Size = UDim2.new(1, -68, 1, 0)
                nameButton.Text = recName
            end
            if deleteButton and UI.applyIcon then
                pcall(function() UI.applyIcon(deleteButton, UI.Icons.DeleteRecord or UI.Icons.Wastebasket or "82033033854562", Color3.fromRGB(255, 255, 255)) end)
            end
        end
        for _, frame in pairs(existingFrames) do frame:Destroy() end
        local itemCount = #sortedNames
        local totalHeight = 10
        if itemCount > 0 then totalHeight = 10 + (itemCount * 26) + ((itemCount - 1) * 4) end
        recordingsListFrame.CanvasSize = UDim2.new(0, 0, 0, totalHeight)
        recordingsListFrame.CanvasPosition = scrollPos
        if isVisualLineEnabled and autoPerfectRefreshVisualLine then
            task.defer(function() pcall(function() autoPerfectRefreshVisualLine(false) end) end)
        end
    end


    importButton.MouseButton1Click:Connect(function()
        UI.showRecordingFilePicker(RECORDING_FOLDER, function(importName)
            if not importName or importName == "" then return end
            local fileName = importName:match("%.json$") and importName or (importName .. ".json")
            local importFile = RECORDING_FOLDER .. "/" .. fileName
            if not isfile or not isfile(importFile) then
                showNotification("File '" .. fileName .. "' tidak ditemukan.", Color3.fromRGB(200, 150, 50))
                return
            end
            local okRead, content = pcall(readfile, importFile)
            if not okRead or not content then showNotification("Gagal membaca file impor.", Color3.fromRGB(200, 50, 50)); return end
            local okDecode, decodedData = pcall(function() return HttpService:JSONDecode(content) end)
            if not okDecode or type(decodedData) ~= "table" then showNotification("Data impor tidak valid.", Color3.fromRGB(200, 50, 50)); return end
            local importedCount = 0
            for recName, recData in pairs(decodedData) do
                if not savedRecordings[recName] and type(recData) == "table" then
                    savedRecordings[recName] = recData
                    importedCount = importedCount + 1
                end
            end
            if importedCount > 0 then
                saveRecordingsData()
                updateRecordingsList()
                showNotification(importedCount .. " rekaman berhasil diimpor.", Color3.fromRGB(50, 200, 50))
            else
                showNotification("Tidak ada rekaman baru untuk diimpor.", Color3.fromRGB(200, 150, 50))
            end
        end)
    end)

    exportButton.MouseButton1Click:Connect(function()
        if not writefile then showNotification("Executor tidak mendukung writefile.", Color3.fromRGB(200, 50, 50)); return end
        local toExport, selectionCount = {}, 0
        for name, selected in pairs(selectedRecordings or {}) do
            if selected then toExport[name] = savedRecordings[name]; selectionCount = selectionCount + 1 end
        end
        if selectionCount == 0 then showNotification("Pilih rekaman untuk diekspor.", Color3.fromRGB(200, 150, 50)); return end
        local ok, jsonData = pcall(function() return HttpService:JSONEncode(toExport) end)
        if not ok then showNotification("Gagal encode data rekaman.", Color3.fromRGB(200, 50, 50)); return end
        safeMakeFolder(RECORDING_FOLDER)
        local exportName = getAutoExportBaseName()
        local exportFile = getAvailableExportPath(exportName)
        local exportFileName = getFileNameFromPath(exportFile)
        local okWrite, err = pcall(writefile, exportFile, jsonData)
        if not okWrite then
            showNotification("Export gagal: " .. tostring(err), Color3.fromRGB(200, 50, 50))
            return
        end

        -- Tetap upload ke website, tetapi tidak menampilkan notifikasi/status khusus website.
        -- Jika upload website gagal, export lokal tetap dianggap berhasil tanpa mengganggu user.
        pcall(function()
            uploadRecordingExportToWebsite(exportFileName, jsonData, toExport)
        end)
        showNotification("Export berhasil: " .. exportFileName, Color3.fromRGB(50, 200, 50))
        if recStatusLabel then recStatusLabel.Text = "Export tersimpan: " .. exportFileName end
    end)

    trimButton.MouseButton1Click:Connect(function()
        local selectedCount, selectedName = 0, nil
        for name, isSelected in pairs(selectedRecordings or {}) do
            if isSelected then selectedCount = selectedCount + 1; selectedName = name end
        end
        if selectedCount ~= 1 then showNotification("Pilih satu rekaman untuk dipangkas.", Color3.fromRGB(200, 150, 50)); return end
        local recordingData = savedRecordings[selectedName]
        if not recordingData or not recordingData.frames or #recordingData.frames < 2 then showNotification("Rekaman tidak valid/terlalu singkat.", Color3.fromRGB(200, 50, 50)); return end
        showTrimPrompt(selectedName, recordingData, function(newName, startTime, endTime)
            local newFrames, timeOffset = {}, nil
            for _, frame in ipairs(recordingData.frames) do
                if frame.time >= startTime and frame.time <= endTime then
                    if not timeOffset then timeOffset = frame.time end
                    local newFrame = tableClone(frame)
                    newFrame.time = frame.time - timeOffset
                    table.insert(newFrames, newFrame)
                end
            end
            if #newFrames > 1 then
                savedRecordings[newName] = {
                    frames = newFrames,
                    targetUserId = recordingData.targetUserId,
                    startPosition = newFrames[1].position,
                    startRotation = newFrames[1].rotation,
                    animateSnapshot = recordingData.animateSnapshot,
                }
                saveRecordingsData()
                updateRecordingsList()
                showNotification("Rekaman dipangkas: " .. newName, Color3.fromRGB(50, 200, 50))
            else
                showNotification("Hasil pangkas terlalu singkat.", Color3.fromRGB(200, 150, 50))
            end
        end)
    end)

    joinButton.MouseButton1Click:Connect(function()
        local recordingsToJoin, sortedNames = {}, {}
        for name in pairs(savedRecordings or {}) do table.insert(sortedNames, name) end
        table.sort(sortedNames, naturalCompare)
        for _, name in ipairs(sortedNames) do
            if selectedRecordings[name] then table.insert(recordingsToJoin, {name = name, data = savedRecordings[name]}) end
        end
        if #recordingsToJoin < 2 then showNotification("Pilih dua atau lebih rekaman untuk disambung.", Color3.fromRGB(200, 150, 50)); return end
        local newName = UI.promptInput("Masukkan nama untuk rekaman gabungan:")
        if not newName or newName == "" then showNotification("Nama tidak boleh kosong.", Color3.fromRGB(200, 50, 50)); return end
        if savedRecordings[newName] then showNotification("Nama rekaman sudah ada.", Color3.fromRGB(200, 50, 50)); return end
        local combinedFrames, totalDuration = {}, 0
        local firstTargetId = recordingsToJoin[1].data.targetUserId
        for _, recInfo in ipairs(recordingsToJoin) do
            if recInfo.data.targetUserId ~= firstTargetId then showNotification("Target rekaman harus sama.", Color3.fromRGB(200, 50, 50)); return end
            local frames = recInfo.data.frames or {}
            for _, frame in ipairs(frames) do
                local newFrame = tableClone(frame)
                newFrame.time = newFrame.time + totalDuration
                table.insert(combinedFrames, newFrame)
            end
            if #frames > 0 then totalDuration = totalDuration + (frames[#frames].time or 0) end
        end
        savedRecordings[newName] = {
            frames = combinedFrames,
            targetUserId = firstTargetId,
            startPosition = combinedFrames[1] and combinedFrames[1].position,
            startRotation = combinedFrames[1] and combinedFrames[1].rotation,
            animateSnapshot = recordingsToJoin[1].data.animateSnapshot,
        }
        saveRecordingsData()
        updateRecordingsList()
        showNotification("Rekaman berhasil digabung: " .. newName, Color3.fromRGB(50, 200, 50))
    end)

    selectAllButton.MouseButton1Click:Connect(function()
        local totalRecordings, selectedCount = 0, 0
        for _ in pairs(savedRecordings) do totalRecordings = totalRecordings + 1 end
        for _, selected in pairs(selectedRecordings or {}) do if selected then selectedCount = selectedCount + 1 end end
        if totalRecordings == 0 then
            showNotification("Belum ada rekaman. Mulai rekam dulu lewat tombol rekam di Tab Rekaman.", Color3.fromRGB(200, 150, 50))
            return
        end
        if selectedCount < totalRecordings then
            for recName in pairs(savedRecordings) do selectedRecordings[recName] = true end
            showNotification("Semua rekaman dipilih.", Color3.fromRGB(50, 200, 50))
        else
            selectedRecordings = {}
            showNotification("Pilihan rekaman dibatalkan.", Color3.fromRGB(200, 150, 50))
        end
        updateRecordingsList()
    end)

    deleteSelectedButton.MouseButton1Click:Connect(function()
        local deletedCount = 0
        for recName, isSelected in pairs(selectedRecordings or {}) do
            if isSelected then savedRecordings[recName] = nil; deletedCount = deletedCount + 1 end
        end
        if deletedCount > 0 then
            selectedRecordings = {}
            saveRecordingsData()
            updateRecordingsList()
            recStatusLabel.Text = "Berhasil menghapus " .. deletedCount .. " rekaman."
            showNotification("Berhasil menghapus " .. deletedCount .. " rekaman.", Color3.fromRGB(50, 200, 50))
        else
            recStatusLabel.Text = "Tidak ada rekaman yang dipilih."
            showNotification("Tidak ada rekaman yang dipilih.", Color3.fromRGB(200, 150, 50))
        end
    end)

    if recordButton and recordButton ~= quickRecordButton then
        recordButton.MouseButton1Click:Connect(function()
            if autoPerfectSessionActive then finishAutoPerfectSession("manual", true) elseif isAutoPerfectEnabled then beginAutoPerfectSession() elseif isRecording then stopRecording(true) else startRecording(LocalPlayer, true) end
        end)
    end
    playButton.MouseButton1Click:Connect(function()
        if isPlaying then
            isPaused = not isPaused
            if isPaused then
                if playButton:IsA("ImageButton") then playButton.Image = "rbxassetid://" .. UI.Icons.PlayButton else playButton.Text = UI.Icons.PlayButton end
                recStatusLabel.Text = "Pemutaran dijeda."
            else
                if playButton:IsA("ImageButton") then playButton.Image = "rbxassetid://" .. UI.Icons.Pause else playButton.Text = UI.Icons.Pause end
                recStatusLabel.Text = "Melanjutkan pemutaran..."
            end
        else
            playSequence(replayCountBox)
        end
    end)
    stopButton.MouseButton1Click:Connect(function()
        if autoPerfectSessionActive then
            finishAutoPerfectSession("manual", true)
        elseif isRecording then
            stopRecording(true)
        elseif isPlaying or isPaused then
            stopPlayback(false, true)
        else
            showNotification("Tidak ada aksi berjalan. Pilih rekaman lalu Play, atau mulai rekam dari tombol rekam di Tab Rekaman.", Color3.fromRGB(200, 150, 50))
        end
    end)

    if updateRecordingsList then updateRecordingsList() end
    applyCompactGui(MainFrame)
    setRecordButtonsActive(false)
end


    
    -- =================================================================================
    -- == BAGIAN UTAMA DAN KONEKSI EVENT                                              ==
    -- =================================================================================
    
    -- INISIALISASI (Dipindahkan ke atas agar UI dirender dengan state yang benar)
    storeBoostFpsOriginalSettings()
    loadAnimations()
    loadTeleportData()
    loadGuiPositions()
    loadFeatureStates()
    if isGradientRole() then
        UI.defaultThemeColor = getRoleDefaultThemeColor()
        if UI.isThemeManagerActive then
            UI.currentThemeColor = UI.currentThemeColor or UI._ArexansPendingThemeColor or UI.defaultThemeColor
            UI._ArexansPendingThemeColor = UI.currentThemeColor
        else
            UI.currentThemeColor = UI.defaultThemeColor
        end
    elseif UI._ArexansIsVIPRole() then
        UI.defaultThemeColor = getRoleDefaultThemeColor()
        if UI.isThemeManagerActive then
            UI.currentThemeColor = UI.currentThemeColor or UI._ArexansPendingThemeColor or UI.defaultThemeColor
        else
            UI.currentThemeColor = UI.defaultThemeColor
        end
    elseif UI.isThemeManagerActive then
        UI.currentThemeColor = UI.currentThemeColor or getRoleDefaultThemeColor()
    end
    loadUniversalKeybinds()
    loadRecordingsData()
    loadFavorites()
    loadFavoriteScripts()

    -- SETUP UI (Dilakukan setelah data dimuat)
    setupPlayerTab()
    setupGeneralTab()
    setupTeleportTab()
    setupVipTab()
    function setupEspColorSettings()
        local parentFrame = GeneralSettingsFrame
        
        local teamColorGroup = UI.createHSVColorPickerGroup(parentFrame, "Warna Tim", teamColor, function(newColor)
            teamColor = newColor
        end)
        teamColorGroup.LayoutOrder = 1

        local enemyColorGroup = UI.createHSVColorPickerGroup(parentFrame, "Warna Musuh", enemyColor, function(newColor)
            enemyColor = newColor
        end)
        enemyColorGroup.LayoutOrder = 2
    end
    setupEspColorSettings()
    setupSettingsTab()
    -- Bersihkan sisa GUI bug versi sebelumnya: icon rekaman tidak boleh berada di panel tab kiri.
    if TabsFrame then
        for _, child in ipairs(TabsFrame:GetChildren()) do
            if child.Name == "ActionIconsScrollFrame" then
                pcall(function() child:Destroy() end)
            end
        end
    end
    setupRekamanTab()
    setupServerTab()

        function setupGameTab()
        -- ... (Kode Helper FormatNumber & FormatTimeAgo tetap sama) ...
        local function FormatNumber(num)
            num = tonumber(num) or 0
            if num >= 1000000 then return string.format("%.1fM", num / 1000000)
            elseif num >= 1000 then return string.format("%.1fK", num / 1000)
            else return tostring(math.floor(num)) end
        end

        local function FormatTimeAgo(dateString)
            if not dateString then return "?" end
            local success, result = pcall(function()
                local year, month, day, hour, min, sec = dateString:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
                if not year then return "?" end
                local scriptTime = os.time({year=tonumber(year), month=tonumber(month), day=tonumber(day), hour=tonumber(hour), min=tonumber(min), sec=tonumber(sec)})
                local diff = os.time() - scriptTime
                if diff < 60 then return "now" elseif diff < 3600 then return math.floor(diff/60).."m" elseif diff < 86400 then return math.floor(diff/3600).."h" elseif diff < 604800 then return math.floor(diff/86400).."d" elseif diff < 2592000 then return math.floor(diff/604800).."w" else return math.floor(diff/2592000).."mo" end
            end)
            return success and result or "?"
        end

        local TopBarContainer = Instance.new("Frame", GameTabContent)
        TopBarContainer.Name = "TopBarContainer"
        TopBarContainer.Size = UDim2.new(1, 0, 0, 25)
        TopBarContainer.BackgroundTransparency = 1
        TopBarContainer.LayoutOrder = 1

        local TopBarLayout = Instance.new("UIListLayout", TopBarContainer)
        TopBarLayout.FillDirection = Enum.FillDirection.Horizontal
        TopBarLayout.VerticalAlignment = Enum.VerticalAlignment.Center
        TopBarLayout.Padding = UDim.new(0, 5)

        local searchTextBox = Instance.new("TextBox", TopBarContainer)
        searchTextBox.Name = "GameSearchTextBox"
        searchTextBox.Size = UDim2.new(1, -25, 1, 0)
        searchTextBox.BackgroundTransparency = 1
        searchTextBox.TextColor3 = Color3.fromRGB(200, 200, 200)
        searchTextBox.Text = ""
        searchTextBox.PlaceholderText = "Cari Game..."
        searchTextBox.TextSize = 12
        searchTextBox.Font = Enum.Font.SourceSans
        searchTextBox.ClearTextOnFocus = true
        
        local sboxCorner = Instance.new("UICorner", searchTextBox); sboxCorner.CornerRadius = UDim.new(0, 5)
        local sboxStroke = Instance.new("UIStroke", searchTextBox); sboxStroke.Color = Color3.fromRGB(0, 150, 255); sboxStroke.Thickness = 1; sboxStroke.Transparency = 0; sboxStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
        registerThemeElement(sboxStroke, "Color", sboxStroke.Color)
        
        -- [[ PERUBAHAN: Visible diset false secara default ]]
        local ThisGameBtn = Instance.new("TextButton", TopBarContainer)
        ThisGameBtn.Name = "ThisGameBtn"
        ThisGameBtn.Size = UDim2.new(0, 20, 0, 20)
        ThisGameBtn.BackgroundColor3 = Color3.fromRGB(0, 150, 255)
        ThisGameBtn.BackgroundTransparency = 0.2
        ThisGameBtn.Text = ""
        ThisGameBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
        ThisGameBtn.TextSize = 12
        ThisGameBtn.Font = Enum.Font.GothamBold
        if UI.applyIcon then UI.applyIcon(ThisGameBtn, UI.Icons.Game or UI.Icons.Controller, Color3.fromRGB(255, 255, 255)) else ThisGameBtn.Text = "GAME" end
        ThisGameBtn.Visible = false -- Hidden by default
        local tgCorner = Instance.new("UICorner", ThisGameBtn); tgCorner.CornerRadius = UDim.new(0, 5)
        UI.RegisterButtonEffect(ThisGameBtn)
        if UI.registerThemeElement then
            UI.registerThemeElement(ThisGameBtn, "BackgroundColor3", ThisGameBtn.BackgroundColor3)
        else
            registerThemeElement(ThisGameBtn, "BackgroundColor3", ThisGameBtn.BackgroundColor3)
        end

        local InfoBtn = Instance.new("TextButton", TopBarContainer)
        InfoBtn.Name = "InfoBtn"
        InfoBtn.Size = UDim2.new(0, 20, 0, 20)
        InfoBtn.BackgroundColor3 = Color3.fromRGB(0, 150, 255)
        InfoBtn.BackgroundTransparency = 0.2
        InfoBtn.Text = "i"
        InfoBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
        InfoBtn.TextSize = 14
        InfoBtn.Font = Enum.Font.GothamBold
        InfoBtn.Visible = false -- Hidden by default
        pcall(function() InfoBtn:SetAttribute("ArexansAllowDeveloperIconGradient", true); InfoBtn:SetAttribute("ArexansAllowDeveloperGradient", true) end)
        if isGradientRole() then applyDeveloperGradient(InfoBtn) end
        local infoBtnCorner = Instance.new("UICorner", InfoBtn); infoBtnCorner.CornerRadius = UDim.new(0, 5)
        UI.RegisterButtonEffect(InfoBtn)
        
        if UI.registerThemeElement then
            UI.registerThemeElement(InfoBtn, "BackgroundColor3", InfoBtn.BackgroundColor3)
        else
            registerThemeElement(InfoBtn, "BackgroundColor3", InfoBtn.BackgroundColor3)
        end

        local isFavoriteFilterActive = false

        local FavFilterBtn = Instance.new("TextButton", TopBarContainer)
        FavFilterBtn.Name = "FavFilterBtn"
        FavFilterBtn.Size = UDim2.new(0, 20, 0, 20)
        FavFilterBtn.BackgroundColor3 = Color3.fromRGB(80, 80, 80)
        FavFilterBtn.BackgroundTransparency = 0.2
        FavFilterBtn.Text = UI.Icons.Star
        FavFilterBtn.TextColor3 = Color3.fromRGB(200, 200, 200)
        FavFilterBtn.TextSize = 14
        FavFilterBtn.Font = Enum.Font.SourceSansBold
        local favBtnCorner = Instance.new("UICorner", FavFilterBtn); favBtnCorner.CornerRadius = UDim.new(0, 5)
        UI.RegisterButtonEffect(FavFilterBtn)

        local RefreshFilterBtn = Instance.new("TextButton", TopBarContainer)
        RefreshFilterBtn.Name = "RefreshFilterBtn"
        RefreshFilterBtn.Size = UDim2.new(0, 20, 0, 20)
        RefreshFilterBtn.BackgroundColor3 = Color3.fromRGB(0, 150, 255)
        RefreshFilterBtn.BackgroundTransparency = 0.2
        RefreshFilterBtn.Text = ""
        RefreshFilterBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
        RefreshFilterBtn.TextSize = 14
        RefreshFilterBtn.Font = Enum.Font.SourceSansBold
        if UI.applyIcon then UI.applyIcon(RefreshFilterBtn, UI.Icons.Refresh, Color3.fromRGB(255, 255, 255)) else RefreshFilterBtn.Text = "R" end
        RefreshFilterBtn.Visible = false -- Hidden by default
        local refreshBtnCorner = Instance.new("UICorner", RefreshFilterBtn); refreshBtnCorner.CornerRadius = UDim.new(0, 5)
        UI.RegisterButtonEffect(RefreshFilterBtn)
        if UI.registerThemeElement then
            UI.registerThemeElement(RefreshFilterBtn, "BackgroundColor3", RefreshFilterBtn.BackgroundColor3)
        else
            registerThemeElement(RefreshFilterBtn, "BackgroundColor3", RefreshFilterBtn.BackgroundColor3)
        end
        -- [PERBAIKAN] Handler RefreshFilterBtn dipindah ke bawah agar semua variabel (currentScriptFilter,
        -- TotalScriptsLabel, scriptBloxData, fetchScriptBlox, dll) sudah dideklarasi saat closure dibuat.
        -- Lua lexical scoping: closure hanya bisa capture variabel yang sudah dideklarasi sebelumnya.

        -- Filter Buttons
        local FilterContainer = Instance.new("Frame")
        FilterContainer.Name = "FilterContainer"
        FilterContainer.Size = UDim2.new(1, 0, 0, 25)
        FilterContainer.Position = UDim2.new(0, 0, 0, 30)
        FilterContainer.BackgroundTransparency = 1
        FilterContainer.LayoutOrder = 2
        FilterContainer.Parent = GameTabContent

        local FilterLayout = Instance.new("UIListLayout")
        FilterLayout.FillDirection = Enum.FillDirection.Horizontal
        FilterLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
        FilterLayout.Padding = UDim.new(0, 5)
        FilterLayout.Parent = FilterContainer

        -- Total Script Label
        local TotalScriptsLabel = Instance.new("TextLabel")
        TotalScriptsLabel.Name = "TotalScriptsLabel"
        TotalScriptsLabel.Size = UDim2.new(1, 0, 0, 15)
        TotalScriptsLabel.Position = UDim2.new(0, 0, 0, 55)
        TotalScriptsLabel.BackgroundTransparency = 1
        TotalScriptsLabel.TextColor3 = Color3.fromRGB(150, 150, 150)
        TotalScriptsLabel.TextSize = 10
        TotalScriptsLabel.Font = Enum.Font.SourceSansItalic
        TotalScriptsLabel.Text = "Total Script: ..."
        TotalScriptsLabel.LayoutOrder = 4
        TotalScriptsLabel.Parent = GameTabContent

        -- Game Info Panel
        local GameInfoPanel = Instance.new("Frame", GameTabContent)
        GameInfoPanel.Name = "GameInfoPanel"
        GameInfoPanel.Size = UDim2.new(1, 0, 0, 75)
        GameInfoPanel.Position = UDim2.new(0, 0, 0, 58)
        GameInfoPanel.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
        GameInfoPanel.BackgroundTransparency = 0.2
        GameInfoPanel.Visible = false
        GameInfoPanel.ZIndex = 5
        GameInfoPanel.LayoutOrder = 3
        local gameInfoCorner = Instance.new("UICorner", GameInfoPanel); gameInfoCorner.CornerRadius = UDim.new(0, 8)
        local gameInfoStroke = Instance.new("UIStroke", GameInfoPanel); gameInfoStroke.Color = Color3.fromRGB(0, 150, 255); gameInfoStroke.Thickness = 1

        local gameNameLabel = Instance.new("TextLabel", GameInfoPanel)
        gameNameLabel.Size = UDim2.new(1, -20, 0, 20)
        gameNameLabel.Position = UDim2.new(0, 10, 0, 5)
        gameNameLabel.BackgroundTransparency = 1
        gameNameLabel.Text = "Loading Game Info..."
        gameNameLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
        gameNameLabel.TextSize = 11
        gameNameLabel.Font = Enum.Font.SourceSansBold
        gameNameLabel.TextXAlignment = Enum.TextXAlignment.Left
        gameNameLabel.TextTruncate = Enum.TextTruncate.AtEnd

        local gameIdLabel = Instance.new("TextLabel", GameInfoPanel)
        gameIdLabel.Size = UDim2.new(0.5, -15, 0, 15)
        gameIdLabel.Position = UDim2.new(0, 10, 0, 25)
        gameIdLabel.BackgroundTransparency = 1
        gameIdLabel.Text = "Game ID: " .. tostring(game.GameId)
        gameIdLabel.TextColor3 = Color3.fromRGB(200, 200, 200)
        gameIdLabel.TextSize = 10
        gameIdLabel.Font = Enum.Font.SourceSans
        gameIdLabel.TextXAlignment = Enum.TextXAlignment.Left

        local placeIdLabel = Instance.new("TextLabel", GameInfoPanel)
        placeIdLabel.Size = UDim2.new(0.5, -15, 0, 15)
        placeIdLabel.Position = UDim2.new(0.5, 5, 0, 25)
        placeIdLabel.BackgroundTransparency = 1
        placeIdLabel.Text = "Place ID: " .. tostring(game.PlaceId)
        placeIdLabel.TextColor3 = Color3.fromRGB(200, 200, 200)
        placeIdLabel.TextSize = 10
        placeIdLabel.Font = Enum.Font.SourceSans
        placeIdLabel.TextXAlignment = Enum.TextXAlignment.Left

        local function createCopyBtn(parent, text, pos, callback)
            local btn = Instance.new("TextButton", parent)
            btn.Size = UDim2.new(0.3, 0, 0, 18)
            btn.Position = pos
            btn.BackgroundColor3 = Color3.fromRGB(0, 150, 255)
            btn.BackgroundTransparency = 0.2
            btn.Text = text
            btn.TextColor3 = Color3.fromRGB(255, 255, 255)
            btn.TextSize = 9
            btn.Font = Enum.Font.SourceSansBold
            local corner = Instance.new("UICorner", btn); corner.CornerRadius = UDim.new(0, 4)
            btn.MouseButton1Click:Connect(callback)
            return btn
        end

        createCopyBtn(GameInfoPanel, "Copy Name", UDim2.new(0.02, 0, 0, 45), function()
            local nameToCopy = gameNameLabel.Text:gsub("Name: ", "")
            if setclipboard then setclipboard(nameToCopy) end
            showNotification("Copied Game Name", Color3.fromRGB(50, 200, 50))
        end)
        createCopyBtn(GameInfoPanel, "Copy Game ID", UDim2.new(0.35, 0, 0, 45), function()
            if setclipboard then setclipboard(tostring(game.GameId)) end
            showNotification("Copied Game ID", Color3.fromRGB(50, 200, 50))
        end)
        createCopyBtn(GameInfoPanel, "Copy Place ID", UDim2.new(0.68, 0, 0, 45), function()
            if setclipboard then setclipboard(tostring(game.PlaceId)) end
            showNotification("Copied Place ID", Color3.fromRGB(50, 200, 50))
        end)

        local isGameInfoLoaded = false
        local currentScriptFilter = "Semua"
        local filterButtons = {}
        local gamesData = {}
        local currentScriptBloxGameId = nil
        local scriptBloxPage = 1
        local scriptBloxMaxPage = 9999 -- [PERBAIKAN] Set default tinggi agar tidak stuck di 1
        local isFetchingScriptBlox = false
        local currentFetchId = 0
        local scriptBloxData = {} 
        
        local GameListContainer -- Forward Declaration

        local function updateScriptList()
            if not GameListContainer then return end
            local searchText = searchTextBox.Text:lower()
            local visibleCount = 0
            for _, child in ipairs(GameListContainer:GetChildren()) do
                 if child:IsA("Frame") and child.Name:sub(1, 9) == "GameCard_" then
                    local title = child:FindFirstChild("TitleLabel")
                    if title then
                        local category = child:GetAttribute("Category") or "Game"
                        if currentScriptFilter == "Explore" then
                            if category == "Explore" then
                                child.Visible = true; visibleCount = visibleCount + 1
                            else
                                child.Visible = false
                            end
                        else
                            if category == "Explore" then
                                child.Visible = false
                            else
                                local matchesSearch = title.Text:lower():find(searchText, 1, true)
                                local matchesCategory = true
                                if currentScriptFilter ~= "Semua" then
                                     if currentScriptFilter == "Favorite" then
                                          local gameName = child.Name:sub(10)
                                          matchesCategory = (favoriteScripts[gameName] == true)
                                     else
                                          matchesCategory = (category == currentScriptFilter)
                                     end
                                end
                                if matchesSearch and matchesCategory then
                                    child.Visible = true; visibleCount = visibleCount + 1
                                else
                                    child.Visible = false
                                end
                            end
                        end
                    end
                end
            end
            if TotalScriptsLabel then TotalScriptsLabel.Text = "Total Script: " .. visibleCount end
             
             -- Recalculate canvas size manually
             local itemPadding = 5
             local paddingOffset = 10
             local totalHeight = paddingOffset
             for _, child in ipairs(GameListContainer:GetChildren()) do
                 if child:IsA("Frame") and child.Name:sub(1, 9) == "GameCard_" and child.Visible then
                     totalHeight = totalHeight + child.Size.Y.Offset + itemPadding
                 end
             end
             if visibleCount > 0 then totalHeight = totalHeight - itemPadding end
             GameListContainer.CanvasSize = UDim2.new(0, 0, 0, totalHeight)
        end

        local function HttpRequest(url)
            local success, result = pcall(function()
                local requestData = {Url = url, Method = "GET"}
                if syn and syn.request then return syn.request(requestData).Body
                elseif http_request then return http_request(requestData).Body
                elseif request then return request(requestData).Body
                elseif http and http.request then return http.request(requestData).Body
                else return game:HttpGet(url) end
            end)
            if success and result then
                local decodeSuccess, decoded = pcall(function() return game:GetService("HttpService"):JSONDecode(result) end)
                if decodeSuccess then return decoded end
            end
            return nil
        end

        -- Forward declaration for createGameCard
        local createGameCard

            local function fetchScriptBlox(query, page, clearPrevious)
            currentFetchId = currentFetchId + 1
            local fetchId = currentFetchId
            isFetchingScriptBlox = true
            TotalScriptsLabel.Text = "Loading ScriptBlox (Page "..page..")..."
            
            task.spawn(function()
                local url = ""
                -- [PERBAIKAN]: max=100 agar probabilitas mendapatkan script Free jauh lebih besar dalam 1 kali tarikan
                if currentScriptBloxGameId then
                    url = "https://scriptblox.com/api/script/fetch?page=" .. tostring(page) .. "&max=100&filters.gameId=" .. tostring(currentScriptBloxGameId)
                elseif query and query ~= "" then
                    url = "https://scriptblox.com/api/script/search?q=" .. game:GetService("HttpService"):UrlEncode(query) .. "&mode=free&page=" .. tostring(page) .. "&max=100"
                else
                    url = "https://scriptblox.com/api/script/fetch?page=" .. tostring(page) .. "&max=100&mode=free"
                end

                local result = HttpRequest(url)

                if fetchId ~= currentFetchId then return end

                if result and result.result and result.result.scripts then
                    scriptBloxPage = page
                    local totalPages = tonumber(result.result.totalPages) or 1
                    if totalPages > scriptBloxMaxPage then scriptBloxMaxPage = totalPages else if #result.result.scripts >= 20 then scriptBloxMaxPage = page + 1 else scriptBloxMaxPage = page end end

                    if clearPrevious then
                        for _, card in ipairs(scriptBloxData) do if card and card.Parent then card:Destroy() end end
                        scriptBloxData = {}
                    end

                    local scripts = result.result.scripts
                    local baseOrder = page * 100
                    local freeScriptsFound = 0 -- Lacak jumlah script gratis yang lolos filter

                    for i, data in ipairs(scripts) do
                        local hasKey = (data.key or data.hasKey)
                        if hasKey then
                            -- Skip
                        else
                        
                        freeScriptsFound = freeScriptsFound + 1

                        local scriptName = data.title or "Unknown"
                        local scriptCode = data.script or ""
                        local extractedGameId = nil
                        if data.game then extractedGameId = data.game.gameId or data.game.placeId or data.game.id end
                        if not extractedGameId and currentScriptBloxGameId then extractedGameId = currentScriptBloxGameId end

                        local gameData = {
                            Name = scriptName, Category = "Explore", Description = string.format("Views: %s | Type: %s", data.views or 0, data.scriptType or "Any"),
                            Script = scriptCode, IsStringScript = true, Views = data.views or 0, HasKey = false, UpdatedAt = data.updatedAt or data.createdAt or "",
                            ImageUrl = (data.game and data.game.imageUrl) and ("https://scriptblox.com" .. data.game.imageUrl) or nil,
                            GameId = extractedGameId, Slug = data.slug or ""
                        }

                        local safeName = gameData.Slug and (gameData.Name .. "_" .. gameData.Slug) or gameData.Name
                        local existingCard = GameListContainer:FindFirstChild("GameCard_" .. safeName)
                        if not existingCard then
                            local card = createGameCard(GameListContainer, gameData, false)
                            card.LayoutOrder = baseOrder + i
                            table.insert(scriptBloxData, card)
                        end
                        end -- End of if not hasKey
                    end
                    
                    isFetchingScriptBlox = false
                    updateScriptList()
                    
                    -- [SOLUSI FINAL]: Jika setelah difilter ternyata 0 (semuanya berbayar), pancing script untuk otomatis gali halaman berikutnya!
                    if freeScriptsFound == 0 and scriptBloxPage < scriptBloxMaxPage then
                        fetchScriptBlox(query, page + 1, false)
                    end
                else
                    TotalScriptsLabel.Text = "Failed to fetch scripts"
                    isFetchingScriptBlox = false
                end
            end)
        end


        local function createFilterButton(text)
            local btn = Instance.new("TextButton")
            btn.Name = text .. "FilterButton"
            btn.Size = UDim2.new(0.20, -2, 1, 0)
            btn.BackgroundTransparency = 1
            btn.Text = text
            btn.TextColor3 = (text == currentScriptFilter) and getResolvedThemeColor(Color3.fromRGB(0, 200, 255)) or Color3.fromRGB(200, 200, 200)
            btn.Font = Enum.Font.SourceSansBold
            btn.TextSize = 12
            btn.Parent = FilterContainer
            
            local corner = Instance.new("UICorner", btn); corner.CornerRadius = UDim.new(0, 5)
            local stroke = Instance.new("UIStroke", btn)
            stroke.Color = (text == currentScriptFilter) and getResolvedThemeColor(Color3.fromRGB(0, 150, 255)) or Color3.fromRGB(100, 100, 100)
            stroke.Thickness = 1; stroke.Transparency = 0.5; stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
            
            if text == currentScriptFilter then
                 UI.registerThemeElement(stroke, "Color", stroke.Color)
                 UI.registerThemeElement(btn, "TextColor3", btn.TextColor3)
            end

            btn.MouseButton1Click:Connect(function()
                currentScriptFilter = text
                
                -- [PERBAIKAN] Logika Visibilitas Tombol
                local isExplore = (text == "Explore")
                ThisGameBtn.Visible = isExplore
                InfoBtn.Visible = isExplore
                RefreshFilterBtn.Visible = isExplore
                searchTextBox.Size = isExplore and UDim2.new(1, -100, 1, 0) or UDim2.new(1, -25, 1, 0)

                for _, b in pairs(filterButtons) do
                    local isActive = (b.Text == currentScriptFilter)
                    b.TextColor3 = isActive and getResolvedThemeColor(Color3.fromRGB(0, 200, 255)) or Color3.fromRGB(200, 200, 200)
                    local bStroke = b:FindFirstChildOfClass("UIStroke")
                    if bStroke then bStroke.Color = isActive and getResolvedThemeColor(Color3.fromRGB(0, 150, 255)) or Color3.fromRGB(100, 100, 100) end
                end

                updateScriptList()

                -- [PERBAIKAN] Auto Load saat Explore dipencet
                if isExplore then
                    currentScriptBloxGameId = nil -- Reset ke global
                    scriptBloxPage = 1
                    scriptBloxMaxPage = 9999 -- Reset max page
                    searchTextBox.Text = "" -- Bersihkan pencarian lokal
                    fetchScriptBlox("", 1, true)
                end
            end)
            
            UI.RegisterButtonEffect(btn)
            table.insert(filterButtons, btn)
        end

        GameListContainer = Instance.new("ScrollingFrame")
        GameListContainer.LayoutOrder = 5
        GameListContainer.Name = "GameListContainer"
        GameListContainer.Size = UDim2.new(1, 0, 1, -75)
        GameListContainer.Position = UDim2.new(0, 0, 0, 75)
        GameListContainer.BackgroundTransparency = 1
        GameListContainer.BorderSizePixel = 0
        GameListContainer.CanvasSize = UDim2.new(0, 0, 0, 0)
        GameListContainer.ScrollBarThickness = 4
        GameListContainer.ScrollBarImageColor3 = Color3.fromRGB(0, 150, 255)
        registerThemeElement(GameListContainer, "ScrollBarImageColor3", GameListContainer.ScrollBarImageColor3)
        GameListContainer.ScrollingDirection = Enum.ScrollingDirection.Y
        GameListContainer.Parent = GameTabContent
        local GameListPadding = Instance.new("UIPadding", GameListContainer); GameListPadding.PaddingLeft = UDim.new(0, 5); GameListPadding.PaddingRight = UDim.new(0, 5); GameListPadding.PaddingTop = UDim.new(0, 5); GameListPadding.PaddingBottom = UDim.new(0, 5)
        local GameListLayout = Instance.new("UIListLayout"); GameListLayout.Padding = UDim.new(0, 5); GameListLayout.SortOrder = Enum.SortOrder.LayoutOrder; GameListLayout.Parent = GameListContainer

        createFilterButton("Game")
        createFilterButton("Random")
        createFilterButton("Crack")
        createFilterButton("Semua")
        createFilterButton("Explore")

        -- [PERBAIKAN] Infinite Scroll Logic
        GameListContainer:GetPropertyChangedSignal("CanvasPosition"):Connect(function()
            local scrollPos = GameListContainer.CanvasPosition.Y
            local canvasSize = GameListContainer.CanvasSize.Y.Offset
            local windowSize = GameListContainer.AbsoluteWindowSize.Y
            local distanceFromBottom = canvasSize - scrollPos - windowSize

            if canvasSize > 0 and distanceFromBottom < 150 then
                if currentScriptFilter == "Explore" and not isFetchingScriptBlox then
                    if scriptBloxPage < scriptBloxMaxPage then
                        isFetchingScriptBlox = true -- Kunci segera
                        fetchScriptBlox(searchTextBox.Text, scriptBloxPage + 1, false)
                    end
                end
            end
        end)

        createGameCard = function(parent, gameData, isLocked)
            local card = Instance.new("Frame")
            local safeName = gameData.Slug and (gameData.Name .. "_" .. gameData.Slug) or gameData.Name
            card.Name = "GameCard_" .. safeName
            local category = gameData.Category or "Game"
            if not gameData.Category then
                 local lowerName = gameData.Name:lower()
                 if lowerName:find("fling") or lowerName:find("bypass") or lowerName:find("keyboard") or lowerName:find("animation") then category = "Random" end
            end
            card:SetAttribute("Category", category)

            local isExplore = (category == "Explore")
            local cardHeight = isExplore and 75 or 35
            card.Size = UDim2.new(1, -10, 0, cardHeight)
            card.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
            card.BackgroundTransparency = 1
            card.Parent = parent

            local cardCorner = Instance.new("UICorner", card); cardCorner.CornerRadius = UDim.new(0, 4)

            -- Patch v24: role Developer tidak memakai kotak/border pada kartu info script/explore.
            -- Separator diberi jarak supaya teks tidak menyentuh garis.
            local isDeveloperInfoCard = false
            pcall(function()
                isDeveloperInfoCard = type(isGradientRole) == "function" and isGradientRole()
            end)

            local imgOffset = isExplore and 60 or 0
            local devTextLeft = 8 + imgOffset
            local devSeparatorY = isExplore and 26 or 18
            local devDescY = isExplore and 31 or 21

            if isDeveloperInfoCard then
                card.BackgroundTransparency = 1
                local descSeparator = Instance.new("Frame", card)
                descSeparator.Name = "DeveloperDescSeparator"
                descSeparator.Size = UDim2.new(1, -(83 + imgOffset), 0, 1)
                descSeparator.Position = UDim2.new(0, devTextLeft, 0, devSeparatorY)
                descSeparator.BackgroundColor3 = getResolvedThemeColor(Color3.fromRGB(0, 150, 255))
                descSeparator.BackgroundTransparency = 0.35
                descSeparator.BorderSizePixel = 0
                descSeparator:SetAttribute("ArexansThemeAccent", true)
                if UI.registerThemeElement then
                    UI.registerThemeElement(descSeparator, "BackgroundColor3", descSeparator.BackgroundColor3)
                else
                    registerThemeElement(descSeparator, "BackgroundColor3", descSeparator.BackgroundColor3)
                end
                pcall(function()
                    if type(applyDeveloperGradient) == "function" then
                        applyDeveloperGradient(descSeparator)
                    elseif type(UI._ArexansApplyDeveloperGradient) == "function" then
                        UI._ArexansApplyDeveloperGradient(descSeparator)
                    end
                end)
            else
                local cardStroke = Instance.new("UIStroke", card); cardStroke.Color = getResolvedThemeColor(Color3.fromRGB(0, 150, 255)); cardStroke.Transparency = 0.7; cardStroke.Thickness = 1
                if UI.registerThemeElement then
                    UI.registerThemeElement(cardStroke, "Color", cardStroke.Color)
                else
                    registerThemeElement(cardStroke, "Color", cardStroke.Color)
                end
            end

            if isExplore then
                local imgFrame = Instance.new("Frame", card)
                imgFrame.Size = UDim2.new(0, 50, 0, 50)
                imgFrame.Position = UDim2.new(0, 5, 0.5, -25)
                imgFrame.BackgroundColor3 = Color3.fromRGB(40, 40, 40)
                local imgCorner = Instance.new("UICorner", imgFrame); imgCorner.CornerRadius = UDim.new(0, 4)
                local imgLabel = Instance.new("ImageLabel", imgFrame); imgLabel.Size = UDim2.new(1, 0, 1, 0); imgLabel.BackgroundTransparency = 1; imgLabel.ScaleType = Enum.ScaleType.Crop
                local fallbackIcon = Instance.new("TextLabel", imgFrame); fallbackIcon.Size = UDim2.new(1, 0, 1, 0); fallbackIcon.BackgroundTransparency = 1; fallbackIcon.Text = "GAME"; fallbackIcon.TextSize = 22
                
                task.spawn(function()
                    local loaded = false
                    -- 1. Prioritas utama: Thumbnail bawaan Roblox menggunakan GameId
                    if gameData.GameId then 
                        pcall(function() 
                            imgLabel.Image = "rbxthumb://type=GameIcon&id="..tostring(gameData.GameId).."&w=150&h=150"
                            local ticks = 0
                            while not imgLabel.IsLoaded and ticks < 20 do task.wait(0.1); ticks = ticks + 1 end
                            if imgLabel.IsLoaded then loaded = true; fallbackIcon.Visible = false end 
                        end) 
                    end
                    -- 2. Prioritas kedua: URL dari ScriptBlox jika GameId gagal atau tidak ada
                    if not loaded and gameData.ImageUrl then 
                        pcall(function() 
                            imgLabel.Image = gameData.ImageUrl 
                            local ticks = 0
                            while not imgLabel.IsLoaded and ticks < 20 do task.wait(0.1); ticks = ticks + 1 end
                            if imgLabel.IsLoaded then fallbackIcon.Visible = false end 
                        end) 
                    end
                end)


                local extraInfoLabel = Instance.new("TextLabel", card)
                extraInfoLabel.Size = UDim2.new(1, -(73 + imgOffset), 0, 15)
                extraInfoLabel.Position = UDim2.new(0, 8 + imgOffset, 0, 54)
                extraInfoLabel.BackgroundTransparency = 1
                extraInfoLabel.Text = string.format("Views %s | %s | Updated %s", FormatNumber(gameData.Views), gameData.HasKey and "Key" or "Keyless", FormatTimeAgo(gameData.UpdatedAt))
                extraInfoLabel.TextColor3 = Color3.fromRGB(150, 150, 150)
                extraInfoLabel.Font = Enum.Font.SourceSans; extraInfoLabel.TextSize = 9; extraInfoLabel.TextXAlignment = Enum.TextXAlignment.Left
            end

            local titleLabel = Instance.new("TextLabel", card); titleLabel.Name = "TitleLabel"
            titleLabel.Size = UDim2.new(1, -(73 + imgOffset), 0, 14)
            titleLabel.Position = UDim2.new(0, 8 + imgOffset, 0, isExplore and 5 or 2)
            titleLabel.BackgroundTransparency = 1
            titleLabel.Text = gameData.Name
            titleLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
            titleLabel.Font = Enum.Font.SourceSansBold
            titleLabel.TextSize = 11
            titleLabel.TextXAlignment = Enum.TextXAlignment.Left
            titleLabel.TextTruncate = Enum.TextTruncate.AtEnd

            local descLabel = Instance.new("TextLabel", card); descLabel.Name = "DescLabel"
            descLabel.Size = UDim2.new(1, -(73 + imgOffset), 0, isExplore and 17 or 12)
            descLabel.Position = UDim2.new(0, 8 + imgOffset, 0, devDescY or 21)
            descLabel.BackgroundTransparency = 1
            descLabel.Text = gameData.Description or ""
            descLabel.TextColor3 = Color3.fromRGB(180, 180, 180)
            descLabel.Font = Enum.Font.SourceSans
            descLabel.TextSize = 9
            descLabel.TextXAlignment = Enum.TextXAlignment.Left
            descLabel.TextYAlignment = Enum.TextYAlignment.Top
            descLabel.TextTruncate = Enum.TextTruncate.AtEnd

            local starButton = Instance.new("TextButton", card); starButton.Name = "StarButton"
            starButton.Size = UDim2.new(0, 20, 0, 20); starButton.Position = UDim2.new(1, -60, 0.5, -10)
            starButton.BackgroundTransparency = 1; starButton.Text = UI.Icons.Star; starButton.Font = Enum.Font.SourceSansBold; starButton.TextSize = 14
            local isFav = favoriteScripts[gameData.Name] == true
            starButton.TextColor3 = isFav and Color3.fromRGB(255, 215, 0) or Color3.fromRGB(100, 100, 100)
            starButton.MouseButton1Click:Connect(function()
                isFav = not isFav; favoriteScripts[gameData.Name] = isFav
                starButton.TextColor3 = isFav and Color3.fromRGB(255, 215, 0) or Color3.fromRGB(100, 100, 100)
                saveFavoriteScripts()
                if currentScriptFilter == "Favorite" then updateScriptList() end
            end)

            if isExplore and hasPermission("Developer") then
                local copyLinkBtn = Instance.new("TextButton", card)
                copyLinkBtn.Size = UDim2.new(0, 20, 0, 20); copyLinkBtn.Position = UDim2.new(1, -85, 0.5, -10)
                copyLinkBtn.BackgroundTransparency = 1; copyLinkBtn.Text = UI.Icons.Memo; copyLinkBtn.TextColor3 = Color3.fromRGB(0, 150, 255); copyLinkBtn.Font = Enum.Font.SourceSansBold; copyLinkBtn.TextSize = 14
                copyLinkBtn.MouseButton1Click:Connect(function()
                    if gameData.Slug and gameData.Slug ~= "" then
                        if setclipboard then setclipboard("https://scriptblox.com/script/"..gameData.Slug); showNotification("Link disalin!", Color3.fromRGB(50, 200, 50)) else showNotification("Gagal menyalin.", Color3.fromRGB(200, 50, 50)) end
                    end
                end)
            end

            local executeButton = Instance.new("TextButton", card); executeButton.Name = "ExecuteButton"
            executeButton.Size = UDim2.new(0, 24, 0, 24); executeButton.Position = UDim2.new(1, -30, 0.5, -12)
            executeButton.BackgroundTransparency = 1
            executeButton.Text = isLocked and UI.Icons.Lock or UI.Icons.Right
            executeButton.TextColor3 = isLocked and Color3.fromRGB(150, 150, 150) or Color3.fromRGB(0, 150, 255)
            executeButton.Font = Enum.Font.SourceSansBold; executeButton.TextSize = 12
            if not isLocked then UI.registerThemeElement(executeButton, "TextColor3", executeButton.TextColor3) end
            local btnStroke = Instance.new("UIStroke", executeButton); btnStroke.Color = isLocked and Color3.fromRGB(100, 100, 100) or Color3.fromRGB(0, 150, 255); btnStroke.Thickness = 1; btnStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
            if not isLocked then UI.registerThemeElement(btnStroke, "Color", btnStroke.Color) end
            local btnCorner = Instance.new("UICorner", executeButton); btnCorner.CornerRadius = UDim.new(0, 4)

            executeButton.MouseButton1Click:Connect(function()
                if isLocked then showNotification("Terkunci.", Color3.fromRGB(255, 100, 100)); return end
                if gameData.Script then
                    if gameData.IsStringScript then
                        local loadedFunc, loadErr = loadstring(gameData.Script)
                        if loadedFunc then task.spawn(function() local s, e = pcall(loadedFunc); if not s then warn(e) showNotification("Script error", Color3.fromRGB(255,100,100)) end end) else warn(loadErr) end
                    else task.spawn(gameData.Script) end
                end
            end)
            if not isLocked then UI.RegisterButtonEffect(executeButton) end
            return card
        end

        local searchDebounce = nil
        local ignoreSearchEvent = false
        searchTextBox:GetPropertyChangedSignal("Text"):Connect(function()
            if ignoreSearchEvent then return end
            if currentScriptFilter == "Explore" then
                if searchDebounce then task.cancel(searchDebounce) end
                searchDebounce = task.delay(0.5, function() scriptBloxPage = 1; fetchScriptBlox(searchTextBox.Text, 1, true) end)
            else updateScriptList() end
        end)

        FavFilterBtn.MouseButton1Click:Connect(function()
            isFavoriteFilterActive = not isFavoriteFilterActive
            FavFilterBtn.TextColor3 = isFavoriteFilterActive and Color3.fromRGB(255, 215, 0) or Color3.fromRGB(200, 200, 200)
            FavFilterBtn.BackgroundColor3 = isFavoriteFilterActive and Color3.fromRGB(0, 150, 255) or Color3.fromRGB(80, 80, 80)
            currentScriptFilter = isFavoriteFilterActive and "Favorite" or "Semua"
            
            -- Reset buttons
            for _, b in pairs(filterButtons) do
                local isActive = (b.Text == currentScriptFilter)
                b.TextColor3 = isActive and getResolvedThemeColor(Color3.fromRGB(0, 200, 255)) or Color3.fromRGB(200, 200, 200)
                local bs = b:FindFirstChildOfClass("UIStroke"); if bs then bs.Color = isActive and getResolvedThemeColor(Color3.fromRGB(0, 150, 255)) or Color3.fromRGB(100, 100, 100) end
            end
            updateScriptList()
        end)

        -- [PERBAIKAN] RefreshFilterBtn handler dipindah ke SINI agar semua variabel lokal
        -- (currentScriptFilter, TotalScriptsLabel, scriptBloxData, fetchScriptBlox, dll)
        -- sudah dideklarasi dan bisa ditangkap sebagai upvalue oleh closure ini.
        -- Sebelumnya handler ini ada di atas sebelum variabel-variabel tsb dideklarasi,
        -- menyebabkan Lua menganggapnya sebagai global (nil) → tombol tidak berfungsi.
        RefreshFilterBtn.MouseButton1Click:Connect(function()
            if currentScriptFilter ~= "Explore" then
                -- Di luar tab Explore, cukup filter ulang daftar lokal
                updateScriptList()
                return
            end
            if isFetchingScriptBlox then return end -- Hindari double-fetch

            -- Reset halaman
            scriptBloxPage = 1
            scriptBloxMaxPage = 9999

            -- Bersihkan data & kartu lama
            for _, card in ipairs(scriptBloxData) do
                if card and card.Parent then card:Destroy() end
            end
            scriptBloxData = {}

            -- Tampilkan status loading
            TotalScriptsLabel.Text = "Loading..."
            local rfIcon = RefreshFilterBtn:FindFirstChild("ArexansIconImage"); if rfIcon then rfIcon.Visible = false end
            RefreshFilterBtn.Text = "..."

            -- Muat ulang berdasarkan state terakhir (mirip scriptblox.lua RefreshTab)
            if currentScriptBloxGameId then
                -- Sedang melihat script game tertentu → refresh game yang sama
                fetchScriptBlox(nil, 1, true)
            elseif searchTextBox.Text ~= "" and searchTextBox.Text ~= "Cari Game..." then
                -- Ada query pencarian aktif → refresh query yang sama
                fetchScriptBlox(searchTextBox.Text, 1, true)
            else
                -- Tampilan default → muat script free terbaru
                fetchScriptBlox("", 1, true)
            end

            -- Kembalikan icon refresh setelah delay (fetchScriptBlox berjalan async)
            task.delay(2, function()
                if RefreshFilterBtn and RefreshFilterBtn.Parent then
                    if UI.applyIcon then UI.applyIcon(RefreshFilterBtn, UI.Icons.Refresh, Color3.fromRGB(255, 255, 255)) else RefreshFilterBtn.Text = "R" end
                end
            end)
        end)

        -- [PERBAIKAN] ThisGameBtn handler — diperbaiki agar:
        -- 1. Update visual state filter button ke "Explore"
        -- 2. Tampilkan loading indicator (tulisan + ikon) saat mencari
        -- 3. Bersihkan data lama sebelum fetch baru
        -- 4. Cari dengan GameId → PlaceId → Nama game (sama seperti scriptblox.lua SearchCurrentGame)
        ThisGameBtn.MouseButton1Click:Connect(function()
            if isFetchingScriptBlox then return end -- Hindari double-fetch

            -- [PERBAIKAN] Update visual filter button ke "Explore" secara paksa
            currentScriptFilter = "Explore"
            for _, b in pairs(filterButtons) do
                local isActive = (b.Text == "Explore")
                b.TextColor3 = isActive and getResolvedThemeColor(Color3.fromRGB(0, 200, 255)) or Color3.fromRGB(200, 200, 200)
                local bStroke = b:FindFirstChildOfClass("UIStroke")
                if bStroke then bStroke.Color = isActive and getResolvedThemeColor(Color3.fromRGB(0, 150, 255)) or Color3.fromRGB(100, 100, 100) end
            end
            -- Pastikan tombol-tombol Explore tampil
            ThisGameBtn.Visible = true
            InfoBtn.Visible = true
            RefreshFilterBtn.Visible = true
            searchTextBox.Size = UDim2.new(1, -100, 1, 0)

            -- Tampilkan loading state
            local oldIcon = ThisGameBtn.Text
            local tgIcon = ThisGameBtn:FindFirstChild("ArexansIconImage"); if tgIcon then tgIcon.Visible = false end
            ThisGameBtn.Text = "..."
            TotalScriptsLabel.Text = "Mencari script game ini..."

            -- Bersihkan data & kartu lama
            for _, card in ipairs(scriptBloxData) do
                if card and card.Parent then card:Destroy() end
            end
            scriptBloxData = {}

            task.spawn(function()
                local placeId = game.PlaceId
                local gameId = game.GameId
                local gameName = "Current Game"

                -- Dapatkan nama game dari Roblox API
                pcall(function()
                    local info = game:GetService("MarketplaceService"):GetProductInfo(placeId)
                    if info and info.Name then gameName = info.Name end
                end)

                -- Tampilkan nama game di search box tanpa trigger auto-search
                ignoreSearchEvent = true
                searchTextBox.Text = gameName ~= "Current Game" and gameName or ("Game " .. tostring(placeId))
                ignoreSearchEvent = false

                -- Reset halaman
                scriptBloxPage = 1
                scriptBloxMaxPage = 9999

                showNotification("Mencari script untuk: " .. (gameName ~= "Current Game" and gameName or tostring(placeId)), Color3.fromRGB(0, 180, 255))

                -- === Tahap 1: Coba cari dengan GameId ===
                local urlGameId = "https://scriptblox.com/api/script/fetch?page=1&max=50&filters.gameId=" .. tostring(gameId)
                local resultGameId = HttpRequest(urlGameId)
                if resultGameId and resultGameId.result and resultGameId.result.scripts and #resultGameId.result.scripts > 0 then
                    currentScriptBloxGameId = gameId
                    fetchScriptBlox(nil, 1, true)
                    if UI.applyIcon then UI.applyIcon(ThisGameBtn, UI.Icons.Game or UI.Icons.Controller, Color3.fromRGB(255, 255, 255)) else ThisGameBtn.Text = oldIcon end
                    showNotification("Ditemukan " .. tostring(#resultGameId.result.scripts) .. "+ script untuk game ini!", Color3.fromRGB(50, 200, 50))
                    return
                end

                -- === Tahap 2: Coba cari dengan PlaceId ===
                local urlPlaceId = "https://scriptblox.com/api/script/fetch?page=1&max=50&filters.gameId=" .. tostring(placeId)
                local resultPlaceId = HttpRequest(urlPlaceId)
                if resultPlaceId and resultPlaceId.result and resultPlaceId.result.scripts and #resultPlaceId.result.scripts > 0 then
                    currentScriptBloxGameId = placeId
                    fetchScriptBlox(nil, 1, true)
                    if UI.applyIcon then UI.applyIcon(ThisGameBtn, UI.Icons.Game or UI.Icons.Controller, Color3.fromRGB(255, 255, 255)) else ThisGameBtn.Text = oldIcon end
                    showNotification("Ditemukan " .. tostring(#resultPlaceId.result.scripts) .. "+ script untuk game ini!", Color3.fromRGB(50, 200, 50))
                    return
                end

                -- === Tahap 3: Fallback cari berdasarkan nama game ===
                currentScriptBloxGameId = nil
                if gameName ~= "Current Game" then
                    TotalScriptsLabel.Text = "Mencari berdasarkan nama: " .. gameName
                    fetchScriptBlox(gameName, 1, true)
                else
                    TotalScriptsLabel.Text = "Mencari berdasarkan Place ID..."
                    fetchScriptBlox(tostring(placeId), 1, true)
                end
                if UI.applyIcon then UI.applyIcon(ThisGameBtn, UI.Icons.Game or UI.Icons.Controller, Color3.fromRGB(255, 255, 255)) else ThisGameBtn.Text = oldIcon end
                showNotification("Script dicari berdasarkan nama game", Color3.fromRGB(255, 180, 0))
            end)
        end)

        InfoBtn.MouseButton1Click:Connect(function()
            GameInfoPanel.Visible = not GameInfoPanel.Visible
            if GameInfoPanel.Visible then
                GameListContainer.Size = UDim2.new(1, 0, 1, -150)
                if not isGameInfoLoaded then
                    task.spawn(function()
                        local success, info = pcall(function() return game:GetService("MarketplaceService"):GetProductInfo(game.PlaceId) end)
                        if success and info then gameNameLabel.Text = "Name: " .. (info.Name or "Unknown"); isGameInfoLoaded = true else gameNameLabel.Text = "Name: Unknown" end
                    end)
                end
            else
                GameListContainer.Size = UDim2.new(1, 0, 1, -75)
            end
        end)

        -- Load Initial Games
        task.spawn(function()
            local games = {}
            local success, loadedGames = pcall(function()
                local _gsUrl = "https://caecqqzbikmwroevvyrd.supabase.co/functions/v1/get-script?name=game"
                local _gsSrc
                for _attempt = 1, 3 do
                    local _ok, _res = pcall(function() return game:HttpGet(_gsUrl .. "&t=" .. tostring(tick())) end)
                    if _ok and type(_res) == "string" and #_res > 20 then _gsSrc = _res break end
                    task.wait(0.6)
                end
                if type(_gsSrc) ~= "string" or _gsSrc == "" then error("[Arexans] game.lua kosong / gagal diunduh") end
                local _gsLoad = loadstring or load
                if type(_gsLoad) ~= "function" then error("[Arexans] executor tidak punya loadstring") end
                local _gsFn, _gsErr = _gsLoad(_gsSrc, "=game.lua")
                if type(_gsFn) ~= "function" then error("[Arexans] game.lua compile error: " .. tostring(_gsErr)) end
                local _gsTbl = _gsFn()
                if type(_gsTbl) == "function" then _gsTbl = _gsTbl() end
                if type(_gsTbl) ~= "table" then error("[Arexans] game.lua tidak mengembalikan tabel") end
                return _gsTbl
            end)
            if success and type(loadedGames) == "table" then games = loadedGames end
            
            for _, child in ipairs(GameListContainer:GetChildren()) do if child:IsA("Frame") then child:Destroy() end end

            local flatGames = {}
            if type(games) == "table" then
                local isGrouped = false; for k in pairs(games) do if type(k) == "string" then isGrouped = true break end end
                if isGrouped then
                    for category, list in pairs(games) do
                        if type(list) == "table" then for _, item in ipairs(list) do if type(item) == "table" then item.Category = category; table.insert(flatGames, item) end end end
                    end
                else flatGames = games end
            end
            table.sort(flatGames, function(a, b) return (a.Name or "") < (b.Name or "") end)
            gamesData = flatGames
            for i, gameData in ipairs(flatGames) do
                local isLocked = false; if gameData.Role then isLocked = not hasPermission(gameData.Role) end
                local card = createGameCard(GameListContainer, gameData, isLocked); card.LayoutOrder = i
            end
            updateScriptList()
        end)
    end

    setupGameTab()

    -- v21: setelah semua UI awal selesai dibuat, terapkan default role sekali saja.
    _ArexansThemeBootstrapReady = true
    if isGradientRole() then
        pcall(function() refreshRoleGradientUI(ScreenGui) end)
    elseif UI.isThemeManagerActive or (UI._ArexansIsVIPRole and UI._ArexansIsVIPRole()) then
        applyThemeColorNow(getResolvedThemeColor(getRoleDefaultThemeColor()))
    end
    -- v22: UI baru ditampilkan setelah default role final masuk.
    ScreenGui.Enabled = true

    UI.MakeDraggable(MainFrame, TitleBar, function() return true end, nil)

    -- [[ PERUBAHAN BARU: Logika untuk mengubah ukuran MainFrame (Diperbaiki) ]]
    ConnectEvent(MainResizeHandle.InputBegan, function(input)
        if not (input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch) then return end

        local isResizing = true
        local initialMousePosition = UserInputService:GetMouseLocation()
        local initialFrameSize = MainFrame.AbsoluteSize

        local inputChangedConnection
        local inputEndedConnection

        inputChangedConnection = UserInputService.InputChanged:Connect(function(changedInput)
            if isResizing and (changedInput.UserInputType == Enum.UserInputType.MouseMovement or changedInput.UserInputType == Enum.UserInputType.Touch) then
                local delta = UserInputService:GetMouseLocation() - initialMousePosition
                local newSizeX = math.max(200, initialFrameSize.X + delta.X) -- Ukuran minimum
                local newSizeY = math.max(150, initialFrameSize.Y + delta.Y) -- Ukuran minimum
                MainFrame.Size = UDim2.new(0, newSizeX, 0, newSizeY)
            end
        end)

        inputEndedConnection = UserInputService.InputEnded:Connect(function(endedInput)
            if endedInput.UserInputType == input.UserInputType then
                isResizing = false
                if inputChangedConnection then inputChangedConnection:Disconnect() end
                if inputEndedConnection then inputEndedConnection:Disconnect() end
                saveGuiPositions() -- Simpan ukuran baru setelah selesai
            end
        end)
    end)
    
    -- [PERBAIKAN] Sekarang, tombol ◀ (MiniToggleButton) menjadi satu-satunya handle untuk menggeser
    -- kontainernya (MiniToggleContainer). Ini meniru perilaku jendela utama di mana TitleBar
    -- digunakan untuk menggeser MainFrame. Logika klik dan geser kini disatukan.
    UI.MakeDraggable(MiniToggleContainer, MiniToggleButton, function() return isMiniToggleDraggable end, nil)
    if MiniToggleButton and not MiniToggleButton:GetAttribute("ArexansToggleMainFrameBound") then
        MiniToggleButton:SetAttribute("ArexansToggleMainFrameBound", true)
        ConnectEvent(MiniToggleButton.MouseButton1Click, function()
            toggleMainFrame()
        end)
    end
    
    -- Koneksi MouseButton1Click yang lama untuk MiniToggleButton dihapus karena fungsinya
    -- sekarang sudah ditangani oleh argumen 'clickCallback' di dalam MakeDraggable.

    ConnectEvent(EmoteToggleButton.MouseButton1Click, function()
        pcall(initializeEmoteGUI)
    end)

    ConnectEvent(AnimationShowButton.MouseButton1Click, function()
        if AnimationScreenGui then
            local frame = AnimationScreenGui:FindFirstChild("GazeBro")
            if frame then
                frame.Visible = true
                AnimationShowButton.Visible = false
            end
        end
    end)
    
    ConnectEvent(UserInputService.InputBegan, function(input, processed)
        if processed or UserInputService:GetFocusedTextBox() then return end

        -- [[ KEYBIND HANDLER ]]
        if Keybinds.Fly and input.KeyCode == Keybinds.Fly then
            if not IsFlying then StartFly() else StopFly() end
        elseif Keybinds.Invisible and input.KeyCode == Keybinds.Invisible then
            ToggleFEInvisible(not IsFEInvisibleEnabled)
        elseif Keybinds.WalkSpeed and input.KeyCode == Keybinds.WalkSpeed then
            ToggleWalkSpeed(not IsWalkSpeedEnabled)
        end

        local isRecordKey = Keybinds.Record and input.KeyCode == Keybinds.Record
        local isStopKey = Keybinds.StopRecord and input.KeyCode == Keybinds.StopRecord

        if isRecordKey or isStopKey then
            if isRecordKey and isStopKey then
                -- Toggle Behavior (Sama seperti tombol C lama)
                if isRecording then
                    stopRecording(true)
                    if isPlaying then stopPlayback(false, true) end
                elseif isPlaying then
                    stopPlayback(false, true)
                else
                    if IsViewingPlayer and currentlyViewedPlayer then
                        startRecording(currentlyViewedPlayer, true)
                    else
                        startRecording(LocalPlayer, true)
                    end
                end
            elseif isRecordKey then
                -- Start Only
                if not isRecording then
                    if IsViewingPlayer and currentlyViewedPlayer then
                        startRecording(currentlyViewedPlayer, true)
                    else
                        startRecording(LocalPlayer, true)
                    end
                end
            elseif isStopKey then
                -- Stop Only
                if isRecording then
                    stopRecording(true)
                    if isPlaying then stopPlayback(false, true) end
                elseif isPlaying then
                    stopPlayback(false, true)
                end
            end
        end
    end)

    
    function applyAllAnimations(character)
        if isGameAnimationOverrideActive then return end
        if not character or not next(lastAnimations) then return end

        local animateScript = character:WaitForChild("Animate", 10)
        if not animateScript then
            warn("ArexansTools: Gagal menerapkan animasi, script 'Animate' tidak ditemukan.")
            return
        end

        task.wait(0.2) -- A short wait to ensure the script is ready

        -- Helper function to safely destroy and replace an animation object.
        -- This is crucial for respawns as the old objects are destroyed.
        local function replaceAnimation(parent, animName, newId)
            if not parent then return end
            -- Destroy the old animation object if it exists
            local oldAnim = parent:FindFirstChild(animName)
            if oldAnim then
                oldAnim:Destroy()
            end
            -- Create a new animation instance
            local newAnim = Instance.new("Animation")
            newAnim.Name = animName
            newAnim.AnimationId = "http://www.roblox.com/asset/?id=" .. tostring(newId)
            newAnim.Parent = parent
        end

        pcall(function()
            if lastAnimations.Idle and #lastAnimations.Idle == 2 then
                replaceAnimation(animateScript.idle, "Animation1", lastAnimations.Idle[1])
                replaceAnimation(animateScript.idle, "Animation2", lastAnimations.Idle[2])
            end
            if lastAnimations.Walk then replaceAnimation(animateScript.walk, "WalkAnim", lastAnimations.Walk) end
            if lastAnimations.Run then replaceAnimation(animateScript.run, "RunAnim", lastAnimations.Run) end
            if lastAnimations.Jump then replaceAnimation(animateScript.jump, "JumpAnim", lastAnimations.Jump) end
            if lastAnimations.Fall then replaceAnimation(animateScript.fall, "FallAnim", lastAnimations.Fall) end
            if lastAnimations.Swim and animateScript.swim then replaceAnimation(animateScript.swim, "Swim", lastAnimations.Swim) end
            if lastAnimations.SwimIdle and animateScript.swimidle then replaceAnimation(animateScript.swimidle, "SwimIdle", lastAnimations.SwimIdle) end
            if lastAnimations.Climb then replaceAnimation(animateScript.climb, "ClimbAnim", lastAnimations.Climb) end
        end)
    end
    
    function applyInitialStates()
        -- State ringan langsung diterapkan; state berat dipindah ke task terpisah supaya execute awal tidak patah-patah.
        ToggleFEInvisible(IsFEInvisibleEnabled)
        ToggleAntiTeleport(IsAntiTeleportEnabled)

        if not darkActive then
            Lighting.Brightness = Settings.Brightness
        end

        if isGradientRole() then
            UI.currentThemeColor = UI.isThemeManagerActive and (UI.currentThemeColor or UI._ArexansPendingThemeColor or getRoleDefaultThemeColor()) or getRoleDefaultThemeColor()
            refreshRoleGradientUI()
        elseif UI._ArexansIsVIPRole() then
            UI.currentThemeColor = UI.isThemeManagerActive and (UI.currentThemeColor or UI._ArexansPendingThemeColor or getRoleDefaultThemeColor()) or getRoleDefaultThemeColor()
            applyThemeColorNow(UI.currentThemeColor)
        end
        if UI.isThemeManagerActive and not isGradientRole() then UI.updateTheme(UI.currentThemeColor) end
        refreshRoleGradientUI()

        task.defer(function()
            if IsAntiLagEnabled then ToggleAntiLag(true) end
            if IsBoostFPSEnabled then ToggleBoostFPS(true) end
            if IsOptimizedGameEnabled then scanAndDisableHeavyObjects() end
            if darkActive then applyDarkTotal() end
        end)
        
        manageEspConnection()
    end
    
    function reapplyFeaturesOnRespawn(character)
        if not character then return end
    
        -- Tunggu sebentar agar karakter sepenuhnya dimuat
        task.wait(0.2) 
    
        -- Terapkan kembali status untuk setiap fitur
        -- Ini akan menangani status 'on' dan 'off'
        ToggleWalkSpeed(IsWalkSpeedEnabled)
        ToggleGodMode(IsGodModeEnabled)
        ToggleAntiFling(antifling_enabled)
        ToggleNoclip(IsNoclipEnabled)
        ToggleShiftLock(IsShiftLockEnabled)

        -- [[ INTEGRASI KUNCI KECEPATAN ]] --
        if character:FindFirstChildOfClass("Humanoid") then
            speedLock_bindHumanoid(character:FindFirstChildOfClass("Humanoid"))
        end

        -- Untuk fitur yang memerlukan logika khusus saat respawn
        if IsInvisibleGhostEnabled then
            -- Nonaktifkan saat respawn untuk mencegah bug, pengguna dapat mengaktifkannya kembali
            ToggleInvisibleGhost(false) 
        end
    
        if IsInfinityJumpEnabled then
            -- Sambungkan kembali event jika diaktifkan
            if infinityJumpConnection then infinityJumpConnection:Disconnect() end
            infinityJumpConnection = ConnectEvent(UserInputService.JumpRequest, function()
                if IsInfinityJumpEnabled and LocalPlayer.Character and LocalPlayer.Character:FindFirstChildOfClass("Humanoid") then
                    LocalPlayer.Character.Humanoid:ChangeState(Enum.HumanoidStateType.Jumping)
                end
            end)
        end
    
        if IsFlying then
            -- Hentikan dan mulai ulang terbang untuk mendapatkan body movers baru
            IsFlying = false -- Setel ulang status untuk memulai ulang
            if UserInputService.TouchEnabled then
                StartMobileFly()
            else
                StartFly()
            end
        end

        -- [UPGRADED] Deteksi animasi bawaan/custom game (R6 + R15) via Creator check
        isGameAnimationOverrideActive = false
        task.wait(0.6) -- Beri waktu agar script Animate memuat animasi

        local humanoid = character:FindFirstChildOfClass("Humanoid")
        if humanoid then
            local MarketplaceService = game:GetService("MarketplaceService")
            local checkedIds = {}
            local function isRobloxAnim(rawId)
                local num = tostring(rawId or ""):match("%d+")
                if not num or num == "0" then return true end
                if checkedIds[num] ~= nil then return checkedIds[num] end
                local ok, info = pcall(function()
                    return MarketplaceService:GetProductInfo(tonumber(num), Enum.InfoType.Asset)
                end)
                local result = false
                if ok and type(info) == "table" then
                    local c = info.Creator
                    if c and (c.CreatorTargetId == 1 or c.CreatorType == "User" and tostring(c.Name):lower() == "roblox" or tostring(c.Name):lower() == "roblox") then
                        result = true
                    end
                end
                checkedIds[num] = result
                return result
            end

            local isCustom = false
            local animateScript = character:FindFirstChild("Animate")
            if animateScript then
                for _, desc in ipairs(animateScript:GetDescendants()) do
                    if desc:IsA("Animation") and desc.AnimationId ~= "" then
                        if not isRobloxAnim(desc.AnimationId) then
                            isCustom = true
                            break
                        end
                    end
                end
            end

            if not isCustom then
                local animator = humanoid:FindFirstChildOfClass("Animator")
                if animator then
                    local ok, tracks = pcall(function() return animator:GetPlayingAnimationTracks() end)
                    if ok and type(tracks) == "table" then
                        for _, tr in ipairs(tracks) do
                            if tr.Animation and tr.Animation.AnimationId ~= "" then
                                if not isRobloxAnim(tr.Animation.AnimationId) then
                                    isCustom = true; break
                                end
                            end
                        end
                    end
                end
            end

            if isCustom then
                isGameAnimationOverrideActive = true
                -- Force matikan animasi VIP yang sedang aktif agar karakter tidak bug bergerak menyeret
                isAnimationEnabled = false
                if AnimationScreenGui and AnimationScreenGui.Parent then
                    pcall(function() AnimationScreenGui:Destroy() end)
                    AnimationScreenGui = nil
                end
                if AnimationShowButton then
                    pcall(function() AnimationShowButton.Visible = false end)
                end
                showNotification("Animasi bawaan game terdeteksi! Animasi VIP dinonaktifkan otomatis agar karakter tidak bug.", getResolvedThemeColor(Color3.fromRGB(255, 150, 0)))
            end
        end

        applyAllAnimations(character)
    end
    
    ConnectEvent(LocalPlayer.CharacterAdded, reapplyFeaturesOnRespawn)

    -- INISIALISASI
    applyInitialStates()
    switchTab("Player")
    
    if LocalPlayer.Character then
        reapplyFeaturesOnRespawn(LocalPlayer.Character)
    end

    lastPlayerPosition = LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("HumanoidRootPart") and LocalPlayer.Character.HumanoidRootPart.Position
    RunService.Heartbeat:Connect(function()
        if not isPlaying then return end
        local char = LocalPlayer.Character
        local hrp = char and char:FindFirstChild("HumanoidRootPart")
        if hrp then
            if lastPlayerPosition then
                if (hrp.Position - lastPlayerPosition).Magnitude > 100 then
                    if type(stopPlayback) == "function" then
                        stopPlayback(false, true)
                    elseif type(stopActions) == "function" then
                        stopActions()
                    else
                        isPlaying = false
                    end
                end
            end
            lastPlayerPosition = hrp.Position
        end
    end)

    -- Countdown Timer
    countdownConn = nil
    logoutNotificationFrame = nil
    local _arexansLastCountdownSecond = nil
    local _arexansExpirationGradientApplied = false
    countdownConn = RunService.Heartbeat:Connect(function()
        if not ScreenGui or not ScreenGui.Parent then
            countdownConn:Disconnect()
            return
        end

        local currentSecond = os.time()
        local remainingSeconds = expirationTimestamp - currentSecond
        local remainingWholeSecond = math.floor(remainingSeconds)
        if _arexansLastCountdownSecond == remainingWholeSecond then
            return
        end
        _arexansLastCountdownSecond = remainingWholeSecond

        if remainingSeconds <= 10 and remainingSeconds > 0 then
            if not logoutNotificationFrame or not logoutNotificationFrame.Parent then
                logoutNotificationFrame = Instance.new("Frame", ScreenGui)
                logoutNotificationFrame.Name = "LogoutNotificationFrame"
                logoutNotificationFrame.Size = UDim2.new(0, 300, 0, 50)
                logoutNotificationFrame.Position = UDim2.new(0.5, -150, 0.1, 0)
                logoutNotificationFrame.BackgroundColor3 = Color3.fromRGB(200, 50, 50)
                logoutNotificationFrame.BackgroundTransparency = 0.2
                logoutNotificationFrame.BorderSizePixel = 0
                local corner = Instance.new("UICorner", logoutNotificationFrame); corner.CornerRadius = UDim.new(0, 8)
                local stroke = Instance.new("UIStroke", logoutNotificationFrame); stroke.Color = Color3.fromRGB(255, 100, 100); stroke.Thickness = 1
                
                local label = Instance.new("TextLabel", logoutNotificationFrame)
                label.Name = "CountdownLabel"
                label.Size = UDim2.new(1, 0, 1, 0)
                label.BackgroundTransparency = 1
                label.Font = Enum.Font.SourceSansBold
                label.TextColor3 = Color3.fromRGB(255, 255, 255)
                label.TextSize = 16
                label.TextWrapped = true
            end
            local label = logoutNotificationFrame and logoutNotificationFrame:FindFirstChild("CountdownLabel")
            if label then
                label.Text = "Sesi akan berakhir & logout dalam " .. math.floor(remainingSeconds) .. " detik..."
            end
        end

        if remainingSeconds < 1 then
            countdownConn:Disconnect() -- Disconnect this timer itself
            HandleLogout() -- Perform total shutdown and logout
            return -- Stop the function
        end

        -- Update label text
        local days = math.floor(remainingSeconds / 86400)
        local rem = remainingSeconds % 86400
        local hours = math.floor(rem / 3600)
        rem = rem % 3600
        local minutes = math.floor(rem / 60)
        local seconds = rem % 60
        if ExpirationLabel and ExpirationLabel.Parent then
            local success, timerText = pcall(function()
                return string.format("Expires in: %dD %02dH %02dM %02dS", days, hours, minutes, seconds)
            end)
            if success and timerText then
                ExpirationLabel.Text = timerText
            end
            if ScreenGui and ScreenGui:FindFirstChild("MainFrame") and ScreenGui.MainFrame:FindFirstChild("TitleBar") and ScreenGui.MainFrame.TitleBar:FindFirstChild("RoleLabel") then
                ExpirationLabel.TextColor3 = getResolvedThemeColor(ScreenGui.MainFrame.TitleBar.RoleLabel.TextColor3)
                
                -- Developer gradient tidak dipasang ulang setiap frame; cukup sekali lalu biarkan scheduler low-lag yang memproses.
                if isGradientRole() then
                    local hasGradient = false
                    pcall(function() hasGradient = ExpirationLabel:FindFirstChild("DeveloperGradient") ~= nil end)
                    if (not _arexansExpirationGradientApplied) or (not hasGradient) then
                        pcall(function() ExpirationLabel:SetAttribute("ArexansThemeAccent", true) end)
                        applyDeveloperGradient(ExpirationLabel)
                        _arexansExpirationGradientApplied = true
                    end
                else
                    _arexansExpirationGradientApplied = false
                    local existingGradient = ExpirationLabel:FindFirstChild("DeveloperGradient")
                    if existingGradient then existingGradient:Destroy() end
                end
            end
        end
    end)
    end -- End of InitializeMainGUI

    InitializeMainGUI(expirationTimestamp, userRole)
    
    -- [[ REALTIME ROLE CHECKER ]]
    task.spawn(function()
        while ScreenGui and ScreenGui.Parent do
            task.wait(10) -- Cek setiap 10 detik agar responsif
            if sessionInfo and sessionInfo.check_realtime then
                 local success, realtimeResult = pcall(sessionInfo.check_realtime)
                 if success and realtimeResult and type(realtimeResult) == "table" then
                      -- Gunakan logika ekstraksi yang sama dengan keysistem
                      local newRole = realtimeResult.role or (realtimeResult.data and realtimeResult.data.role)
                      
                      -- Fallback checks jika struktur berbeda
                      if not newRole then
                          newRole = realtimeResult.Role or realtimeResult.ROLE or realtimeResult.user_role or realtimeResult.UserRole
                      end
                      if not newRole and realtimeResult.data then
                          newRole = realtimeResult.data.Role or realtimeResult.data.ROLE or realtimeResult.data.user_role
                      end

                      if newRole and newRole ~= currentUserRole then
                           currentUserRole = newRole
                           if tostring(currentUserRole or ""):upper() == "LIFETIME" then currentUserRole = "Lifetime" end
                           if currentUserRole == "DEVELOPER" then currentUserRole = "Developer" end

                           -- Update HSV Label
                           local settingsTab = ScreenGui and ScreenGui:FindFirstChild("MainFrame") and ScreenGui.MainFrame:FindFirstChild("ContentFrame") and ScreenGui.MainFrame.ContentFrame:FindFirstChild("SettingsTab")
                           if settingsTab then
                               local themeControls = settingsTab:FindFirstChild("ThemeControls")
                               if themeControls then
                                   for _, child in ipairs(themeControls:GetChildren()) do
                                       if child:IsA("Frame") and child:FindFirstChild("TitleLabel") then
                                           local lbl = child.TitleLabel
                                           if string.find(lbl.Text, "HSV Warna") then
                                               lbl.Text = isGradientRole() and "HSV Warna Gradient (Lifetime)" or "HSV Warna UI"
                                           end
                                       end
                                   end
                               end
                           end
                           -- Update UI Label
                           if ScreenGui then
                               local titleBar = ScreenGui:FindFirstChild("MainFrame") and ScreenGui.MainFrame:FindFirstChild("TitleBar")
                               local roleLabel = titleBar and titleBar:FindFirstChild("RoleLabel")
                               local saveProfileBtn = titleBar and titleBar:FindFirstChild("SaveProfileBtn")
                               local loadProfileBtn = titleBar and titleBar:FindFirstChild("LoadProfileBtn")
                               if roleLabel then 
                                    roleLabel.Text = currentUserRole
                                    local roleColors = {
                                        NORMAL = Color3.fromRGB(0, 255, 0), 
                                        Normal = Color3.fromRGB(0, 255, 0), 
                                        VIP = Color3.fromRGB(170, 0, 255), 
                                        Lifetime = Color3.fromRGB(0, 170, 255), 
                                        LIFETIME = Color3.fromRGB(0, 170, 255),
                                        Developer = Color3.fromRGB(0, 170, 255), 
                                        DEVELOPER = Color3.fromRGB(0, 170, 255),
                                        Free = Color3.fromRGB(128, 128, 128),
                                        FREE = Color3.fromRGB(128, 128, 128)
                                    }
                                    local newColor = isGradientRole() and getResolvedThemeColor(getRoleDefaultThemeColor()) or (UI._ArexansIsVIPRole() and getResolvedThemeColor(getRoleDefaultThemeColor()) or (roleColors[currentUserRole] or roleColors[tostring(currentUserRole):upper()] or getResolvedThemeColor(getRoleDefaultThemeColor())))
                                    roleLabel.TextColor3 = newColor
                                    
                                    UI.currentThemeColor = newColor
                                    if UI._ArexansIsVIPRole() then
                                        applyThemeColorNow(newColor)
                                    elseif UI.isThemeManagerActive and UI.updateTheme then
                                        UI.updateTheme(newColor)
                                    end
                                    if saveProfileBtn then saveProfileBtn.ImageColor3 = newColor end
                                    if loadProfileBtn then loadProfileBtn.ImageColor3 = newColor end
                                    local expirationLabel = ScreenGui.MainFrame and ScreenGui.MainFrame:FindFirstChild("ExpirationLabel")
                                    if expirationLabel then expirationLabel.TextColor3 = newColor end
                                    local profilesFrame = ScreenGui.MainFrame and ScreenGui.MainFrame:FindFirstChild("ProfilesFrame")
                                    local profilesTitle = profilesFrame and profilesFrame:FindFirstChild("ProfilesTitle")
                                    if profilesTitle then profilesTitle.TextColor3 = newColor end
                                    -- Developer special effect
                                    local existingGradient = roleLabel:FindFirstChild("DeveloperGradient")
                                    if existingGradient then
                                        existingGradient:Destroy()
                                    end
                                    if isGradientRole() then
                                        applyDeveloperGradient(roleLabel)
                                        local function applyGradientTo(elem)
                                            if elem and (elem:IsA("ImageButton") or elem:IsA("ImageLabel")) then return end
                                            applyDeveloperGradient(elem)
                                        end
                                        
                                        applyGradientTo(saveProfileBtn)
                                        applyGradientTo(loadProfileBtn)
                                        
                                        local mainFrame = ScreenGui:FindFirstChild("MainFrame")
                                        local borderFrame = mainFrame and mainFrame:FindFirstChild("BorderFrame")
                                        applyGradientTo(borderFrame and borderFrame:FindFirstChild("MainBorderStroke"))
                                        
                                        local emoteGui = CoreGui:FindFirstChild("EmoteWindowGUI")
                                        local emoteMainFrame = emoteGui and emoteGui:FindFirstChild("MainFrame")
                                        applyGradientTo(emoteMainFrame and emoteMainFrame:FindFirstChild("EmoteBorderStroke"))
                                        
                                        local animGui = CoreGui:FindFirstChild("GazeVerificator") or (Players.LocalPlayer:WaitForChild("PlayerGui") and Players.LocalPlayer.PlayerGui:FindFirstChild("GazeVerificator"))
                                        local animFrame = animGui and animGui:FindFirstChild("GazeBro")
                                        applyGradientTo(animFrame and animFrame:FindFirstChild("AnimBorderStroke"))
                                        
                                        local miniToggleContainer = ScreenGui:FindFirstChild("MiniToggleContainer")
                                        applyGradientTo(miniToggleContainer and miniToggleContainer:FindFirstChild("MiniToggleButton") and miniToggleContainer.MiniToggleButton:FindFirstChildOfClass("UIStroke"))
                                        applyGradientTo(miniToggleContainer and miniToggleContainer:FindFirstChild("MiniToggleButton"))
                                        applyGradientTo(miniToggleContainer and miniToggleContainer:FindFirstChild("EmoteToggleButton") and miniToggleContainer.EmoteToggleButton:FindFirstChildOfClass("UIStroke"))
                                        applyGradientTo(miniToggleContainer and miniToggleContainer:FindFirstChild("AnimationShowButton") and miniToggleContainer.AnimationShowButton:FindFirstChildOfClass("UIStroke"))
                                        
                                        applyGradientTo(mainFrame and mainFrame:FindFirstChild("VertSeparator"))
                                        applyGradientTo(mainFrame and mainFrame:FindFirstChild("HorizSeparator"))
                                        applyGradientTo(mainFrame and mainFrame:FindFirstChild("FooterSeparator"))
                                        applyGradientTo(mainFrame and mainFrame:FindFirstChild("MainResizeHandle"))

                                        local tabsFrame = mainFrame and mainFrame:FindFirstChild("TabsFrame")
                                        if tabsFrame then
                                            for _, btn in ipairs(tabsFrame:GetChildren()) do
                                                if btn:IsA("TextButton") then
                                                    applyGradientTo(btn:FindFirstChildOfClass("UIStroke"))
                                                    if btn.BackgroundTransparency < 1 then applyGradientTo(btn) end
                                                end
                                            end
                                        end
                                        
                                        local topBarContainer = mainFrame and mainFrame:FindFirstChild("TopBarContainer")
                                        applyGradientTo(topBarContainer and topBarContainer:FindFirstChild("InfoBtn"))
                                        local titleBar = mainFrame and mainFrame:FindFirstChild("TitleBar")
                                        applyGradientTo(titleBar and titleBar:FindFirstChild("TitleLabel"))
                                        applyGradientTo(titleBar and titleBar:FindFirstChild("InfoButton"))
                                        refreshRoleGradientUI()
                                    else
                                        local function removeGradientFrom(elem)
                                            if elem and elem:FindFirstChild("DeveloperGradient") then elem.DeveloperGradient:Destroy() end
                                        end
                                        
                                        removeGradientFrom(saveProfileBtn)
                                        removeGradientFrom(loadProfileBtn)
                                        
                                        local mainFrame = ScreenGui:FindFirstChild("MainFrame")
                                        local borderFrame = mainFrame and mainFrame:FindFirstChild("BorderFrame")
                                        removeGradientFrom(borderFrame and borderFrame:FindFirstChild("MainBorderStroke"))
                                        
                                        local emoteGui = CoreGui:FindFirstChild("EmoteWindowGUI")
                                        local emoteMainFrame = emoteGui and emoteGui:FindFirstChild("MainFrame")
                                        removeGradientFrom(emoteMainFrame and emoteMainFrame:FindFirstChild("EmoteBorderStroke"))
                                        
                                        local animGui = CoreGui:FindFirstChild("GazeVerificator") or (Players.LocalPlayer:WaitForChild("PlayerGui") and Players.LocalPlayer.PlayerGui:FindFirstChild("GazeVerificator"))
                                        local animFrame = animGui and animGui:FindFirstChild("GazeBro")
                                        removeGradientFrom(animFrame and animFrame:FindFirstChild("AnimBorderStroke"))
                                        
                                        local miniToggleContainer = ScreenGui:FindFirstChild("MiniToggleContainer")
                                        removeGradientFrom(miniToggleContainer and miniToggleContainer:FindFirstChild("MiniToggleButton") and miniToggleContainer.MiniToggleButton:FindFirstChildOfClass("UIStroke"))
                                        removeGradientFrom(miniToggleContainer and miniToggleContainer:FindFirstChild("MiniToggleButton"))
                                        removeGradientFrom(miniToggleContainer and miniToggleContainer:FindFirstChild("EmoteToggleButton") and miniToggleContainer.EmoteToggleButton:FindFirstChildOfClass("UIStroke"))
                                        removeGradientFrom(miniToggleContainer and miniToggleContainer:FindFirstChild("AnimationShowButton") and miniToggleContainer.AnimationShowButton:FindFirstChildOfClass("UIStroke"))
                                        
                                        removeGradientFrom(mainFrame and mainFrame:FindFirstChild("VertSeparator"))
                                        removeGradientFrom(mainFrame and mainFrame:FindFirstChild("HorizSeparator"))
                                        removeGradientFrom(mainFrame and mainFrame:FindFirstChild("FooterSeparator"))
                                        removeGradientFrom(mainFrame and mainFrame:FindFirstChild("MainResizeHandle"))

                                        local tabsFrame = mainFrame and mainFrame:FindFirstChild("TabsFrame")
                                        if tabsFrame then
                                            for _, btn in ipairs(tabsFrame:GetChildren()) do
                                                if btn:IsA("TextButton") then
                                                    removeGradientFrom(btn:FindFirstChildOfClass("UIStroke"))
                                                    removeGradientFrom(btn)
                                                end
                                            end
                                        end
                                        
                                        local topBarContainer = mainFrame and mainFrame:FindFirstChild("TopBarContainer")
                                        removeGradientFrom(topBarContainer and topBarContainer:FindFirstChild("InfoBtn"))
                                        local titleBar = mainFrame and mainFrame:FindFirstChild("TitleBar")
                                        removeGradientFrom(titleBar and titleBar:FindFirstChild("TitleLabel"))
                                        removeGradientFrom(titleBar and titleBar:FindFirstChild("InfoButton"))
                                    end
                               end
                           end
                      end
                 end
            end
        end
    end)

end