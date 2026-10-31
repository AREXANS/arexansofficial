local UI = {}

-- Services
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local CoreGui = game:GetService("CoreGui")
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")

-- Theme System
UI.ThemeableElements = {}
UI._AutoThemeElements = {}
UI.isThemeManagerActive = false
UI.currentThemeColor = Color3.fromRGB(128, 128, 128)
UI.defaultThemeColor = Color3.fromRGB(128, 128, 128)
UI._ArexansPendingThemeColor = UI.defaultThemeColor
UI._ArexansThemeApplyOverride = false

local function _arexansColorDistance(a, b)
    return math.abs(a.R - b.R) + math.abs(a.G - b.G) + math.abs(a.B - b.B)
end

local _AREXANS_OLD_BLUE_COLORS = {
    Color3.fromRGB(0, 50, 150),
    Color3.fromRGB(0, 120, 255),
    Color3.fromRGB(0, 150, 255),
    Color3.fromRGB(0, 170, 255),
    Color3.fromRGB(0, 200, 255),
    Color3.fromRGB(50, 150, 200),
}

local function _arexansIsOldThemeBlue(color)
    if typeof(color) ~= "Color3" then return false end
    for _, oldColor in ipairs(_AREXANS_OLD_BLUE_COLORS) do
        if _arexansColorDistance(color, oldColor) <= 0.035 then
            return true
        end
    end
    -- Fallback untuk variasi biru UI lama yang tidak terdaftar manual.
    return color.B >= 0.70 and color.G >= 0.18 and color.R <= 0.28 and color.B > color.R and color.B >= color.G
end

local function _arexansRememberAutoTheme(instance, property)
    if not instance or not property then return end
    local attr = "ArexansAutoTheme_" .. tostring(property)
    local okHas, hasAttr = pcall(function() return instance:GetAttribute(attr) end)
    if okHas and hasAttr then return end
    pcall(function() instance:SetAttribute(attr, true) end)
    table.insert(UI._AutoThemeElements, {instance = instance, property = property})
end

local function _arexansApplyColorProperty(instance, property, newColor, force)
    if not instance or not property or not newColor then return end
    local ok, current = pcall(function() return instance[property] end)
    if not ok or typeof(current) ~= "Color3" then return end
    if force or _arexansIsOldThemeBlue(current) then
        pcall(function() instance[property] = newColor end)
        _arexansRememberAutoTheme(instance, property)
    end
end

function UI._ArexansApplyThemeSweep(root, newColor)
    newColor = newColor or UI.currentThemeColor
    if not root or not newColor then return end
    local _arexansSkipThemeSweep = false
    pcall(function()
        _arexansSkipThemeSweep = UI._ArexansDeveloperSingleGradientOnly == true
            and type(UI._ArexansIsDeveloperGradientRole) == "function"
            and UI._ArexansIsDeveloperGradientRole()
    end)
    if _arexansSkipThemeSweep then return end

    for i = #UI._AutoThemeElements, 1, -1 do
        local el = UI._AutoThemeElements[i]
        if el and el.instance and el.instance.Parent then
            _arexansApplyColorProperty(el.instance, el.property, newColor, true)
        else
            table.remove(UI._AutoThemeElements, i)
        end
    end

    local all = root:GetDescendants()
    table.insert(all, root)

    -- Patch v9: ikon/label role yang warna awalnya ungu/hijau tidak terdeteksi oleh sweep biru lama.
    -- Nama-nama ini dipaksa ikut HSV karena memang bagian identitas role/topbar.
    local roleThemeNameProps = {
        RoleLabel = {"TextColor3"},
        ExpirationLabel = {"TextColor3"},
        ProfilesTitle = {"TextColor3"},
        SaveProfileBtn = {"ImageColor3"},
        LoadProfileBtn = {"ImageColor3"},
        ServerFilterIconButton = {"ImageColor3"},
        ServerRefreshIconButton = {"ImageColor3"},
        MiniToggleButton = {"TextColor3"},
        EmoteToggleButton = {"TextColor3", "BorderColor3", "BackgroundColor3"},
        AnimationShowButton = {"TextColor3", "BackgroundColor3"},
    }

    for _, inst in ipairs(all) do
        local props = roleThemeNameProps[inst.Name]
        if props then
            for _, prop in ipairs(props) do
                _arexansApplyColorProperty(inst, prop, newColor, true)
            end
        end
        if inst:IsA("GuiObject") then
            _arexansApplyColorProperty(inst, "BackgroundColor3", newColor, false)
            _arexansApplyColorProperty(inst, "BorderColor3", newColor, false)
            if inst:IsA("TextButton") or inst:IsA("TextLabel") or inst:IsA("TextBox") then
                _arexansApplyColorProperty(inst, "TextColor3", newColor, false)
            end
            if inst:IsA("ImageButton") or inst:IsA("ImageLabel") then
                _arexansApplyColorProperty(inst, "ImageColor3", newColor, false)
            end
            if inst:IsA("ScrollingFrame") then
                _arexansApplyColorProperty(inst, "ScrollBarImageColor3", newColor, false)
            end
        elseif inst:IsA("UIStroke") then
            _arexansApplyColorProperty(inst, "Color", newColor, false)
        end
    end
end

UI.Icons = {
    -- Navigasi / text icon lama yang tetap aman dipakai sebagai TextButton
    Left = "◀",
    Right = "▶",
    Up = "▲",
    Down = "▼",
    Clown = "111159927879774",
    EmoteVip = "111159927879774",
    Grinning = "11973550076",
    AnimationVip = "11973550076",
    Expressionless = "82033033854562",
    Heart = "♥",
    NoLittering = "NO",
    Mag = "71027265580571",
    Search = "71027265580571",
    Refresh = "86576480880907",
    Skull = "F",
    Cyclone = "T",
    BunnyGirls = "C",
    Gear = "109279812885995",
    Settings = "109279812885995",
    Folder = "DIR",
    Bust = "P",
    Controller = "76490664021809",
    Game = "76490664021809",
    Memo = "N",
    DownArrow = "v",
    Lock = "LOCK",
    Star = "★",
    StarEmpty = "☆",
    Infinity = "∞",

    -- Asset icon baru sesuai daftar request
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

UI.IconText = {
    RedCircle = "●",
    StopSquare = "■",
    PlayButton = "▶",
    Pause = "Ⅱ",
    Wastebasket = "82033033854562",
}

function UI.isAssetIcon(icon)
    local value = tostring(icon or "")
    return value:match("^%d+$") ~= nil or value:match("^rbxassetid://") ~= nil or value:match("^rbxthumb://") ~= nil
end

function UI.toAssetIcon(icon)
    local value = tostring(icon or "")
    if value:match("^rbxassetid://") or value:match("^rbxthumb://") then
        return value
    end
    if value:match("^%d+$") then
        return "rbxassetid://" .. value
    end
    return value
end

function UI.allowsDeveloperIconGradient(instance)
    if not instance then return false end
    local okAllow, allow = pcall(function() return instance:GetAttribute("ArexansAllowDeveloperIconGradient") end)
    if okAllow and allow == true then return true end
    local okAllow2, allow2 = pcall(function() return instance:GetAttribute("ArexansAllowDeveloperGradient") end)
    if okAllow2 and allow2 == true then return true end
    local name = tostring(instance.Name or "")
    return name == "SaveProfileBtn" or name == "LoadProfileBtn" or name == "InfoButton" or name == "InfoBtn"
end

function UI.applyIcon(target, icon, color)
    if not target then return end
    local isAsset = UI.isAssetIcon and UI.isAssetIcon(icon)
    local resolvedColor = color

    if target:IsA("ImageButton") or target:IsA("ImageLabel") then
        if isAsset then
            target.Image = UI.toAssetIcon(icon)
            if resolvedColor then target.ImageColor3 = resolvedColor end
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
            img.ImageColor3 = resolvedColor or target.TextColor3 or Color3.fromRGB(255, 255, 255)
            img.Visible = true
            return
        end

        local img = target:FindFirstChild("ArexansIconImage")
        if img then img.Visible = false end
        target.Text = tostring(icon or "")
        if resolvedColor then target.TextColor3 = resolvedColor end
    end
end
-- Helper to register theme elements
function UI.registerThemeElement(instance, property, original, special_update)
    if not instance or not property then return end
    UI.ThemeableElements = UI.ThemeableElements or {}

    local function applyActiveTheme(targetSpecialUpdate)
        local _arexansSingleDeveloperOnly = false
        pcall(function()
            _arexansSingleDeveloperOnly = UI._ArexansDeveloperSingleGradientOnly == true
                and type(UI._ArexansIsDeveloperGradientRole) == "function"
                and UI._ArexansIsDeveloperGradientRole()
        end)

        local forceThemeActive = false
        pcall(function()
            if type(UI._ArexansForceThemeActive) == "function" then
                forceThemeActive = UI._ArexansForceThemeActive()
            else
                forceThemeActive = UI._ArexansForceThemeActive == true
            end
        end)

        local roleDefaultApplies = false
        pcall(function()
            if type(UI._ArexansIsRoleThemeCustomizable) == "function" then
                roleDefaultApplies = UI._ArexansIsRoleThemeCustomizable()
            end
        end)

        local resolvedColor = nil
        pcall(function()
            if type(UI._ArexansGetResolvedThemeColor) == "function" then
                resolvedColor = UI._ArexansGetResolvedThemeColor()
            end
        end)

        -- v22: VIP/Normal default harus diterapkan saat elemen didaftarkan,
        -- bukan menunggu sweep akhir. Ini menghilangkan flash biru saat awal execute.
        if (UI.isThemeManagerActive or forceThemeActive or roleDefaultApplies) and not _arexansSingleDeveloperOnly then
            local themeColor = (UI.isThemeManagerActive and UI.currentThemeColor) or resolvedColor or UI.currentThemeColor or UI.defaultThemeColor
            if targetSpecialUpdate then
                pcall(targetSpecialUpdate, instance, themeColor)
            else
                pcall(function() instance[property] = themeColor end)
            end
        end
    end

    local function applyDeveloperAccentOnce()
        -- v21: cegah register/sweep ganda pada elemen yang sama agar VIP/Normal default tidak tumpang tindih saat bootstrap.
        pcall(function()
            if instance and UI._ArexansDeveloperSingleGradientOnly ~= true and type(UI._ArexansIsDeveloperGradientRole) == "function" and UI._ArexansIsDeveloperGradientRole() and type(UI._ArexansApplyDeveloperGradient) == "function" then
                instance:SetAttribute("ArexansThemeAccent", true)
                task.defer(function()
                    if instance and instance.Parent then
                        UI._ArexansApplyDeveloperGradient(instance)
                    end
                end)
            end
        end)
    end

    for _, el in ipairs(UI.ThemeableElements) do
        if el.instance == instance and el.property == property then
            if original ~= nil then el.original = original end
            if special_update ~= nil then el.special_update = special_update end
            applyActiveTheme(el.special_update)
            applyDeveloperAccentOnce()
            return
        end
    end

    table.insert(UI.ThemeableElements, {instance = instance, property = property, original = original, special_update = special_update})
    applyActiveTheme(special_update)
    applyDeveloperAccentOnce()
end

function UI.updateTheme(newColor)
    newColor = newColor or UI.currentThemeColor or UI.defaultThemeColor
    local _arexansSingleDeveloperOnly = false
    pcall(function()
        _arexansSingleDeveloperOnly = UI._ArexansDeveloperSingleGradientOnly == true
            and type(UI._ArexansIsDeveloperGradientRole) == "function"
            and UI._ArexansIsDeveloperGradientRole()
    end)
    if _arexansSingleDeveloperOnly then
        UI.currentThemeColor = newColor
        UI._ArexansPendingThemeColor = newColor
        pcall(function()
            if type(UI._ArexansRefreshDeveloperGradientUI) == "function" then
                UI._ArexansRefreshDeveloperGradientUI(CoreGui:FindFirstChild("ArexanstoolsGUI"))
            end
        end)
        return
    end
    local forceThemeActive = false
    pcall(function()
        if type(UI._ArexansForceThemeActive) == "function" then
            forceThemeActive = UI._ArexansForceThemeActive()
        else
            forceThemeActive = UI._ArexansForceThemeActive == true
        end
    end)

    -- Patch v10: saat toggle HSV OFF, slider hanya menyimpan preview/pending color.
    -- UI tidak boleh berubah warna kecuali toggle ON atau ada apply override untuk role default.
    if not UI.isThemeManagerActive and not forceThemeActive then
        UI._ArexansPendingThemeColor = newColor
        return
    end

    UI.currentThemeColor = newColor

    for _, el in ipairs(UI.ThemeableElements) do
        if el.instance and el.instance.Parent then
            if el.special_update then
                pcall(el.special_update, el.instance, newColor)
            else
                pcall(function() el.instance[el.property] = newColor end)
            end
        end
    end

    -- Patch v8: beberapa elemen lama dibuat langsung dengan warna biru tanpa registerThemeElement.
    -- Sweep ini hanya mengganti warna biru UI lama, lalu mengingat elemennya agar HSV berikutnya ikut berubah.
    pcall(function()
        local themeRoots = {
            "ArexanstoolsGUI",
            "ArexansSpectatorGUI",
            "ArexansLocationSpectatorGUI",
            "RecordingFilePickerGUI",
            "ImportPromptGUI",
            "TrimPromptGUI",
        }
        for _, guiName in ipairs(themeRoots) do
            local gui = CoreGui:FindFirstChild(guiName)
            if gui and type(UI._ArexansApplyThemeSweep) == "function" then UI._ArexansApplyThemeSweep(gui, newColor) end
        end
    end)
end

function UI.restoreDefaultTheme()
    for _, el in ipairs(UI.ThemeableElements) do
        if el.instance and el.instance.Parent then
             if el.special_update then
                pcall(el.special_update, el.instance, el.original)
            else
                pcall(function() el.instance[el.property] = el.original end)
            end
        end
    end
end

function UI.RegisterButtonEffect(button)
    if not button then return end
    
    button.AutoButtonColor = false -- Disable default behavior
    
    local originalTransparency = button.BackgroundTransparency

    local uiScale = button:FindFirstChild("ButtonScaleEffect")
    if not uiScale then
        uiScale = Instance.new("UIScale")
        uiScale.Name = "ButtonScaleEffect"
        uiScale.Parent = button
    end
    
    button.MouseButton1Down:Connect(function()
        TweenService:Create(uiScale, TweenInfo.new(0.1), {Scale = 0.95}):Play()
        -- Flash background (make it visible)
        local targetTransparency = math.max(0, originalTransparency - 0.2)
        if originalTransparency >= 0.9 then targetTransparency = 0.4 end
        TweenService:Create(button, TweenInfo.new(0.1), {BackgroundTransparency = targetTransparency}):Play()
    end)
    
    local function restore()
        TweenService:Create(uiScale, TweenInfo.new(0.1), {Scale = 1}):Play()
        -- Restore background transparency
        TweenService:Create(button, TweenInfo.new(0.2), {BackgroundTransparency = originalTransparency}):Play()
    end
    
    button.MouseButton1Up:Connect(restore)
    button.MouseLeave:Connect(restore)
end

function UI.MakeDraggable(guiObject, dragHandle, isDraggableCheck, clickCallback, dragEndCallback)
    local dragInput = nil
    local dragStart = nil
    local startPos = nil
    local wasDragged = false

    dragHandle.InputBegan:Connect(function(input)
        if not (input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch) then return end
        if dragInput then return end

        if isDraggableCheck and not isDraggableCheck() then
            if clickCallback then
                -- Periksa lagi untuk memastikan ini bukan event yang tidak diinginkan
                local timeSinceBegan = tick()
                local endedConn
                endedConn = UserInputService.InputEnded:Connect(function(endInput)
                    if endInput.UserInputType == input.UserInputType then
                        -- [[ FIX: Pastikan input touch adalah object yang sama ]]
                        if endInput.UserInputType == Enum.UserInputType.Touch and endInput ~= input then
                            return
                        end

                        if tick() - timeSinceBegan < 0.2 then -- Hanya panggil jika itu klik cepat
                            clickCallback()
                        end
                        if endedConn then endedConn:Disconnect() end
                    end
                end)
            end
            return
        end
        
        dragInput = input
        dragStart = input.Position
        startPos = guiObject.Position
        wasDragged = false
    end)

    UserInputService.InputChanged:Connect(function(input)
        if dragInput then 
            -- [[ FIX: Logika Touch yang lebih ketat ]]
            local allowUpdate = false
            if input.UserInputType == Enum.UserInputType.MouseMovement then
                allowUpdate = true
            elseif input.UserInputType == Enum.UserInputType.Touch then
                if input == dragInput then
                    allowUpdate = true
                end
            end

            if allowUpdate then
                local newPos = input.Position
                local delta = newPos - dragStart
                guiObject.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
                if not wasDragged and delta.Magnitude > 5 then -- Threshold untuk dianggap sebagai seretan
                    wasDragged = true
                end
            end
        end
    end)

    UserInputService.InputEnded:Connect(function(input)
        if dragInput and input.UserInputType == dragInput.UserInputType then
            -- [[ FIX: Pastikan input touch adalah object yang sama ]]
            if input.UserInputType == Enum.UserInputType.Touch and input ~= dragInput then
                return
            end

            if not wasDragged and clickCallback then
                clickCallback()
            end
            
            if wasDragged and dragEndCallback then
                dragEndCallback()
            end
            
            dragInput = nil
        end
    end)
end

function UI.findScreenGui(obj)
    while obj and not obj:IsA("ScreenGui") do
        obj = obj.Parent
    end
    return obj
end

function UI.createButton(parent, name, callback, isLocked, requiredRole)
    local isAssetId = (UI.isAssetIcon and UI.isAssetIcon(name)) or string.match(tostring(name), "^%d+$") or string.match(tostring(name), "^rbxassetid://")
    local button
    if isAssetId then
        button = Instance.new("ImageButton")
        button.Image = (UI.toAssetIcon and UI.toAssetIcon(name)) or (string.match(tostring(name), "^rbxassetid://") and name or "rbxassetid://" .. name)
        button.ScaleType = Enum.ScaleType.Fit
        local pad = Instance.new("UIPadding", button)
        pad.PaddingTop = UDim.new(0, 4)
        pad.PaddingBottom = UDim.new(0, 4)
        pad.PaddingLeft = UDim.new(0, 4)
        pad.PaddingRight = UDim.new(0, 4)
        button.ImageColor3 = isLocked and Color3.fromRGB(100, 100, 100) or Color3.fromRGB(255, 255, 255)
    else
        button = Instance.new("TextButton")
        button.Text = isLocked and "[LOCK] " .. name or name
        button.TextColor3 = isLocked and Color3.fromRGB(100, 100, 100) or Color3.fromRGB(255, 255, 255) -- Text lebih redup saat locked
        button.TextSize = 12 -- Font diperkecil
        button.Font = Enum.Font.SourceSansBold
    end
    button.Size = UDim2.new(1, 0, 0, 22) -- Ukuran diperkecil lagi
    button.BackgroundColor3 = isLocked and Color3.fromRGB(5, 5, 5) or Color3.fromRGB(0, 50, 150) -- Lebih gelap saat locked
    button.BackgroundTransparency = isLocked and 0.2 or 0.4 -- Lebih solid saat locked agar terlihat "mati"
    if not isLocked then
        UI.registerThemeElement(button, "BackgroundColor3", button.BackgroundColor3)
    end
    button.BorderSizePixel = 0
    
    local buttonUICorner = Instance.new("UICorner", button)
    buttonUICorner.CornerRadius = UDim.new(0, 5)

    button.Parent = parent
    
    button.MouseButton1Click:Connect(function()
        if isLocked then
            local screenGui = UI.findScreenGui(parent) or parent
            UI.showNotification(screenGui, "Upgrade ke " .. (requiredRole or "VIP") .. " untuk membuka!", Color3.fromRGB(255, 100, 0))
            return
        end
        callback()
    end)
    
    if not isLocked then
        UI.RegisterButtonEffect(button)
    end
    return button
end

function UI.createToggle(parent, name, initialState, callback, isLocked, requiredRole)
    local toggleFrame = Instance.new("Frame", parent); toggleFrame.Size = UDim2.new(1, 0, 0, 25); toggleFrame.BackgroundTransparency = 1; local toggleLabel = Instance.new("TextLabel", toggleFrame); toggleLabel.Size = UDim2.new(0.8, -10, 1, 0); toggleLabel.Position = UDim2.new(0, 5, 0, 0); toggleLabel.BackgroundTransparency = 1; toggleLabel.Text = isLocked and "[LOCK] " .. name or name; toggleLabel.TextColor3 = isLocked and Color3.fromRGB(100, 100, 100) or Color3.fromRGB(255, 255, 255); toggleLabel.TextSize = 12; toggleLabel.TextXAlignment = Enum.TextXAlignment.Left; toggleLabel.Font = Enum.Font.SourceSans
    local switch = Instance.new("TextButton", toggleFrame); switch.Name = "Switch"; switch.Size = UDim2.new(0, 40, 0, 20); switch.Position = UDim2.new(1, -50, 0.5, -10); switch.BackgroundColor3 = isLocked and Color3.fromRGB(10, 10, 10) or Color3.fromRGB(50, 50, 50); switch.BorderSizePixel = 0; switch.Text = ""; local switchCorner = Instance.new("UICorner", switch); switchCorner.CornerRadius = UDim.new(1, 0)
    local thumb = Instance.new("Frame", switch); thumb.Name = "Thumb"; thumb.Size = UDim2.new(0, 16, 0, 16); thumb.Position = UDim2.new(0, 2, 0.5, -8); thumb.BackgroundColor3 = Color3.fromRGB(220, 220, 220); thumb.BorderSizePixel = 0; local thumbCorner = Instance.new("UICorner", thumb); thumbCorner.CornerRadius = UDim.new(1, 0)
    local onColor, offColor = Color3.fromRGB(0, 150, 255), Color3.fromRGB(60, 60, 60); local onPosition, offPosition = UDim2.new(1, -18, 0.5, -8), UDim2.new(0, 2, 0.5, -8); local tweenInfo = TweenInfo.new(0.2, Enum.EasingStyle.Quint, Enum.EasingDirection.Out); local isToggled = initialState
    
    if isLocked then
        switch.BackgroundColor3 = Color3.fromRGB(10, 10, 10) -- Sangat gelap
        thumb.BackgroundColor3 = Color3.fromRGB(60, 60, 60) -- Thumb redup
    else
        UI.registerThemeElement(switch, "BackgroundColor3", onColor, function(inst, newColor)
            onColor = newColor -- Keep local onColor updated
            if isToggled then
                inst.BackgroundColor3 = newColor
            else
                inst.BackgroundColor3 = offColor
            end
        end)
    end

    local function updateVisuals(isInstant) 
        if isLocked then return end
        local goalPosition, goalColor = isToggled and onPosition or offPosition, isToggled and onColor or offColor; if isInstant then thumb.Position, switch.BackgroundColor3 = goalPosition, goalColor else TweenService:Create(thumb, tweenInfo, {Position = goalPosition}):Play(); TweenService:Create(switch, tweenInfo, {BackgroundColor3 = goalColor}):Play() end 
    end
    
    local function setState(newState, silent)
        if isLocked then return end
        if isToggled == newState then return end
        isToggled = newState
        updateVisuals(true) 
        if not silent then
            callback(isToggled)
        end
    end

    switch.MouseButton1Click:Connect(function() 
        if isLocked then
            local screenGui = UI.findScreenGui(parent) or parent
            UI.showNotification(screenGui, "Upgrade ke " .. (requiredRole or "VIP") .. " untuk membuka!", Color3.fromRGB(255, 100, 0))
            return
        end
        isToggled = not isToggled; updateVisuals(false); callback(isToggled) 
    end); 
    
    if not isLocked then
        updateVisuals(true)
    end
    return toggleFrame, switch, setState
end

function UI.createSlider(parent, name, min, max, current, suffix, increment, callback, onRelease)
    local sliderFrame = Instance.new("Frame", parent); sliderFrame.Size = UDim2.new(1, 0, 0, 45); sliderFrame.BackgroundTransparency = 1
    local titleLabel = Instance.new("TextLabel", sliderFrame); titleLabel.Size = UDim2.new(1, 0, 0, 20); titleLabel.BackgroundTransparency = 1; titleLabel.TextXAlignment = Enum.TextXAlignment.Left; titleLabel.Text = name .. ": " .. tostring(current) .. " " .. suffix; titleLabel.TextColor3 = Color3.fromRGB(255, 255, 255); titleLabel.TextSize = 12; titleLabel.Font = Enum.Font.SourceSans
    local sliderBase = Instance.new("TextButton", sliderFrame); sliderBase.Name = "SliderBase"; sliderBase.Size = UDim2.new(1, 0, 0, 10); sliderBase.Position = UDim2.new(0, 0, 0, 25); sliderBase.BackgroundColor3 = Color3.fromRGB(60, 60, 60); sliderBase.BorderSizePixel = 0; sliderBase.AutoButtonColor = false; sliderBase.Text = ""; local sbCorner = Instance.new("UICorner", sliderBase); sbCorner.CornerRadius = UDim.new(0, 5)
    local fillWidth = (current - min) / (max - min); local sliderFill = Instance.new("Frame", sliderBase); sliderFill.Name = "SliderFill"; sliderFill.Size = UDim2.new(fillWidth, 0, 1, 0); sliderFill.BackgroundColor3 = Color3.fromRGB(0, 150, 255); sliderFill.BorderSizePixel = 0; local sfCorner = Instance.new("UICorner", sliderFill); sfCorner.CornerRadius = UDim.new(0, 5)
    UI.registerThemeElement(sliderFill, "BackgroundColor3", sliderFill.BackgroundColor3)
    local sliderThumb = Instance.new("Frame", sliderBase); sliderThumb.Name = "SliderThumb"; sliderThumb.Size = UDim2.new(0, 15, 0, 25); sliderThumb.Position = UDim2.new(fillWidth, -7.5, 0.5, -12.5); sliderThumb.BackgroundColor3 = Color3.fromRGB(0, 200, 255); sliderThumb.BorderSizePixel = 0; local stCorner = Instance.new("UICorner", sliderThumb); stCorner.CornerRadius = UDim.new(0, 5); local stStroke = Instance.new("UIStroke", sliderThumb); stStroke.Color = Color3.fromRGB(255, 255, 255); stStroke.Thickness = 1; stStroke.Transparency = 0.8
    UI.registerThemeElement(sliderThumb, "BackgroundColor3", sliderThumb.BackgroundColor3)
    local isDraggingSlider = false; local function updateSlider(input) local pos = input.Position.X - sliderBase.AbsolutePosition.X; local newWidth = math.min(math.max(pos, 0), sliderBase.AbsoluteSize.X); local newValue = min + (newWidth / sliderBase.AbsoluteSize.X) * (max - min); newValue = math.floor(newValue / increment) * increment; local newFillWidth = (newValue - min) / (max - min); sliderFill.Size = UDim2.new(newFillWidth, 0, 1, 0); sliderThumb.Position = UDim2.new(newFillWidth, -7.5, 0.5, -12.5); titleLabel.Text = name .. ": " .. tostring(math.floor(newValue * 10) / 10) .. " " .. suffix; callback(newValue) end
    sliderBase.InputBegan:Connect(function(input, processed) if processed then return end; if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then isDraggingSlider = true; updateSlider(input) end end)
    sliderBase.InputEnded:Connect(function(input) if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then isDraggingSlider = false; if onRelease then onRelease() end end end)
    UserInputService.InputChanged:Connect(function(input) if isDraggingSlider then updateSlider(input) end end)
    return sliderFrame
end

function UI.createTextBox(parent, name, defaultValue, callback, onFocusLost)
    local textBoxFrame = Instance.new("Frame", parent)
    textBoxFrame.Size = UDim2.new(1, 0, 0, 25) -- Adjusted height
    textBoxFrame.BackgroundTransparency = 1

    local layout = Instance.new("UIListLayout", textBoxFrame)
    layout.FillDirection = Enum.FillDirection.Horizontal
    layout.VerticalAlignment = Enum.VerticalAlignment.Center
    layout.Padding = UDim.new(0, 5)

    local titleLabel = Instance.new("TextLabel", textBoxFrame)
    titleLabel.Size = UDim2.new(0.6, -5, 1, 0) -- 60% width, minus padding
    titleLabel.BackgroundTransparency = 1
    titleLabel.TextColor3 = Color3.fromRGB(200, 200, 200)
    titleLabel.TextSize = 12
    titleLabel.TextXAlignment = Enum.TextXAlignment.Left
    titleLabel.Text = name
    titleLabel.Font = Enum.Font.SourceSans

    local textBox = Instance.new("TextBox", textBoxFrame)
    textBox.Size = UDim2.new(0.4, 0, 1, 0) -- 40% width
    textBox.BackgroundTransparency = 1
    textBox.TextColor3 = Color3.fromRGB(220, 220, 220)
    textBox.Text = tostring(defaultValue)
    textBox.Font = Enum.Font.SourceSans
    textBox.TextSize = 12
    textBox.ClearTextOnFocus = false
    local tbCorner = Instance.new("UICorner", textBox)
    tbCorner.CornerRadius = UDim.new(0, 5)
    local tbStroke = Instance.new("UIStroke", textBox)
    tbStroke.Color = Color3.fromRGB(0, 150, 255)
    tbStroke.Thickness = 1
    tbStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    UI.registerThemeElement(tbStroke, "Color", tbStroke.Color)

    textBox.FocusLost:Connect(function(enterPressed)
        local value = tonumber(textBox.Text)
        if value then
            callback(value)
            if onFocusLost then onFocusLost() end
        else
            textBox.Text = tostring(defaultValue)
        end
    end)
    return textBoxFrame
end

function UI.createDropdown(parent, name, options, current, callback)
    local dropdownFrame = Instance.new("Frame", parent); dropdownFrame.Size = UDim2.new(1, 0, 0, 50); dropdownFrame.BackgroundTransparency = 1; local label = Instance.new("TextLabel", dropdownFrame); label.Size = UDim2.new(1, 0, 0, 20); label.BackgroundTransparency = 1; label.TextXAlignment = Enum.TextXAlignment.Left; label.Text = name .. ": " .. current; label.TextColor3 = Color3.fromRGB(255, 255, 255); label.TextSize = 12; label.Font = Enum.Font.SourceSans
    local optionButton = Instance.new("TextButton", dropdownFrame); optionButton.Size = UDim2.new(1, 0, 0, 25); optionButton.Position = UDim2.new(0, 0, 0, 25); optionButton.BackgroundColor3 = Color3.fromRGB(0, 150, 255); optionButton.BorderSizePixel = 0; optionButton.Text = "Ubah Target"; optionButton.TextColor3 = Color3.fromRGB(255, 255, 255); optionButton.TextSize = 12; optionButton.Font = Enum.Font.SourceSans; local btnCorner = Instance.new("UICorner", optionButton); btnCorner.CornerRadius = UDim.new(0, 5)
    UI.registerThemeElement(optionButton, "BackgroundColor3", optionButton.BackgroundColor3)
    local currentIndex = 1; for i,v in pairs(options) do if v == current then currentIndex = i break end end
    optionButton.MouseButton1Click:Connect(function() currentIndex = currentIndex % #options + 1; local newOption = options[currentIndex]; label.Text = name .. ": " .. newOption; callback(newOption) end); return dropdownFrame
end

function UI.createHueSlider(parent, label, initialVal, callback)
    local sliderHeight = 16
    local frame = Instance.new("Frame", parent)
    frame.Size = UDim2.new(1, -10, 0, 30)
    frame.Position = UDim2.new(0, 5, 0, 0)
    frame.BackgroundTransparency = 1
    local textLabel = Instance.new("TextLabel", frame)
    textLabel.Size = UDim2.new(0, 20, 1, 0)
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
    local sliderBar = Instance.new("Frame", frame)
    sliderBar.Size = UDim2.new(1, -65, 0, sliderHeight)
    sliderBar.Position = UDim2.new(0, 25, 0.5, -sliderHeight/2)
    sliderBar.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
    sliderBar.BorderSizePixel = 0
    local barCorner = Instance.new("UICorner", sliderBar); barCorner.CornerRadius = UDim.new(0, 4)
    
    local gradient = Instance.new("UIGradient", sliderBar)
    gradient.Color = ColorSequence.new({
        ColorSequenceKeypoint.new(0, Color3.fromHSV(0, 1, 1)),
        ColorSequenceKeypoint.new(0.167, Color3.fromHSV(0.167, 1, 1)),
        ColorSequenceKeypoint.new(0.333, Color3.fromHSV(0.333, 1, 1)),
        ColorSequenceKeypoint.new(0.5, Color3.fromHSV(0.5, 1, 1)),
        ColorSequenceKeypoint.new(0.667, Color3.fromHSV(0.667, 1, 1)),
        ColorSequenceKeypoint.new(0.833, Color3.fromHSV(0.833, 1, 1)),
        ColorSequenceKeypoint.new(1, Color3.fromHSV(1, 1, 1))
    })

    local thumb = Instance.new("Frame", sliderBar)
    thumb.Size = UDim2.new(0, 8, 0, sliderHeight + 4)
    thumb.AnchorPoint = Vector2.new(0.5, 0.5)
    thumb.Position = UDim2.new(initialVal, 0, 0.5, 0)
    thumb.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
    thumb.BorderSizePixel = 1
    thumb.BorderColor3 = Color3.fromRGB(0, 0, 0)
    local thumbCorner = Instance.new("UICorner", thumb); thumbCorner.CornerRadius = UDim.new(0, 2)
    
    local dragging = false
    local function update(input)
        local pos = math.clamp((input.Position.X - sliderBar.AbsolutePosition.X) / sliderBar.AbsoluteSize.X, 0, 1)
        thumb.Position = UDim2.new(pos, 0, 0.5, 0)
        valueLabel.Text = string.format("%.2f", pos)
        callback(pos)
    end
    
    sliderBar.InputBegan:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            dragging = true
            update(input)
        end
    end)
    UserInputService.InputEnded:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            dragging = false
        end
    end)
    UserInputService.InputChanged:Connect(function(input)
        if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
            update(input)
        end
    end)
    
    return sliderBar
end

function UI.createHSVColorPickerGroup(parent, title, initialColor, colorChangedCallback)
    local groupFrame = Instance.new("Frame", parent)
    groupFrame.Size = UDim2.new(1, 0, 0, 120)
    groupFrame.BackgroundTransparency = 1
    local groupLayout = Instance.new("UIListLayout", groupFrame)
    groupLayout.Padding = UDim.new(0, 0)
    local titleFrame = Instance.new("Frame", groupFrame)
    titleFrame.Size = UDim2.new(1, 0, 0, 30)
    titleFrame.BackgroundTransparency = 1
    local titleLabel = Instance.new("TextLabel", titleFrame)
    titleLabel.Size = UDim2.new(0.7, -5, 1, 0)
    titleLabel.Position = UDim2.new(0, 5, 0, 0)
    titleLabel.BackgroundTransparency = 1
    titleLabel.Text = title
    titleLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
    titleLabel.TextSize = 14
    titleLabel.Font = Enum.Font.SourceSansBold
    titleLabel.TextXAlignment = Enum.TextXAlignment.Left
    local preview = Instance.new("Frame", titleFrame)
    preview.Size = UDim2.new(0, 50, 0, 20)
    preview.Position = UDim2.new(1, -55, 0.5, -10)
    preview.BackgroundColor3 = initialColor
    preview.BorderSizePixel = 1
    preview.BorderColor3 = Color3.fromRGB(150, 150, 150)
    local previewCorner = Instance.new("UICorner", preview)
    previewCorner.CornerRadius = UDim.new(0, 4)
    local initialH, initialS, initialV = initialColor:ToHSV()
    local currentH, currentS, currentV = initialH, initialS, initialV
    local setSGradient, setVGradient
    local function updateColor()
        local newColor = Color3.fromHSV(currentH, currentS, currentV)
        preview.BackgroundColor3 = newColor
        if colorChangedCallback then
            colorChangedCallback(newColor)
        end
    end
    local function updateSaturationGradient()
        if setSGradient then
            local startColor = Color3.fromHSV(currentH, 0, currentV)
            local endColor = Color3.fromHSV(currentH, 1, currentV)
            setSGradient(ColorSequence.new(startColor, endColor))
        end
    end
    local function updateValueGradient()
        if setVGradient then
            local startColor = Color3.fromHSV(currentH, currentS, 0)
            local endColor = Color3.fromHSV(currentH, currentS, 1)
            setVGradient(ColorSequence.new(startColor, endColor))
        end
    end
    UI.createHueSlider(groupFrame, "H", currentH, function(h)
        currentH = h
        updateColor()
        updateSaturationGradient()
        updateValueGradient()
    end)
    local function createDynamicSlider(parent, label, initialVal, callback)
        local slider = UI.createHueSlider(parent, label, initialVal, callback)
        local gradient = slider:FindFirstChild("UIGradient")
        local function setGradient(colorSeq)
            if gradient then gradient.Color = colorSeq end
        end
        return slider, nil, setGradient
    end
    local sFrame, sSetValue, sSetGradient = createDynamicSlider(groupFrame, "S", currentS, function(s)
        currentS = s
        updateColor()
        updateValueGradient()
    end)
    setSGradient = sSetGradient
    local vFrame, vSetValue, vSetGradient = createDynamicSlider(groupFrame, "V", currentV, function(v)
        currentV = v
        updateColor()
        updateSaturationGradient()
    end)
    setVGradient = vSetGradient
    updateSaturationGradient()
    updateValueGradient()
    return groupFrame
end

function UI.createIconButton(parent, iconText, color, size)
    local isAssetId = (UI.isAssetIcon and UI.isAssetIcon(iconText)) or string.match(tostring(iconText), "^%d+$") or string.match(tostring(iconText), "^rbxassetid://")
    
    local btn
    if isAssetId then
        btn = Instance.new("ImageButton", parent)
        btn.Image = (UI.toAssetIcon and UI.toAssetIcon(iconText)) or (string.match(tostring(iconText), "^rbxassetid://") and iconText or "rbxassetid://" .. iconText)
        btn.ImageColor3 = color
        btn.ScaleType = Enum.ScaleType.Fit
        pcall(function() btn:SetAttribute("ArexansNoDeveloperGradient", true) end)
        -- Add padding so the image doesn't touch the edges of the stroke
        local padding = Instance.new("UIPadding", btn)
        padding.PaddingTop = UDim.new(0, 2)
        padding.PaddingBottom = UDim.new(0, 2)
        padding.PaddingLeft = UDim.new(0, 2)
        padding.PaddingRight = UDim.new(0, 2)
    else
        btn = Instance.new("TextButton", parent)
        btn.Font = Enum.Font.SourceSansBold
        btn.Text = iconText
        btn.TextColor3 = color
        btn.TextSize = 12
    end
    
    btn.Size = UDim2.new(0, size, 0, size)
    btn.BackgroundTransparency = 1
    pcall(function() btn:SetAttribute("ArexansNoDeveloperGradient", true) end)
    local corner = Instance.new("UICorner", btn)
    corner.CornerRadius = UDim.new(0, 5)
    local stroke = Instance.new("UIStroke", btn)
    stroke.Color = color
    stroke.Transparency = 0
    stroke.Thickness = 1
    stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    
    local isBlueVariant = (color.B > color.R and color.B > 0.5)
    
    if isBlueVariant then
        UI.registerThemeElement(stroke, "Color", stroke.Color)
        if isAssetId then
            UI.registerThemeElement(btn, "ImageColor3", btn.ImageColor3)
        else
            UI.registerThemeElement(btn, "TextColor3", btn.TextColor3)
        end
    end
    
    UI.RegisterButtonEffect(btn)
    return btn
end

function UI.createGameCard(parent, gameData, isLocked, isPinned, onPinCallback)
    local card = Instance.new("Frame")
    card.Name = "GameCard_" .. gameData.Name
    
    local category = gameData.Category
    
    if not category then
            category = "Game" -- Default
            local lowerName = gameData.Name:lower()
            if lowerName:find("fling") or lowerName:find("bypass") or lowerName:find("keyboard") or lowerName:find("animation") then
                category = "Random"
            end
    end
    card:SetAttribute("Category", category)

    card.Size = UDim2.new(1, -10, 0, 35) -- [UBAH] Ukuran sangat kecil (Compact)
    card.BackgroundColor3 = isLocked and Color3.fromRGB(5, 5, 5) or Color3.fromRGB(30, 30, 30)
    card.BackgroundTransparency = isLocked and 0.2 or 1 -- Transparan tapi solid saat locked
    card.BorderSizePixel = 0
    card.Parent = parent

    local cardCorner = Instance.new("UICorner", card)
    cardCorner.CornerRadius = UDim.new(0, 4) -- [UBAH] Corner lebih kecil

    -- Patch v24: role Developer tidak memakai kotak/border pada kartu info.
    -- Semua kartu judul+deskripsi memakai garis pemisah lurus dengan padding aman.
    local isDeveloperInfoCard = false
    pcall(function()
        isDeveloperInfoCard = type(UI._ArexansIsDeveloperGradientRole) == "function" and UI._ArexansIsDeveloperGradientRole()
    end)

    if isDeveloperInfoCard and not isLocked then
        card.BackgroundTransparency = 1
        local descSeparator = Instance.new("Frame", card)
        descSeparator.Name = "DeveloperDescSeparator"
        descSeparator.Size = UDim2.new(1, -83, 0, 1)
        descSeparator.Position = UDim2.new(0, 8, 0, 18)
        descSeparator.BackgroundColor3 = Color3.fromRGB(0, 150, 255)
        descSeparator.BackgroundTransparency = 0.35
        descSeparator.BorderSizePixel = 0
        descSeparator:SetAttribute("ArexansThemeAccent", true)
        UI.registerThemeElement(descSeparator, "BackgroundColor3", descSeparator.BackgroundColor3)
        pcall(function()
            if type(UI._ArexansApplyDeveloperGradient) == "function" then
                UI._ArexansApplyDeveloperGradient(descSeparator)
            end
        end)
    else
        local cardStroke = Instance.new("UIStroke", card)
        cardStroke.Color = isLocked and Color3.fromRGB(60, 60, 60) or Color3.fromRGB(0, 150, 255)
        cardStroke.Transparency = 0.7
        cardStroke.Thickness = 1
        if not isLocked then
            UI.registerThemeElement(cardStroke, "Color", cardStroke.Color)
        end
    end

    local titleLabel = Instance.new("TextLabel", card)
    titleLabel.Name = "TitleLabel"
    titleLabel.Size = UDim2.new(1, -73, 0, 14) -- [UBAH] Width reduced to fit star button
    titleLabel.Position = UDim2.new(0, 8, 0, 2) -- Patch v24: padding kiri agar tidak menempel garis
    titleLabel.BackgroundTransparency = 1
    titleLabel.Text = gameData.Name
    titleLabel.TextColor3 = isLocked and Color3.fromRGB(100, 100, 100) or Color3.fromRGB(255, 255, 255)
    titleLabel.Font = Enum.Font.SourceSansBold
    titleLabel.TextSize = 11 -- [UBAH] Lebih kecil
    titleLabel.TextXAlignment = Enum.TextXAlignment.Left
    titleLabel.TextTruncate = Enum.TextTruncate.AtEnd

    local descLabel = Instance.new("TextLabel", card)
    descLabel.Name = "DescLabel"
    descLabel.Size = UDim2.new(1, -73, 0, 12) -- [UBAH] Width reduced to fit star button
    descLabel.Position = UDim2.new(0, 8, 0, 21) -- Patch v24: jarak aman dari separator
    descLabel.BackgroundTransparency = 1
    descLabel.Text = gameData.Description or ""
    descLabel.TextColor3 = Color3.fromRGB(180, 180, 180) -- [UBAH] Lebih redup
    descLabel.Font = Enum.Font.SourceSans
    descLabel.TextSize = 9 -- [UBAH] Sangat kecil
    descLabel.TextWrapped = false -- [UBAH] Single line
    descLabel.TextTruncate = Enum.TextTruncate.AtEnd
    descLabel.TextXAlignment = Enum.TextXAlignment.Left
    descLabel.TextYAlignment = Enum.TextYAlignment.Top

    local buttonsContainer = Instance.new("Frame", card)
    buttonsContainer.Size = UDim2.new(0, 55, 1, 0)
    buttonsContainer.Position = UDim2.new(1, -55, 0, 0)
    buttonsContainer.BackgroundTransparency = 1
    
    local btnLayout = Instance.new("UIListLayout", buttonsContainer)
    btnLayout.FillDirection = Enum.FillDirection.Horizontal
    btnLayout.HorizontalAlignment = Enum.HorizontalAlignment.Right
    btnLayout.VerticalAlignment = Enum.VerticalAlignment.Center
    btnLayout.Padding = UDim.new(0, 3)
    btnLayout.SortOrder = Enum.SortOrder.LayoutOrder
    
    local btnPadding = Instance.new("UIPadding", buttonsContainer)
    btnPadding.PaddingRight = UDim.new(0, 5)

    -- Pin Button (Star)
    local pinButton = Instance.new("TextButton", buttonsContainer)
    pinButton.Name = "PinButton"
    pinButton.Size = UDim2.new(0, 20, 0, 20)
    pinButton.LayoutOrder = 1
    pinButton.BackgroundTransparency = 1
    pinButton.BackgroundColor3 = Color3.fromRGB(40, 40, 40)
    pinButton.Text = isPinned and "★" or "☆"
    pinButton.TextColor3 = isPinned and Color3.fromRGB(255, 200, 50) or Color3.fromRGB(150, 150, 150)
    pinButton.Font = Enum.Font.SourceSansBold
    pinButton.TextSize = 16
    
    local pinCorner = Instance.new("UICorner", pinButton)
    pinCorner.CornerRadius = UDim.new(0, 4)
    
    pinButton.MouseButton1Click:Connect(function()
        if onPinCallback then
            onPinCallback(gameData)
        end
    end)
    UI.RegisterButtonEffect(pinButton)

    local executeButton = Instance.new("TextButton", buttonsContainer)
    executeButton.Name = "ExecuteButton"
    executeButton.Size = UDim2.new(0, 24, 0, 24) -- [UBAH] Kecil elegan
    executeButton.LayoutOrder = 2
    executeButton.BackgroundTransparency = isLocked and 0.5 or 1 -- Transparan
    executeButton.BackgroundColor3 = isLocked and Color3.fromRGB(20, 20, 20) or Color3.fromRGB(0, 150, 255)
    executeButton.Text = isLocked and "LOCK" or ">" -- [UBAH] Icon play kecil
    executeButton.TextColor3 = isLocked and Color3.fromRGB(150, 50, 50) or Color3.fromRGB(0, 150, 255)
    executeButton.Font = Enum.Font.SourceSansBold
    executeButton.TextSize = 12 -- [UBAH] Kecil
    if not isLocked then
        UI.registerThemeElement(executeButton, "TextColor3", executeButton.TextColor3)
    end
    
    local btnStroke = Instance.new("UIStroke", executeButton)
    btnStroke.Color = isLocked and Color3.fromRGB(100, 100, 100) or Color3.fromRGB(0, 150, 255)
    btnStroke.Thickness = 1
    btnStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    if not isLocked then
        UI.registerThemeElement(btnStroke, "Color", btnStroke.Color)
    end

    local btnCorner = Instance.new("UICorner", executeButton)
    btnCorner.CornerRadius = UDim.new(0, 4)

    executeButton.MouseButton1Click:Connect(function()
        if isLocked then
            local screenGui = UI.findScreenGui(parent) or parent
            UI.showNotification(screenGui, "Upgrade ke " .. (gameData.Role or "VIP") .. " untuk membuka!", Color3.fromRGB(255, 100, 0))
            return
        end
        if gameData.Script then
            task.spawn(gameData.Script)
        else
            warn("No script associated with " .. gameData.Name)
        end
    end)
    if not isLocked then
        UI.RegisterButtonEffect(executeButton)
    end

    return card
end

function UI.createTabButton(parent, name, callback)
    local button = Instance.new("TextButton")
    button.Size = UDim2.new(1, -8, 0, 27)
    button.BackgroundColor3 = Color3.fromRGB(35, 35, 55)
    button.BackgroundTransparency = 0.78 -- Style pill/filter button seperti tab Script
    button.BorderSizePixel = 0
    button.AutoButtonColor = false
    button.Text = name
    button.TextColor3 = Color3.fromRGB(200, 200, 200)
    button.TextSize = 11
    button.TextTruncate = Enum.TextTruncate.AtEnd
    button.Font = Enum.Font.SourceSansBold
    pcall(function() button:SetAttribute("ArexansNoDeveloperGradient", true) end)
    button.Parent = parent
    
    local btnCorner = Instance.new("UICorner", button)
    btnCorner.CornerRadius = UDim.new(0, 7)
    
    local btnStroke = Instance.new("UIStroke", button)
    btnStroke.Name = "TabButtonStroke"
    btnStroke.Color = Color3.fromRGB(100, 100, 100)
    btnStroke.Thickness = 1
    btnStroke.Transparency = 0.45
    btnStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    btnStroke:SetAttribute("ArexansActiveTab", false)
    
    button.MouseButton1Click:Connect(callback)
    
    -- Custom Tab Button Effect
    local uiScale = Instance.new("UIScale")
    uiScale.Name = "ButtonScaleEffect"
    uiScale.Parent = button
    
    button.MouseButton1Down:Connect(function()
        TweenService:Create(uiScale, TweenInfo.new(0.1), {Scale = 0.95}):Play()
        TweenService:Create(button, TweenInfo.new(0.1), {BackgroundTransparency = 0.35}):Play()
    end)
    
    local function restore()
        TweenService:Create(uiScale, TweenInfo.new(0.1), {Scale = 1}):Play()
        local isActive = false
        pcall(function() isActive = button:GetAttribute("ArexansActiveTab") == true end)
        TweenService:Create(button, TweenInfo.new(0.15), {BackgroundTransparency = isActive and 0.28 or 0.78}):Play()
        TweenService:Create(btnStroke, TweenInfo.new(0.15), {Transparency = isActive and 0.12 or 0.45}):Play()
    end
    
    button.MouseButton1Up:Connect(restore)
    button.MouseLeave:Connect(restore)
    
    return button
end

function UI.renderGameList(container, games, pinnedScripts, permissionCheckFunc, pinCallback)
    if not container then return end
    
    -- Sort the games
    table.sort(games, function(a, b)
        local aPinned = pinnedScripts[a.Name] or false
        local bPinned = pinnedScripts[b.Name] or false
        
        -- Priority 1: Pinned first
        if aPinned ~= bPinned then
            return aPinned
        end
        
        local aLocked = false
        local bLocked = false
        
        if permissionCheckFunc then
            if a.Role then aLocked = not permissionCheckFunc(a.Role) end
            if b.Role then bLocked = not permissionCheckFunc(b.Role) end
        end
        
        -- Priority 2: Unlocked first (Locked is last)
        if aLocked ~= bLocked then
            return not aLocked
        end
        
        -- Priority 3: Alphabetical
        return (a.Name or "") < (b.Name or "")
    end)
    
    -- Clear container except layout and padding
    for _, child in ipairs(container:GetChildren()) do
        if not (child:IsA("UIListLayout") or child:IsA("UIPadding")) then
            child:Destroy()
        end
    end
    
    for i, gameData in ipairs(games) do
        local isLocked = false
        if gameData.Role and permissionCheckFunc then
            isLocked = not permissionCheckFunc(gameData.Role)
        end
        
        local isPinned = pinnedScripts[gameData.Name] or false
        
        local card = UI.createGameCard(container, gameData, isLocked, isPinned, pinCallback)
        card.LayoutOrder = i
    end
    
    -- Update CanvasSize
    local layout = container:FindFirstChildOfClass("UIListLayout")
    if layout then
        container.CanvasSize = UDim2.new(0, 0, 0, layout.AbsoluteContentSize.Y)
    end
end

function UI.promptInput(message)
    local input = ""
    local done = false
    local coreGuiParent = game:GetService("CoreGui")
    if coreGuiParent:FindFirstChild("PromptInputGui") then
        coreGuiParent:FindFirstChild("PromptInputGui"):Destroy()
    end
    local ScreenGui = Instance.new("ScreenGui")
    ScreenGui.Name = "PromptInputGui"
    ScreenGui.Parent = coreGuiParent
    ScreenGui.DisplayOrder = 20
    ScreenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

    local Frame = Instance.new("Frame", ScreenGui)
    Frame.Size = UDim2.new(0, 220, 0, 100)
    Frame.Position = UDim2.new(0.5, -110, 0.5, -50)
    Frame.BackgroundColor3 = Color3.fromRGB(20, 20, 40)
    Frame.BackgroundTransparency = 0.3
    Frame.BorderSizePixel = 0
    
    local corner = Instance.new("UICorner", Frame)
    corner.CornerRadius = UDim.new(0, 8)
    local stroke = Instance.new("UIStroke", Frame)
    stroke.Name = "RecordingPickerStroke"
    stroke.Color = ((UI._ArexansGetResolvedThemeColor and UI._ArexansGetResolvedThemeColor()) or (UI.isThemeManagerActive and UI.currentThemeColor) or Color3.fromRGB(0, 150, 255))
    stroke.Thickness = 1.5
    stroke.Transparency = 0.5
    UI.registerThemeElement(stroke, "Color", stroke.Color)

    local TitleLabel = Instance.new("TextLabel", Frame)
    TitleLabel.Size = UDim2.new(1, -30, 0, 20)
    TitleLabel.Position = UDim2.new(0, 10, 0, 5)
    TitleLabel.Text = message
    TitleLabel.TextColor3 = Color3.new(1,1,1)
    TitleLabel.BackgroundTransparency = 1
    TitleLabel.Font = Enum.Font.SourceSansBold
    TitleLabel.TextXAlignment = Enum.TextXAlignment.Left

    local CloseButton = Instance.new("TextButton", Frame)
    CloseButton.Name = "CloseButton"
    CloseButton.Size = UDim2.new(0, 20, 0, 20)
    CloseButton.Position = UDim2.new(1, -25, 0, 5)
    CloseButton.BackgroundTransparency = 1
    CloseButton.Font = Enum.Font.SourceSansBold
    CloseButton.Text = ""
    CloseButton.TextColor3 = Color3.fromRGB(255, 255, 255)
    CloseButton.TextSize = 18
    pcall(function() CloseButton:SetAttribute("ArexansNoDeveloperGradient", true) end)
    if UI.applyIcon then UI.applyIcon(CloseButton, UI.Icons.DeleteRecord or UI.Icons.Wastebasket, Color3.fromRGB(255, 255, 255)) end
    CloseButton.MouseButton1Click:Connect(function()
        input = "" -- Return empty string on cancel
        done = true
        if ScreenGui and ScreenGui.Parent then ScreenGui:Destroy() end
    end)

    local TextBox = Instance.new("TextBox", Frame)
    TextBox.Size = UDim2.new(1, -20, 0, 25)
    TextBox.Position = UDim2.new(0, 10, 0, 30)
    TextBox.Text = ""
    TextBox.PlaceholderText = "Nama file..."
    TextBox.BackgroundTransparency = 1
    TextBox.TextColor3 = Color3.new(1,1,1)
    
    local tbStroke = Instance.new("UIStroke", TextBox)
    tbStroke.Color = ((UI._ArexansGetResolvedThemeColor and UI._ArexansGetResolvedThemeColor()) or (UI.isThemeManagerActive and UI.currentThemeColor) or Color3.fromRGB(0, 150, 255))
    tbStroke.Thickness = 1
    tbStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    
    local tbCorner = Instance.new("UICorner", TextBox)
    tbCorner.CornerRadius = UDim.new(0, 5)

    local Button = Instance.new("TextButton", Frame)
    Button.Size = UDim2.new(1, -20, 0, 25)
    Button.Position = UDim2.new(0, 10, 1, -30)
    Button.Text = "OK"
    Button.BackgroundColor3 = ((UI._ArexansGetResolvedThemeColor and UI._ArexansGetResolvedThemeColor()) or (UI.isThemeManagerActive and UI.currentThemeColor) or Color3.fromRGB(0, 150, 255))
    Button.TextColor3 = Color3.new(1,1,1)
    Button.Font = Enum.Font.SourceSansBold
    local btnCorner = Instance.new("UICorner", Button)
    btnCorner.CornerRadius = UDim.new(0, 6)

    Button.MouseButton1Click:Connect(function()
        input = TextBox.Text
        done = true
        if ScreenGui and ScreenGui.Parent then ScreenGui:Destroy() end
    end)
    repeat task.wait() until done
    return input
end

function UI.showConfirmationPrompt(message, callback)
    local coreGuiParent = game:GetService("CoreGui")
    if coreGuiParent:FindFirstChild("ConfirmationPromptGUI") then
        coreGuiParent:FindFirstChild("ConfirmationPromptGUI"):Destroy()
    end

    local ScreenGui = Instance.new("ScreenGui")
    ScreenGui.Name = "ConfirmationPromptGUI"
    ScreenGui.Parent = coreGuiParent
    ScreenGui.DisplayOrder = 22 -- Higher than other prompts
    ScreenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

    local Frame = Instance.new("Frame", ScreenGui)
    Frame.Size = UDim2.new(0, 220, 0, 100)
    Frame.Position = UDim2.new(0.5, -110, 0.5, -50)
    Frame.BackgroundColor3 = Color3.fromRGB(25, 25, 45)
    Frame.BackgroundTransparency = 0.2
    Frame.BorderSizePixel = 0
    
    local corner = Instance.new("UICorner", Frame); corner.CornerRadius = UDim.new(0, 8)
    local stroke = Instance.new("UIStroke", Frame); stroke.Color = Color3.fromRGB(200, 100, 100); stroke.Thickness = 1.5; stroke.Transparency = 0.5

    local TitleLabel = Instance.new("TextLabel", Frame)
    TitleLabel.Size = UDim2.new(1, -20, 0, 50)
    TitleLabel.Position = UDim2.new(0, 10, 0, 5)
    TitleLabel.Text = message
    TitleLabel.TextColor3 = Color3.new(1,1,1)
    TitleLabel.BackgroundTransparency = 1
    TitleLabel.Font = Enum.Font.SourceSans
    TitleLabel.TextWrapped = true
    TitleLabel.TextSize = 14
    TitleLabel.TextYAlignment = Enum.TextYAlignment.Center

    local function createButton(parent, text, color)
        local btn = Instance.new("TextButton", parent)
        btn.Size = UDim2.new(0.5, -15, 0, 25)
        btn.BackgroundColor3 = color
        btn.TextColor3 = Color3.new(1,1,1)
        btn.Font = Enum.Font.SourceSansBold
        btn.Text = text
        btn.TextSize = 14
        local btnCorner = Instance.new("UICorner", btn); btnCorner.CornerRadius = UDim.new(0, 6)
        return btn
    end

    local yesButton = createButton(Frame, "Ya", Color3.fromRGB(200, 50, 50))
    yesButton.Position = UDim2.new(0, 10, 1, -35)

    local noButton = createButton(Frame, "Tidak", Color3.fromRGB(80, 80, 80))
    noButton.Position = UDim2.new(0.5, 5, 1, -35)

    yesButton.MouseButton1Click:Connect(function()
        if ScreenGui and ScreenGui.Parent then ScreenGui:Destroy() end
        callback(true)
    end)
    noButton.MouseButton1Click:Connect(function()
        if ScreenGui and ScreenGui.Parent then ScreenGui:Destroy() end
        callback(false)
    end)
end

function UI.showRecordingFilePicker(RECORDING_FOLDER, callback, options)
    options = (type(options) == "table") and options or {}
    local hasWebPicker = type(options.getWebRecordings) == "function" and type(options.onWebFileSelected) == "function"
    local RECORDING_PICKER_ICON_ASSETS = {
        Rename = (UI.toAssetIcon and UI.toAssetIcon(UI.Icons.Edit or UI.Icons.Pencil)) or "rbxassetid://88134306391339",
        Refresh = "rbxassetid://86576480880907",
        Delete = "rbxassetid://82033033854562",
        Visit = "rbxassetid://92978977020493",
    }

    local coreGuiParent = game:GetService("CoreGui")
    if coreGuiParent:FindFirstChild("RecordingFilePickerGUI") then
        coreGuiParent:FindFirstChild("RecordingFilePickerGUI"):Destroy()
    end

    local function getPickerThemeColor()
        local ok, resolved = pcall(function()
            if type(UI._ArexansGetResolvedThemeColor) == "function" then
                return UI._ArexansGetResolvedThemeColor()
            end
        end)
        if ok and typeof(resolved) == "Color3" then return resolved end
        if UI.isThemeManagerActive and typeof(UI.currentThemeColor) == "Color3" then return UI.currentThemeColor end
        if typeof(UI.currentThemeColor) == "Color3" then return UI.currentThemeColor end
        return Color3.fromRGB(0, 150, 255)
    end

    local function registerPickerTheme(instance, property, specialUpdate)
        if UI.registerThemeElement then
            UI.registerThemeElement(instance, property, getPickerThemeColor(), specialUpdate)
        end
    end

    local function makeRecordingPickerIcon(parent, assetId, iconName, size, position, anchorPoint)
        local icon = Instance.new("ImageLabel", parent)
        icon.Name = iconName or "RecordingPickerIcon"
        icon.Size = size or UDim2.new(0, 15, 0, 15)
        icon.Position = position or UDim2.new(0.5, 0, 0.5, 0)
        icon.AnchorPoint = anchorPoint or Vector2.new(0.5, 0.5)
        icon.BackgroundTransparency = 1
        pcall(function() icon:SetAttribute("ArexansNoDeveloperGradient", true) end)
        icon.Image = (UI.toAssetIcon and UI.toAssetIcon(assetId)) or tostring(assetId or "")
        icon.ImageColor3 = Color3.fromRGB(255, 255, 255)
        icon.ImageTransparency = 0
        icon.ScaleType = Enum.ScaleType.Fit
        icon.ZIndex = (parent and parent.ZIndex or 1) + 1
        return icon
    end

    local ScreenGui = Instance.new("ScreenGui")
    ScreenGui.Name = "RecordingFilePickerGUI"
    ScreenGui.Parent = coreGuiParent
    ScreenGui.DisplayOrder = 21
    ScreenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    pcall(function() ScreenGui.ResetOnSpawn = false end)

    local Frame = Instance.new("Frame", ScreenGui)
    Frame.Size = UDim2.new(0, 390, 0, 410)
    Frame.Position = UDim2.new(0.5, -195, 0.5, -205)
    Frame.BackgroundColor3 = Color3.fromRGB(20, 20, 40)
    Frame.BackgroundTransparency = 0.25
    Frame.BorderSizePixel = 0

    local corner = Instance.new("UICorner", Frame)
    corner.CornerRadius = UDim.new(0, 8)

    local stroke = Instance.new("UIStroke", Frame)
    stroke.Name = "RecordingPickerThemeStroke"
    stroke.Color = getPickerThemeColor()
    stroke.Thickness = 1.5
    stroke.Transparency = 0.35
    registerPickerTheme(stroke, "Color")

    local TitleLabel = Instance.new("TextLabel", Frame)
    TitleLabel.Size = UDim2.new(1, -40, 0, 25)
    TitleLabel.Position = UDim2.new(0, 10, 0, 5)
    TitleLabel.Text = "Import Rekaman"
    TitleLabel.TextColor3 = Color3.new(1, 1, 1)
    TitleLabel.BackgroundTransparency = 1
    TitleLabel.Font = Enum.Font.SourceSansBold
    TitleLabel.TextSize = 16
    TitleLabel.TextXAlignment = Enum.TextXAlignment.Left
    TitleLabel.Active = true
    Frame.Active = true

    local CloseButton = Instance.new("TextButton", Frame)
    CloseButton.Name = "CloseButton"
    CloseButton.Size = UDim2.new(0, 24, 0, 24)
    CloseButton.Position = UDim2.new(1, -30, 0, 5)
    CloseButton.BackgroundTransparency = 1
    CloseButton.Font = Enum.Font.SourceSansBold
    CloseButton.Text = ""
    CloseButton.TextColor3 = Color3.fromRGB(255, 255, 255)
    CloseButton.TextSize = 18
    pcall(function() CloseButton:SetAttribute("ArexansNoDeveloperGradient", true) end)
    if UI.applyIcon then UI.applyIcon(CloseButton, UI.Icons.DeleteRecord or UI.Icons.Wastebasket, Color3.fromRGB(255, 255, 255)) end
    CloseButton.MouseButton1Click:Connect(function()
        if ScreenGui and ScreenGui.Parent then ScreenGui:Destroy() end
    end)

    if UI.MakeDraggable then
        pcall(function() UI.MakeDraggable(Frame, TitleLabel) end)
    end

    local TabBar = Instance.new("Frame", Frame)
    TabBar.Name = "RecordingPickerTabs"
    TabBar.Size = UDim2.new(1, -20, 0, 28)
    TabBar.Position = UDim2.new(0, 10, 0, 36)
    TabBar.BackgroundTransparency = 1

    local tabLayout = Instance.new("UIListLayout", TabBar)
    tabLayout.FillDirection = Enum.FillDirection.Horizontal
    tabLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
    tabLayout.VerticalAlignment = Enum.VerticalAlignment.Center
    tabLayout.Padding = UDim.new(0, 6)
    tabLayout.SortOrder = Enum.SortOrder.LayoutOrder

    local currentScope = "mine"
    local thisPlaceOnly = true
    local tabButtons = {}

    local function isDeveloperPickerRole()
        if type(options.isDeveloperRole) == "function" then
            local ok, result = pcall(options.isDeveloperRole)
            if ok and result == true then return true end
        elseif options.isDeveloperRole == true then
            return true
        end
        if type(options.currentUserRole) == "string" then
            local __r = tostring(options.currentUserRole):upper()
            if __r == "DEVELOPER" or __r == "LIFETIME" then return true end
        end
        local okUiRole, uiRole = pcall(function()
            return type(UI._ArexansIsDeveloperGradientRole) == "function" and UI._ArexansIsDeveloperGradientRole()
        end)
        return okUiRole and uiRole == true
    end

    local function isMyFilesScope(scope)
        scope = tostring(scope or ""):lower()
        return scope == "mine" or scope == "myfiles" or scope == "my_files" or scope == "my files"
    end

    local function styleTab(tab, active)
        if not tab then return end
        tab:SetAttribute("RecordingPickerActive", active == true)
        tab.BackgroundTransparency = active and 0.28 or 0.78
        tab.BackgroundColor3 = active and getPickerThemeColor() or Color3.fromRGB(35, 35, 55)
        tab.TextColor3 = active and getPickerThemeColor() or Color3.fromRGB(200, 200, 200)
        local stroke = tab:FindFirstChild("RecordingPickerTabStroke") or tab:FindFirstChildOfClass("UIStroke")
        if stroke then
            stroke.Color = active and getPickerThemeColor() or Color3.fromRGB(100, 100, 100)
            stroke.Transparency = active and 0.12 or 0.45
        end
    end

    local function createTabButton(label, scope, order)
        local btn = Instance.new("TextButton", TabBar)
        btn.Name = "RecordingPickerTab_" .. tostring(scope)
        btn.Size = UDim2.new(0, 112, 1, 0)
        btn.LayoutOrder = order
        btn.BackgroundColor3 = Color3.fromRGB(35, 35, 55)
        btn.BackgroundTransparency = 0.78
        btn.BorderSizePixel = 0
        btn.AutoButtonColor = false
        btn.Text = label
        btn.TextColor3 = Color3.fromRGB(200, 200, 200)
        btn.Font = Enum.Font.SourceSansBold
        btn.TextSize = 13
    pcall(function() btn:SetAttribute("ArexansNoDeveloperGradient", true) end)
        local btnCorner = Instance.new("UICorner", btn)
        btnCorner.CornerRadius = UDim.new(0, 6)
        local btnStroke = Instance.new("UIStroke", btn)
        btnStroke.Name = "RecordingPickerTabStroke"
        btnStroke.Color = Color3.fromRGB(100, 100, 100)
        btnStroke.Thickness = 1
        btnStroke.Transparency = 0.45
        registerPickerTheme(btnStroke, "Color", function(inst, newColor)
            local parent = inst.Parent
            inst.Color = (parent and parent:GetAttribute("RecordingPickerActive")) and newColor or Color3.fromRGB(100, 100, 100)
        end)
        registerPickerTheme(btn, "BackgroundColor3", function(inst, newColor)
            if inst:GetAttribute("RecordingPickerActive") then
                inst.BackgroundColor3 = newColor
            end
        end)
        tabButtons[scope] = btn
        return btn
    end

    createTabButton("My Files", "mine", 1)
    createTabButton("Public", "public", 2)
    createTabButton("All", "all", 3)

    local FilterRow = Instance.new("Frame", Frame)
    FilterRow.Name = "RecordingPickerFilterRow"
    FilterRow.Size = UDim2.new(1, -20, 0, 26)
    FilterRow.Position = UDim2.new(0, 10, 0, 70)
    FilterRow.BackgroundTransparency = 1

    local filterLayout = Instance.new("UIListLayout", FilterRow)
    filterLayout.FillDirection = Enum.FillDirection.Horizontal
    filterLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
    filterLayout.VerticalAlignment = Enum.VerticalAlignment.Center
    filterLayout.Padding = UDim.new(0, 6)
    filterLayout.SortOrder = Enum.SortOrder.LayoutOrder

    local ThisPlaceButton = Instance.new("TextButton", FilterRow)
    ThisPlaceButton.Name = "RecordingThisPlaceFilterButton"
    ThisPlaceButton.Size = UDim2.new(0, 230, 1, 0)
    ThisPlaceButton.LayoutOrder = 1
    ThisPlaceButton.BackgroundColor3 = getPickerThemeColor()
    ThisPlaceButton.BackgroundTransparency = 0.15
    ThisPlaceButton.BorderSizePixel = 0
    ThisPlaceButton.AutoButtonColor = false
    ThisPlaceButton.Font = Enum.Font.SourceSansBold
    ThisPlaceButton.TextColor3 = Color3.fromRGB(255, 255, 255)
    ThisPlaceButton.TextSize = 12
    local thisPlaceCorner = Instance.new("UICorner", ThisPlaceButton)
    thisPlaceCorner.CornerRadius = UDim.new(0, 6)
    local thisPlaceStroke = Instance.new("UIStroke", ThisPlaceButton)
    thisPlaceStroke.Name = "RecordingThisPlaceStroke"
    thisPlaceStroke.Color = getPickerThemeColor()
    thisPlaceStroke.Thickness = 1
    thisPlaceStroke.Transparency = 0.35
    registerPickerTheme(thisPlaceStroke, "Color")
    registerPickerTheme(ThisPlaceButton, "BackgroundColor3", function(inst, newColor)
        if thisPlaceOnly then inst.BackgroundColor3 = newColor end
    end)

    local RefreshButton = Instance.new("TextButton", FilterRow)
    RefreshButton.Name = "RecordingPickerRefreshButton"
    RefreshButton.Size = UDim2.new(0, 104, 1, 0)
    RefreshButton.LayoutOrder = 2
    RefreshButton.BackgroundColor3 = getPickerThemeColor()
    RefreshButton.BackgroundTransparency = 0.35
    RefreshButton.BorderSizePixel = 0
    RefreshButton.AutoButtonColor = false
    RefreshButton.Text = ""
    RefreshButton.TextColor3 = Color3.fromRGB(255, 255, 255)
    RefreshButton.Font = Enum.Font.SourceSansBold
    RefreshButton.TextSize = 12
    registerPickerTheme(RefreshButton, "BackgroundColor3")
    local refreshCorner = Instance.new("UICorner", RefreshButton)
    refreshCorner.CornerRadius = UDim.new(0, 6)
    local refreshStroke = Instance.new("UIStroke", RefreshButton)
    refreshStroke.Name = "RecordingPickerRefreshStroke"
    refreshStroke.Color = getPickerThemeColor()
    refreshStroke.Thickness = 1
    refreshStroke.Transparency = 0.45
    registerPickerTheme(refreshStroke, "Color")
    local RefreshIcon = makeRecordingPickerIcon(
        RefreshButton,
        RECORDING_PICKER_ICON_ASSETS.Refresh,
        "RecordingPickerRefreshIcon",
        UDim2.new(0, 15, 0, 15),
        UDim2.new(0, 13, 0.5, 0),
        Vector2.new(0, 0.5)
    )
    local RefreshTextLabel = Instance.new("TextLabel", RefreshButton)
    RefreshTextLabel.Name = "RecordingPickerRefreshText"
    RefreshTextLabel.Size = UDim2.new(1, -32, 1, 0)
    RefreshTextLabel.Position = UDim2.new(0, 29, 0, 0)
    RefreshTextLabel.BackgroundTransparency = 1
    RefreshTextLabel.Text = "Refresh"
    RefreshTextLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
    RefreshTextLabel.Font = Enum.Font.SourceSansBold
    RefreshTextLabel.TextSize = 12
    RefreshTextLabel.TextXAlignment = Enum.TextXAlignment.Left
    RefreshTextLabel.TextYAlignment = Enum.TextYAlignment.Center
    RefreshTextLabel.ZIndex = RefreshButton.ZIndex + 1
    if UI.RegisterButtonEffect then pcall(function() UI.RegisterButtonEffect(RefreshButton) end) end

    local SearchBox = Instance.new("TextBox", Frame)
    SearchBox.Name = "RecordingPickerSearchBox"
    SearchBox.Size = UDim2.new(1, -20, 0, 28)
    SearchBox.Position = UDim2.new(0, 10, 0, 103)
    SearchBox.PlaceholderText = "Cari file/rekaman..."
    SearchBox.Text = ""
    SearchBox.BackgroundColor3 = Color3.fromRGB(20, 20, 35)
    SearchBox.BackgroundTransparency = 0.25
    SearchBox.TextColor3 = Color3.new(1, 1, 1)
    SearchBox.PlaceholderColor3 = Color3.fromRGB(180, 180, 180)
    SearchBox.ClearTextOnFocus = false
    SearchBox.Font = Enum.Font.SourceSans
    SearchBox.TextSize = 13
    SearchBox.TextXAlignment = Enum.TextXAlignment.Left
    local searchPadding = Instance.new("UIPadding", SearchBox)
    searchPadding.PaddingLeft = UDim.new(0, 8)
    searchPadding.PaddingRight = UDim.new(0, 8)
    local sbStroke = Instance.new("UIStroke", SearchBox)
    sbStroke.Name = "RecordingSearchStroke"
    sbStroke.Color = getPickerThemeColor()
    sbStroke.Thickness = 1
    sbStroke.Transparency = 0.3
    sbStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    registerPickerTheme(sbStroke, "Color")
    local sbCorner = Instance.new("UICorner", SearchBox)
    sbCorner.CornerRadius = UDim.new(0, 6)

    local RefreshStatusLabel = Instance.new("TextLabel", Frame)
    RefreshStatusLabel.Name = "RecordingPickerRefreshStatus"
    RefreshStatusLabel.Size = UDim2.new(1, -20, 0, 18)
    RefreshStatusLabel.Position = UDim2.new(0, 10, 0, 133)
    RefreshStatusLabel.BackgroundTransparency = 1
    RefreshStatusLabel.Text = "Siap • Refresh untuk memuat ulang"
    RefreshStatusLabel.TextColor3 = Color3.fromRGB(190, 190, 190)
    RefreshStatusLabel.Font = Enum.Font.SourceSansItalic
    RefreshStatusLabel.TextSize = 11
    RefreshStatusLabel.TextXAlignment = Enum.TextXAlignment.Left

    local FileListContainer = Instance.new("ScrollingFrame", Frame)
    FileListContainer.Name = "RecordingPickerFileList"
    FileListContainer.Size = UDim2.new(1, -20, 1, -164)
    FileListContainer.Position = UDim2.new(0, 10, 0, 154)
    FileListContainer.BackgroundColor3 = Color3.fromRGB(35, 35, 55)
    FileListContainer.BackgroundTransparency = 0.35
    FileListContainer.BorderSizePixel = 0
    FileListContainer.ScrollBarThickness = 6
    FileListContainer.ScrollBarImageColor3 = getPickerThemeColor()
    FileListContainer.CanvasSize = UDim2.new(0, 0, 0, 0)
    registerPickerTheme(FileListContainer, "ScrollBarImageColor3")
    local flcCorner = Instance.new("UICorner", FileListContainer)
    flcCorner.CornerRadius = UDim.new(0, 6)
    local flcStroke = Instance.new("UIStroke", FileListContainer)
    flcStroke.Name = "RecordingPickerListStroke"
    flcStroke.Color = getPickerThemeColor()
    flcStroke.Thickness = 1
    flcStroke.Transparency = 0.6
    registerPickerTheme(flcStroke, "Color")

    local FileListLayout = Instance.new("UIListLayout", FileListContainer)
    FileListLayout.Padding = UDim.new(0, 5)
    FileListLayout.SortOrder = Enum.SortOrder.LayoutOrder
    local FileListPadding = Instance.new("UIPadding", FileListContainer)
    FileListPadding.PaddingLeft = UDim.new(0, 6)
    FileListPadding.PaddingRight = UDim.new(0, 6)
    FileListPadding.PaddingTop = UDim.new(0, 6)
    FileListPadding.PaddingBottom = UDim.new(0, 6)

    local refreshSerial = 0
    local searchDebounce = 0
    local isRefreshing = false
    local refreshList

    local function setPickerStatus(text, color)
        if RefreshStatusLabel then
            RefreshStatusLabel.Text = tostring(text or "")
            RefreshStatusLabel.TextColor3 = color or Color3.fromRGB(190, 190, 190)
        end
    end

    local function setRefreshVisual(loading)
        isRefreshing = loading == true
        RefreshButton:SetAttribute("RecordingPickerRefreshing", isRefreshing)
        if RefreshTextLabel then
            RefreshTextLabel.Text = isRefreshing and "Memuat..." or "Refresh"
            RefreshTextLabel.TextColor3 = isRefreshing and Color3.fromRGB(220, 220, 220) or Color3.fromRGB(255, 255, 255)
        end
        if RefreshIcon then
            RefreshIcon.ImageTransparency = isRefreshing and 0.15 or 0
        end
        RefreshButton.BackgroundTransparency = isRefreshing and 0.08 or 0.35
        RefreshButton.TextColor3 = isRefreshing and Color3.fromRGB(220, 220, 220) or Color3.fromRGB(255, 255, 255)
        RefreshButton.Active = not isRefreshing
    end

    local function updateThisPlaceButton()
        ThisPlaceButton:SetAttribute("RecordingPickerActive", thisPlaceOnly)
        ThisPlaceButton.Text = "Filtering This Place: " .. (thisPlaceOnly and "ON" or "OFF")
        ThisPlaceButton.BackgroundTransparency = thisPlaceOnly and 0.15 or 0.55
        ThisPlaceButton.BackgroundColor3 = thisPlaceOnly and getPickerThemeColor() or Color3.fromRGB(35, 35, 55)
    end

    local function updateTabs()
        for scope, btn in pairs(tabButtons) do
            styleTab(btn, scope == currentScope)
        end
    end

    local function clearList()
        for _, child in ipairs(FileListContainer:GetChildren()) do
            if not (child:IsA("UIListLayout") or child:IsA("UIPadding")) then
                child:Destroy()
            end
        end
    end

    local function addMessageRow(text, color)
        local label = Instance.new("TextLabel", FileListContainer)
        label.Name = "RecordingPickerMessage"
        label.Size = UDim2.new(1, -4, 0, 30)
        label.BackgroundTransparency = 1
        label.Text = text
        label.TextColor3 = color or Color3.fromRGB(210, 210, 210)
        label.Font = Enum.Font.SourceSans
        label.TextSize = 13
        label.TextWrapped = true
        label.TextXAlignment = Enum.TextXAlignment.Center
        return label
    end

    local placeNameCache = {}
    local function getLocalRecordingFiles(filterText)
        local items = {}
        filterText = tostring(filterText or ""):lower()
        if not listfiles or not isfolder or not isfolder(RECORDING_FOLDER) then
            return items
        end
        local okFiles, files = pcall(listfiles, RECORDING_FOLDER)
        if not okFiles or type(files) ~= "table" then
            return items
        end
        table.sort(files, function(a, b) return tostring(a):lower() < tostring(b):lower() end)
        for _, fullPath in ipairs(files) do
            local fileName = tostring(fullPath):match("([^/\\]+)$") or tostring(fullPath)
            if fileName:lower():match("%.json$") then
                local baseName = fileName:gsub("%.json$", "")
                if filterText == "" or baseName:lower():find(filterText, 1, true) or fileName:lower():find(filterText, 1, true) then
                    local placeId = nil
                    local placeName = nil
                    
                    pcall(function()
                        if type(readfile) == "function" then
                            local content = readfile(fullPath)
                            local extractedId = content:match('"placeId"%s*:%s*(%d+)')
                            if not extractedId then
                                extractedId = content:match('"gameId"%s*:%s*(%d+)')
                            end
                            if extractedId then
                                placeId = extractedId
                                if placeNameCache[placeId] then
                                    placeName = placeNameCache[placeId]
                                else
                                    -- Perform sync check only if already cached otherwise rely on async fetch down the line
                                    -- We leave it nil to be fetched asynchronously
                                end
                            end
                        end
                    end)
                    
                    local subtitle = "Local file"
                    if placeName then
                        subtitle = subtitle .. " • " .. placeName .. " (" .. placeId .. ")"
                    elseif placeId then
                        subtitle = subtitle .. " • Place " .. placeId
                    else
                        subtitle = subtitle .. " • My Files"
                    end

                    table.insert(items, {kind = "local", scope = "mine", title = baseName, fileName = fileName, subtitle = subtitle, placeId = placeId, needsNameFetch = (placeId ~= nil and placeName == nil)})
                end
            end
        end
        return items
    end

    local function getWebRecordingTitle(rec)
        if type(rec) ~= "table" then return "Rekaman Web" end
        return tostring(rec.title or rec.name or rec.id or rec.recording_id or rec.recordingId or "Rekaman Web")
    end

    local function getWebRecordingSubtitle(rec, scope)
        if type(rec) ~= "table" then return "Web" end
        local owner = tostring(rec.username or rec.owner_name or rec.owner or rec.created_by or "")
        local placeId = tostring(rec.gameId or rec.game_id or rec.placeId or rec.place_id or rec.robloxPlaceId or rec.roblox_place_id or "")
        local pieces = {}
        if owner ~= "" then table.insert(pieces, owner) end
        if placeId ~= "" then table.insert(pieces, "Place " .. placeId) end
        if #pieces == 0 then
            if scope == "mine" then return "My Files" end
            if scope == "public" then return "Public" end
            return "Web Recording"
        end
        return table.concat(pieces, " • ")
    end

    local function normalizeRecordingMergeKey(value)
        value = tostring(value or ""):gsub("%.json$", "")
        value = value:gsub("^%s+", ""):gsub("%s+$", "")
        value = value:gsub("^%[Saya%]%s*", "")
        value = value:gsub("^%[Public%]%s*", "")
        value = value:gsub("_imported_%d+$", "")
        value = value:gsub("%s+", " ")
        return value:lower()
    end

    local function getWebRecordingPlaceId(rec)
        if type(rec) ~= "table" then return "" end
        local value = rec.gameId or rec.game_id or rec.placeId or rec.place_id or rec.robloxPlaceId or rec.roblox_place_id
        return value and tostring(value) or ""
    end

    local function canMergeLocalAndWebRecording(localItem, webRec)
        if type(localItem) ~= "table" or type(webRec) ~= "table" then return false end
        local localKey = normalizeRecordingMergeKey(localItem.title or localItem.fileName)
        local webKey = normalizeRecordingMergeKey(getWebRecordingTitle(webRec))
        if localKey == "" or webKey == "" or localKey ~= webKey then return false end
        local localPlaceId = tostring(localItem.placeId or "")
        local webPlaceId = getWebRecordingPlaceId(webRec)
        return localPlaceId == "" or webPlaceId == "" or localPlaceId == webPlaceId
    end

    local function markCombinedLocalWebRecording(localItem, webRec, scope)
        localItem.kind = "combined"
        localItem.webRecording = webRec
        localItem.webScope = scope
        local localSubtitle = tostring(localItem.subtitle or "Local file")
        if localSubtitle:find("Local file", 1, true) then
            localSubtitle = localSubtitle:gsub("Local file", "Local + Web", 1)
        else
            localSubtitle = "Local + Web • " .. localSubtitle
        end
        localItem.subtitle = localSubtitle
        return localItem
    end

    local function makeSmallActionButton(parent, text, themeColor, order, iconAssetId, buttonName)
        local resolvedIconAsset = iconAssetId or ((UI.isAssetIcon and UI.isAssetIcon(text)) and text or nil)
        local btn = Instance.new("TextButton", parent)
        btn.Name = buttonName or "RecordingPickerActionButton"
        btn.Size = UDim2.new(0, 27, 0, 25)
        btn.LayoutOrder = order or 10
        btn.BackgroundColor3 = themeColor or getPickerThemeColor()
        btn.BackgroundTransparency = 0.12
        btn.BorderSizePixel = 0
        btn.AutoButtonColor = true
        btn.Text = resolvedIconAsset and "" or text
        btn.TextColor3 = Color3.fromRGB(255, 255, 255)
        btn.Font = Enum.Font.SourceSansBold
        btn.TextSize = 13
        btn.ClipsDescendants = true
        registerPickerTheme(btn, "BackgroundColor3")
        local c = Instance.new("UICorner", btn)
        c.CornerRadius = UDim.new(0, 5)
        local actionStroke = Instance.new("UIStroke", btn)
        actionStroke.Name = (buttonName and (buttonName .. "Stroke")) or "RecordingPickerActionButtonStroke"
        actionStroke.Color = getPickerThemeColor()
        actionStroke.Thickness = 1
        actionStroke.Transparency = 0.4
        registerPickerTheme(actionStroke, "Color")
        if resolvedIconAsset then
            makeRecordingPickerIcon(
                btn,
                resolvedIconAsset,
                (buttonName and (buttonName .. "Icon")) or "RecordingPickerActionButtonIcon",
                UDim2.new(0, 15, 0, 15),
                UDim2.new(0.5, 0, 0.5, 0),
                Vector2.new(0.5, 0.5)
            )
        end
        pcall(function()
            btn:SetAttribute("RecordingPickerActionButton", true)
            if UI.RegisterButtonEffect then UI.RegisterButtonEffect(btn) end
        end)
        return btn
    end

    local function normalizeRecordingFileBaseName(name)
        name = tostring(name or ""):gsub("%.json$", "")
        name = name:gsub("^%s+", ""):gsub("%s+$", "")
        name = name:gsub([=[[/\]]=], "_")
        name = name:gsub("[:%*%?\"<>|]", "_")
        return name
    end

    local function promptRenameRecording(currentName, onSubmit)
        if UI.showGenericRenamePrompt then
            UI.showGenericRenamePrompt(ScreenGui, tostring(currentName or ""), function(value)
                if onSubmit then onSubmit(value) end
            end)
            return
        end
        task.spawn(function()
            local value = UI.promptInput and UI.promptInput("Nama baru file rekaman:") or nil
            if onSubmit then onSubmit(value) end
        end)
    end

    local function createRecordingRow(item, index)
        local allowManageThisScope = isMyFilesScope(item.scope or currentScope) or isDeveloperPickerRole()
        local hasLocalRecording = item.kind == "local" or item.kind == "combined" or item.fileName ~= nil
        local hasWebRecording = item.kind == "web" or item.kind == "combined" or item.webRecording ~= nil or item.recording ~= nil
        local canRenameLocal = hasLocalRecording and allowManageThisScope and (type(renamefile) == "function" or (type(readfile) == "function" and type(writefile) == "function" and type(delfile) == "function"))
        local canRenameWeb = hasWebRecording and allowManageThisScope and type(options.onWebFileRename) == "function"
        local canRename = canRenameLocal or canRenameWeb
        local canDeleteLocal = hasLocalRecording and allowManageThisScope and type(delfile) == "function"
        local canDeleteWeb = hasWebRecording and allowManageThisScope and type(options.onWebFileDelete) == "function"
        local canDelete = canDeleteLocal or canDeleteWeb
        local canVisit = item.placeId ~= nil and tostring(item.placeId) ~= "" and tostring(item.placeId) ~= "0"
        
        local actionCount = 1 + (canRename and 1 or 0) + (canDelete and 1 or 0) + (canVisit and 1 or 0)
        local actionButtonWidth = 27
        local actionPadding = 5
        local actionsWidth = (actionCount * actionButtonWidth) + (math.max(0, actionCount - 1) * actionPadding)
        local actionInset = actionsWidth + 16

        local row = Instance.new("Frame", FileListContainer)
        row.Name = "RecordingPickerItem"
        row.Size = UDim2.new(1, -2, 0, 46)
        row.BackgroundColor3 = Color3.fromRGB(28, 28, 45)
        row.BackgroundTransparency = 0.18
        row.BorderSizePixel = 0
        row.LayoutOrder = index
        local rowCorner = Instance.new("UICorner", row)
        rowCorner.CornerRadius = UDim.new(0, 6)

        local rowStroke = Instance.new("UIStroke", row)
        rowStroke.Name = "RecordingPickerItemStroke"
        rowStroke.Color = getPickerThemeColor()
        rowStroke.Thickness = 1
        rowStroke.Transparency = 0.75
        registerPickerTheme(rowStroke, "Color")

        local titleButton = Instance.new("TextButton", row)
        titleButton.Name = "RecordingPickerItemMainButton"
        titleButton.Size = UDim2.new(1, -actionInset, 1, -8)
        titleButton.Position = UDim2.new(0, 8, 0, 4)
        titleButton.BackgroundTransparency = 1
        titleButton.AutoButtonColor = false
        titleButton.Text = tostring(item.title or "Rekaman") .. "\n" .. tostring(item.subtitle or "")
        titleButton.TextColor3 = Color3.fromRGB(255, 255, 255)
        titleButton.Font = Enum.Font.SourceSans
        titleButton.TextSize = 12
        titleButton.TextWrapped = false
        titleButton.TextXAlignment = Enum.TextXAlignment.Left
        titleButton.TextYAlignment = Enum.TextYAlignment.Center
        pcall(function() titleButton.TextTruncate = Enum.TextTruncate.AtEnd end)
        
        if item.needsNameFetch then
            task.spawn(function()
                local okInfo, info = pcall(function() return game:GetService("MarketplaceService"):GetProductInfo(tonumber(item.placeId)) end)
                if okInfo and info then
                    placeNameCache[item.placeId] = info.Name
                    local sourceLabel = (item.kind == "combined") and "Local + Web" or "Local file"
                    item.subtitle = sourceLabel .. " • " .. info.Name .. " (" .. item.placeId .. ")"
                    titleButton.Text = tostring(item.title or "Rekaman") .. "\n" .. item.subtitle
                end
            end)
        end

        local actions = Instance.new("Frame", row)
        actions.Name = "RecordingPickerItemActions"
        actions.Size = UDim2.new(0, actionsWidth, 1, 0)
        actions.Position = UDim2.new(1, -(actionsWidth + 4), 0, 0)
        actions.BackgroundTransparency = 1
        local actionsLayout = Instance.new("UIListLayout", actions)
        actionsLayout.FillDirection = Enum.FillDirection.Horizontal
        actionsLayout.HorizontalAlignment = Enum.HorizontalAlignment.Right
        actionsLayout.VerticalAlignment = Enum.VerticalAlignment.Center
        actionsLayout.Padding = UDim.new(0, actionPadding)
        actionsLayout.SortOrder = Enum.SortOrder.LayoutOrder

        local function importItem()
            if hasLocalRecording and item.fileName then
                if callback then callback(tostring(item.fileName or item.title):gsub("%.json$", "")) end
                if ScreenGui and ScreenGui.Parent then ScreenGui:Destroy() end
                return
            end
            if hasWebRecording and type(options.onWebFileSelected) == "function" then
                local ok, result = pcall(options.onWebFileSelected, item.webRecording or item.recording, item.webScope or item.scope)
                if ok and result ~= false then
                    if ScreenGui and ScreenGui.Parent then ScreenGui:Destroy() end
                elseif not ok then
                    UI.showNotification(ScreenGui, "Gagal import: " .. tostring(result), Color3.fromRGB(200, 50, 50))
                end
            end
        end

        titleButton.MouseButton1Click:Connect(importItem)
        local importBtn = makeSmallActionButton(actions, "", getPickerThemeColor(), 1, (UI.toAssetIcon and UI.toAssetIcon(UI.Icons.ImportFile)) or "rbxassetid://99385102861455", "RecordingPickerImportButton")
        registerPickerTheme(importBtn, "BackgroundColor3")
        importBtn.MouseButton1Click:Connect(importItem)

        if canVisit then
            local visitBtn = makeSmallActionButton(actions, "", getPickerThemeColor(), 2, RECORDING_PICKER_ICON_ASSETS.Visit, "RecordingPickerVisitButton")
            visitBtn.MouseButton1Click:Connect(function()
                pcall(function()
                    game:GetService("TeleportService"):Teleport(tonumber(item.placeId), game:GetService("Players").LocalPlayer)
                end)
            end)
        end

        if canRename then
            local renameBtn = makeSmallActionButton(actions, "", getPickerThemeColor(), 3, RECORDING_PICKER_ICON_ASSETS.Rename, "RecordingPickerRenameButton")
            renameBtn.MouseButton1Click:Connect(function()
                promptRenameRecording(item.title or item.fileName or "Rekaman", function(newTitle)
                    local cleanedTitle = normalizeRecordingFileBaseName(newTitle)
                    if cleanedTitle == "" then return end

                    if hasLocalRecording and item.fileName then
                        local oldFileName = tostring(item.fileName or ((item.title or "") .. ".json"))
                        local oldPath = RECORDING_FOLDER .. "/" .. oldFileName
                        local newFileName = cleanedTitle .. ".json"
                        local newPath = RECORDING_FOLDER .. "/" .. newFileName

                        if oldFileName == newFileName then return end
                        if type(isfile) == "function" and isfile(newPath) then
                            UI.showNotification(ScreenGui, "Nama file sudah ada.", Color3.fromRGB(200, 150, 50))
                            return
                        end
                        if type(isfile) == "function" and not isfile(oldPath) then
                            UI.showNotification(ScreenGui, "File asal tidak ditemukan.", Color3.fromRGB(200, 50, 50))
                            return
                        end

                        local okRename, renameErr = false, nil
                        if type(renamefile) == "function" then
                            okRename, renameErr = pcall(renamefile, oldPath, newPath)
                        elseif type(readfile) == "function" and type(writefile) == "function" and type(delfile) == "function" then
                            okRename, renameErr = pcall(function()
                                local content = readfile(oldPath)
                                writefile(newPath, content)
                                delfile(oldPath)
                            end)
                        else
                            UI.showNotification(ScreenGui, "Executor tidak mendukung rename file lokal.", Color3.fromRGB(200, 150, 50))
                            return
                        end

                        if okRename then
                            if hasWebRecording and type(options.onWebFileRename) == "function" then
                                pcall(options.onWebFileRename, item.webRecording or item.recording, cleanedTitle, item.webScope or item.scope)
                            end
                            UI.showNotification(ScreenGui, hasWebRecording and "Nama file lokal + web diperbarui." or "Nama file lokal diperbarui.", Color3.fromRGB(50, 200, 50))
                            task.delay(0.1, function() if refreshList then refreshList(true) end end)
                        else
                            UI.showNotification(ScreenGui, "Gagal rename: " .. tostring(renameErr), Color3.fromRGB(200, 50, 50))
                        end
                        return
                    end

                    local ok, success, err = pcall(options.onWebFileRename, item.webRecording or item.recording, cleanedTitle, item.webScope or item.scope)
                    if ok and success ~= false then
                        UI.showNotification(ScreenGui, "Nama file diperbarui.", Color3.fromRGB(50, 200, 50))
                        task.delay(0.15, function() if refreshList then refreshList(true) end end)
                    else
                        UI.showNotification(ScreenGui, "Gagal rename: " .. tostring(err or success), Color3.fromRGB(200, 50, 50))
                    end
                end)
            end)
        end

        if canDelete then
            local deleteBtn = makeSmallActionButton(actions, "", getPickerThemeColor(), 4, RECORDING_PICKER_ICON_ASSETS.Delete, "RecordingPickerDeleteButton")
            deleteBtn.MouseButton1Click:Connect(function()
                local title = tostring(item.title or item.fileName or "file")
                local function runDelete()
                    local localOk, webOk = false, false
                    local localErr, webErr = nil, nil
                    local attemptedLocal, attemptedWeb = false, false

                    if hasLocalRecording and item.fileName then
                        attemptedLocal = true
                        local filePath = RECORDING_FOLDER .. "/" .. tostring(item.fileName or "")
                        if type(delfile) ~= "function" then
                            localErr = "Executor tidak mendukung hapus file lokal."
                        elseif type(isfile) == "function" and not isfile(filePath) then
                            localErr = "File lokal tidak ditemukan."
                        else
                            localOk, localErr = pcall(delfile, filePath)
                        end
                    end

                    if hasWebRecording and type(options.onWebFileDelete) == "function" then
                        attemptedWeb = true
                        local okDelete, successOrErr, err = pcall(options.onWebFileDelete, item.webRecording or item.recording, item.webScope or item.scope)
                        webOk = okDelete and successOrErr ~= false
                        if not webOk then webErr = tostring(err or successOrErr) end
                    end

                    if (not attemptedLocal or localOk) and (not attemptedWeb or webOk) then
                        if attemptedLocal and attemptedWeb then
                            UI.showNotification(ScreenGui, "File lokal + web dihapus.", Color3.fromRGB(50, 200, 50))
                        elseif attemptedLocal then
                            UI.showNotification(ScreenGui, "File lokal dihapus.", Color3.fromRGB(50, 200, 50))
                        else
                            UI.showNotification(ScreenGui, "File rekaman web dihapus.", Color3.fromRGB(50, 200, 50))
                        end
                    else
                        local parts = {}
                        if attemptedLocal and not localOk then table.insert(parts, "lokal: " .. tostring(localErr)) end
                        if attemptedWeb and not webOk then table.insert(parts, "web: " .. tostring(webErr)) end
                        UI.showNotification(ScreenGui, "Gagal menghapus " .. table.concat(parts, " | "), Color3.fromRGB(200, 50, 50))
                    end
                    task.delay(0.1, function() if refreshList then refreshList(true) end end)
                end

                if UI.showConfirmationPrompt then
                    UI.showConfirmationPrompt("Yakin ingin menghapus '" .. title .. "'?", function(confirmed)
                        if confirmed then runDelete() end
                    end)
                else
                    runDelete()
                end
            end)
        end
    end

    local function renderItems(items, emptyMessage)
        clearList()
        if #items == 0 then
            addMessageRow(emptyMessage or "Tidak ada rekaman ditemukan.")
            return
        end
        for index, item in ipairs(items) do
            createRecordingRow(item, index)
        end
    end

    refreshList = function(isManual)
        refreshSerial = refreshSerial + 1
        local mySerial = refreshSerial
        local scope = currentScope
        local query = SearchBox.Text or ""
        local placeOnly = thisPlaceOnly
        clearList()
        setRefreshVisual(true)
        setPickerStatus("Memuat " .. (scope == "mine" and "My Files" or scope) .. "...", Color3.fromRGB(210, 210, 210))
        addMessageRow("Memuat rekaman...")

        task.spawn(function()
            local items = {}
            local fetchError = nil

            local localItems = {}
            if scope == "mine" then
                for _, item in ipairs(getLocalRecordingFiles(query)) do
                    table.insert(localItems, item)
                    table.insert(items, item)
                end
            end

            if hasWebPicker then
                local okFetch, webRecordings, err = pcall(options.getWebRecordings, scope, query, placeOnly, isManual == true, mySerial)
                if okFetch and type(webRecordings) == "table" then
                    for _, rec in ipairs(webRecordings) do
                        local merged = false
                        if scope == "mine" then
                            for _, localItem in ipairs(localItems) do
                                if canMergeLocalAndWebRecording(localItem, rec) then
                                    markCombinedLocalWebRecording(localItem, rec, scope)
                                    merged = true
                                    break
                                end
                            end
                        end
                        if not merged then
                            table.insert(items, {
                                kind = "web",
                                scope = scope,
                                title = getWebRecordingTitle(rec),
                                subtitle = getWebRecordingSubtitle(rec, scope),
                                recording = rec,
                            })
                        end
                    end
                else
                    fetchError = tostring(err or webRecordings or "Gagal mengambil rekaman web.")
                end
            elseif scope ~= "mine" then
                fetchError = "Fitur rekaman web tidak tersedia."
            end

            task.defer(function()
                if mySerial ~= refreshSerial or not ScreenGui or not ScreenGui.Parent then return end
                local emptyMessage = fetchError or ((scope == "mine") and "Tidak ada file/rekaman di My Files." or "Tidak ada rekaman web ditemukan.")
                renderItems(items, emptyMessage)
                setRefreshVisual(false)
                local timeText = ""
                pcall(function() timeText = os.date("%H:%M:%S") end)
                local statusPrefix = fetchError and ("Refresh selesai dengan catatan: " .. tostring(fetchError)) or ("Diperbarui" .. (timeText ~= "" and (" " .. timeText) or ""))
                setPickerStatus(statusPrefix .. " • " .. tostring(#items) .. " item", fetchError and Color3.fromRGB(255, 190, 90) or Color3.fromRGB(190, 220, 190))
                if isManual == true then
                    UI.showNotification(ScreenGui, "Daftar rekaman diperbarui (" .. tostring(#items) .. " item).", getPickerThemeColor())
                end
            end)
        end)
    end

    local function scheduleRefresh(delayTime)
        searchDebounce = searchDebounce + 1
        local token = searchDebounce
        task.delay(delayTime or 0.2, function()
            if token == searchDebounce and ScreenGui and ScreenGui.Parent then
                refreshList()
            end
        end)
    end

    for scope, btn in pairs(tabButtons) do
        btn.MouseButton1Click:Connect(function()
            if currentScope == scope then return end
            currentScope = scope
            updateTabs()
            refreshList()
        end)
    end

    ThisPlaceButton.MouseButton1Click:Connect(function()
        thisPlaceOnly = not thisPlaceOnly
        updateThisPlaceButton()
        refreshList()
    end)

    RefreshButton.MouseButton1Click:Connect(function()
        if isRefreshing then
            UI.showNotification(ScreenGui, "Refresh masih berjalan...", Color3.fromRGB(200, 150, 50))
            return
        end
        refreshList(true)
    end)

    SearchBox:GetPropertyChangedSignal("Text"):Connect(function()
        scheduleRefresh(0.25)
    end)

    FileListLayout:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
        FileListContainer.CanvasSize = UDim2.new(0, 0, 0, FileListLayout.AbsoluteContentSize.Y + 12)
    end)

    updateTabs()
    updateThisPlaceButton()
    refreshList()
end

function UI.showNotification(parent, message, color)
    local notifFrame = Instance.new("Frame", parent)
    notifFrame.Size = UDim2.new(0, 180, 0, 25) -- Perkecil ukuran frame
    notifFrame.Position = UDim2.new(0.5, -90, 0, -30) -- Sesuaikan posisi awal
    notifFrame.BackgroundColor3 = Color3.fromRGB(10, 10, 25)
    notifFrame.BackgroundTransparency = 0.3
    notifFrame.BorderSizePixel = 0
    
    local corner = Instance.new("UICorner", notifFrame)
    corner.CornerRadius = UDim.new(0, 6) -- Sedikit perkecil corner
    
    local stroke = Instance.new("UIStroke", notifFrame)
    stroke.Color = color or Color3.fromRGB(0, 150, 255) 
    stroke.Thickness = 1
    stroke.Transparency = 0.4
    
    local notifLabel = Instance.new("TextLabel", notifFrame)
    notifLabel.Size = UDim2.new(1, -10, 1, 0)
    notifLabel.Position = UDim2.new(0, 5, 0, 0)
    notifLabel.BackgroundTransparency = 1
    notifLabel.Text = message
    notifLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
    notifLabel.Font = Enum.Font.SourceSans -- Ganti ke font yang lebih tipis
    notifLabel.TextSize = 12 -- Perkecil ukuran font
    notifLabel.TextWrapped = true

    local tweenInfo = TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.Out) -- Percepat animasi
    local startPosition = UDim2.new(0.5, -90, 0, -30) -- Sesuaikan posisi
    local goalPosition = UDim2.new(0.5, -90, 0, 10) -- Sesuaikan posisi akhir
    
    notifFrame.Position = startPosition
    TweenService:Create(notifFrame, tweenInfo, {Position = goalPosition}):Play()
    
    task.delay(3, function()
        if notifFrame and notifFrame.Parent then
            TweenService:Create(notifFrame, tweenInfo, {Position = startPosition}):Play()
            task.wait(0.4)
            notifFrame:Destroy()
        end
    end)
end

function UI.showGenericRenamePrompt(parent, oldName, callback)
    -- Kompatibilitas: bisa dipanggil sebagai (oldName, callback) atau (parent, oldName, callback).
    if typeof(parent) ~= "Instance" then
        callback = oldName
        oldName = parent
        parent = CoreGui:FindFirstChild("ArexanstoolsGUI") or CoreGui
    end

    local promptFrame = Instance.new("Frame")
    promptFrame.Name = "GenericRenamePrompt"
    promptFrame.Size = UDim2.new(0, 200, 0, 100)
    promptFrame.Position = UDim2.new(0.5, -100, 0.5, -50)
    promptFrame.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
    promptFrame.BorderSizePixel = 0
    promptFrame.ZIndex = 10
    promptFrame.Parent = parent

    local corner = Instance.new("UICorner", promptFrame)
    corner.CornerRadius = UDim.new(0, 8)

    local stroke = Instance.new("UIStroke", promptFrame)
    stroke.Name = "PromptThemeStroke"
    stroke.Color = ((UI._ArexansGetResolvedThemeColor and UI._ArexansGetResolvedThemeColor()) or (UI.isThemeManagerActive and UI.currentThemeColor) or Color3.fromRGB(0, 150, 255))
    stroke.Thickness = 1
    UI.registerThemeElement(stroke, "Color", stroke.Color)

    local title = Instance.new("TextLabel", promptFrame)
    title.Size = UDim2.new(1, 0, 0, 20)
    title.Text = "Ganti Nama"
    title.TextColor3 = Color3.fromRGB(255, 255, 255)
    title.BackgroundTransparency = 1
    title.Font = Enum.Font.SourceSansBold

    local textBox = Instance.new("TextBox", promptFrame)
    textBox.Size = UDim2.new(1, -20, 0, 30)
    textBox.Position = UDim2.new(0.5, -90, 0, 30)
    textBox.Text = tostring(oldName or "")
    textBox.BackgroundTransparency = 1
    textBox.TextColor3 = Color3.fromRGB(255, 255, 255)
    textBox.ClearTextOnFocus = false
    local tbCorner = Instance.new("UICorner", textBox)
    tbCorner.CornerRadius = UDim.new(0, 5)
    local tbStroke = Instance.new("UIStroke", textBox)
    tbStroke.Name = "PromptInputStroke"
    tbStroke.Color = stroke.Color
    tbStroke.Thickness = 1
    tbStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    UI.registerThemeElement(tbStroke, "Color", tbStroke.Color)

    local okButton = UI.createButton(promptFrame, "OK", function()
        if callback then callback(textBox.Text) end
        promptFrame:Destroy()
    end)
    okButton.Size = UDim2.new(0.5, -10, 0, 25)
    okButton.Position = UDim2.new(0, 5, 1, -30)

    local cancelButton = UI.createButton(promptFrame, "Batal", function()
        promptFrame:Destroy()
    end)
    cancelButton.Size = UDim2.new(0.5, -10, 0, 25)
    cancelButton.Position = UDim2.new(0.5, 5, 1, -30)
    cancelButton.BackgroundColor3 = Color3.fromRGB(100, 100, 100)
end

function UI.showImportPrompt(parent, callback)
    -- Kompatibilitas: bisa dipanggil sebagai (callback) atau (parent, callback).
    if typeof(parent) ~= "Instance" then
        callback = parent
        parent = CoreGui:FindFirstChild("ArexanstoolsGUI") or CoreGui
    end

    local promptFrame = Instance.new("Frame")
    promptFrame.Name = "ImportPrompt"
    promptFrame.Size = UDim2.new(0, 220, 0, 150)
    promptFrame.Position = UDim2.new(0.5, -110, 0.5, -75)
    promptFrame.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
    promptFrame.BorderSizePixel = 0
    promptFrame.ZIndex = 10
    promptFrame.Parent = parent

    local corner = Instance.new("UICorner", promptFrame)
    corner.CornerRadius = UDim.new(0, 8)

    local stroke = Instance.new("UIStroke", promptFrame)
    stroke.Name = "ImportPromptStroke"
    stroke.Color = ((UI._ArexansGetResolvedThemeColor and UI._ArexansGetResolvedThemeColor()) or (UI.isThemeManagerActive and UI.currentThemeColor) or Color3.fromRGB(0, 150, 255))
    stroke.Thickness = 1
    UI.registerThemeElement(stroke, "Color", stroke.Color)

    local title = Instance.new("TextLabel", promptFrame)
    title.Size = UDim2.new(1, 0, 0, 20)
    title.Text = "Impor Lokasi"
    title.TextColor3 = Color3.fromRGB(255, 255, 255)
    title.BackgroundTransparency = 1
    title.Font = Enum.Font.SourceSansBold

    local textBox = Instance.new("TextBox", promptFrame)
    textBox.Size = UDim2.new(1, -20, 1, -60)
    textBox.Position = UDim2.new(0.5, -100, 0, 25)
    textBox.PlaceholderText = "Tempel data di sini..."
    textBox.MultiLine = true
    textBox.TextXAlignment = Enum.TextXAlignment.Left
    textBox.TextYAlignment = Enum.TextYAlignment.Top
    textBox.BackgroundTransparency = 1
    textBox.TextColor3 = Color3.fromRGB(255, 255, 255)
    textBox.Text = ""
    local tbCorner = Instance.new("UICorner", textBox)
    tbCorner.CornerRadius = UDim.new(0, 5)
    local tbStroke = Instance.new("UIStroke", textBox)
    tbStroke.Name = "ImportPromptInputStroke"
    tbStroke.Color = stroke.Color
    tbStroke.Thickness = 1
    tbStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    UI.registerThemeElement(tbStroke, "Color", tbStroke.Color)

    local okButton = UI.createButton(promptFrame, (UI.Icons and UI.Icons.ImportFile) or "99385102861455", function()
        if callback then callback(textBox.Text) end
        promptFrame:Destroy()
    end)
    okButton.Name = "ImportPromptOkButton"
    okButton.Size = UDim2.new(0.5, -10, 0, 25)
    okButton.Position = UDim2.new(0, 5, 1, -30)
    if UI.applyIcon then UI.applyIcon(okButton, (UI.Icons and UI.Icons.ImportFile) or "99385102861455", Color3.fromRGB(255, 255, 255)) end

    local cancelButton = UI.createButton(promptFrame, "Batal", function()
        promptFrame:Destroy()
    end)
    cancelButton.Size = UDim2.new(0.5, -10, 0, 25)
    cancelButton.Position = UDim2.new(0.5, 5, 1, -30)
    cancelButton.BackgroundColor3 = Color3.fromRGB(100, 100, 100)
end


-- Patch v20: Developer Custom HSV Gradient Mode.
-- Gerak gradient dibuat medium/sedang, tidak terlalu cepat.
-- Warna gradient Developer mengikuti HSV custom supaya title, navigasi, border, dan aksen tetap selaras.
function UI.configureArexansRoleTheme(options)
    options = options or {}
    local RunService = options.runService or game:GetService("RunService")
    local CoreGui = options.coreGui or game:GetService("CoreGui")

    -- v18: tidak lagi single border only. Developer boleh memberi gradient ke elemen aksen.
    UI._ArexansDeveloperSingleGradientOnly = false
    UI._ArexansDeveloperGradientMode = "left_to_right_multi_accent"

    local DEVELOPER_BLUE = Color3.fromRGB(0, 170, 255)
    local DEVELOPER_CYAN = Color3.fromRGB(0, 255, 255)
    local DEVELOPER_DARK = Color3.fromRGB(0, 18, 65)
    local DEVELOPER_MID = Color3.fromRGB(0, 90, 210)
    local READABLE_TEXT = Color3.fromRGB(255, 255, 255)
    local READABLE_TEXT_STROKE = Color3.fromRGB(0, 0, 0)
    local READABLE_TEXT_BG = Color3.fromRGB(8, 12, 28)
    local GRADIENT_SPEED = 0.60 -- v20: medium/sedang; tetap ringan karena satu RenderStepped untuk semua gradient
    -- v23: animasi dibuat kiri -> kanan seperti versi lama, tetapi di-throttle supaya tidak lag
    -- walau gradient dipasang ke lebih banyak elemen UI.
    local GRADIENT_UPDATE_INTERVAL = 1 / 30
    local MAX_ANIMATED_GRADIENTS = 160
    local activeDeveloperGradients = {}
    local activeDeveloperGradientCount = 0
    local developerGradientConnection = nil
    local gradientUpdateAccumulator = 0

    local function clamp01(value)
        return math.clamp(value or 0, 0, 1)
    end

    local function getDeveloperAccentColor()
        local color = DEVELOPER_BLUE
        pcall(function()
            -- Saat toggle HSV aktif, Developer memakai warna pilihan user.
            -- Saat OFF, kembali ke default biru role Developer.
            if UI.isThemeManagerActive and UI.currentThemeColor then
                color = UI.currentThemeColor
            elseif UI._ArexansThemeApplyOverride == true and UI.currentThemeColor then
                color = UI.currentThemeColor
            end
        end)
        if typeof(color) ~= "Color3" then
            color = DEVELOPER_BLUE
        end
        return color
    end

    local function getDeveloperPalette()
        local base = getDeveloperAccentColor()
        local h, s, v = base:ToHSV()
        local function variant(sMul, vMul, minV)
            return Color3.fromHSV(h, clamp01(s * sMul), clamp01(math.max(v * vMul, minV or 0)))
        end
        return {
            base = base,
            dark = variant(1.05, 0.35, 0.08),
            mid = variant(0.98, 0.72, 0.14),
            bright = variant(0.78, 1.18, 0.28),
            soft = variant(0.55, 1.08, 0.24),
        }
    end

    local developerTargetNames = {
        MainBorderStroke = true,
        RoleLabel = true,
        ExpirationLabel = true,
        TitleLabel = true,
        InfoButton = true,
        SaveProfileBtn = true,
        LoadProfileBtn = true,
        ProfilesTitle = true,
        SaveProfileButton = true,
        LoadProfileButton = true,
        MiniToggleButton = true,
        EmoteToggleButton = true,
        AnimationShowButton = true,
        MainResizeHandle = true,
        VertSeparator = true,
        HorizSeparator = true,
        FooterSeparator = true,
        ServerFilterIconButton = true,
        ServerRefreshIconButton = true,
        SliderFill = true,
        SliderThumb = true,
        Switch = true,
        ExecuteButton = true,
        PinButton = true,
        DeveloperTextAccentStroke = true,
        TabButtonStroke = true,
        SearchStroke = true,
        EmoteStroke = true,
        AnimStroke = true,
        TeleportButton = true,
        RecordButton = true,
        RefreshFilterBtn = true,
        ThisGameBtn = true,
        InfoBtn = true,
    }

    -- v23: cakupan broad untuk elemen UI yang namanya jelas berupa aksen/kontrol.
    -- Ini membuat gradient terasa mengenai hampir semua bagian penting, tanpa harus memaksa semua Frame besar.
    local developerBroadNameHints = {
        "Button", "Btn", "Stroke", "Slider", "Thumb", "Fill", "Switch", "Toggle",
        "Separator", "Icon", "Tab", "Card", "Chip", "Panel", "Search", "Filter",
        "Record", "Teleport", "Execute", "Refresh", "Save", "Load", "Resize", "Handle",
        "Header", "Footer", "Title", "Input", "Box"
    }

    local function getRoleName()
        if type(options.getCurrentUserRole) == "function" then
            local ok, role = pcall(options.getCurrentUserRole)
            if ok and role then return tostring(role):upper() end
        end
        return tostring(options.currentUserRole or ""):upper()
    end

    local function getRoleDefaultThemeColor()
        local role = getRoleName()
        if role == "VIP" then return Color3.fromRGB(170, 0, 255) end
        if role == "NORMAL" then return Color3.fromRGB(0, 255, 0) end
        if role == "LIFETIME" then return DEVELOPER_BLUE end
        if role == "DEVELOPER" then return DEVELOPER_BLUE end
        if role == "FREE" then return Color3.fromRGB(128, 128, 128) end
        return Color3.fromRGB(128, 128, 128)
    end

    local function isGradientRole()
        local r = getRoleName()
        return r == "DEVELOPER"
    end

    local function isMainBorderStroke(instance)
        return instance and instance:IsA("UIStroke") and instance.Name == "MainBorderStroke"
    end

    local function colorDistance(a, b)
        return math.abs(a.R - b.R) + math.abs(a.G - b.G) + math.abs(a.B - b.B)
    end

    local function isAccentBlue(color)
        if typeof(color) ~= "Color3" then return false end
        local currentAccent = getDeveloperAccentColor()
        if colorDistance(color, currentAccent) <= 0.25 then return true end
        if colorDistance(color, DEVELOPER_BLUE) <= 0.25 then return true end
        if colorDistance(color, DEVELOPER_CYAN) <= 0.25 then return true end
        -- Tangkap variasi biru lama UI Arexans, supaya cakupannya sama seperti role Normal/VIP.
        return color.B >= 0.62 and color.G >= 0.16 and color.R <= 0.38 and color.B > color.R
    end

    local function safeGetAttribute(instance, attr)
        local ok, value = pcall(function() return instance:GetAttribute(attr) end)
        if ok then return value end
        return nil
    end

    local function makeGradientSequence()
        local palette = getDeveloperPalette()
        -- v23: urutan dibuat sedikit asimetris supaya gerak kiri -> kanan terlihat jelas,
        -- bukan terasa seperti pulse bolak-balik.
        return ColorSequence.new({
            ColorSequenceKeypoint.new(0.00, palette.dark),
            ColorSequenceKeypoint.new(0.18, palette.mid),
            ColorSequenceKeypoint.new(0.42, palette.base),
            ColorSequenceKeypoint.new(0.58, palette.bright),
            ColorSequenceKeypoint.new(0.76, palette.soft),
            ColorSequenceKeypoint.new(1.00, palette.dark)
        })
    end

    local function makeReadableTextGradientSequence()
        -- v20/v23: teks tetap memakai hue HSV yang sama agar judul dan navigasi tidak beda warna.
        local palette = getDeveloperPalette()
        return ColorSequence.new({
            ColorSequenceKeypoint.new(0.00, palette.mid),
            ColorSequenceKeypoint.new(0.34, palette.soft),
            ColorSequenceKeypoint.new(0.56, palette.bright),
            ColorSequenceKeypoint.new(0.78, palette.base),
            ColorSequenceKeypoint.new(1.00, palette.mid)
        })
    end

    local function isTextObject(instance)
        return instance and (instance:IsA("TextButton") or instance:IsA("TextLabel") or instance:IsA("TextBox"))
    end

    local function hasVisibleTextBackground(instance)
        if not instance then return false end
        local ok, transparency = pcall(function() return instance.BackgroundTransparency end)
        return ok and transparency < 0.92
    end

    local function ensureTextReadable(instance)
        if not isTextObject(instance) then return end
        pcall(function()
            instance.TextColor3 = READABLE_TEXT
            instance.TextStrokeColor3 = READABLE_TEXT_STROKE
            instance.TextStrokeTransparency = 0.35
            if hasVisibleTextBackground(instance) then
                -- Jangan samakan background dengan warna gradient teks. Background dibuat gelap/netral.
                instance.BackgroundColor3 = READABLE_TEXT_BG
                if instance.BackgroundTransparency < 0.25 then
                    instance.BackgroundTransparency = 0.25
                end
            end
        end)
    end

    local function isNavigationTriangle(instance)
        if not isTextObject(instance) then return false end
        local ok, txt = pcall(function() return instance.Text end)
        if not ok then return false end
        return txt == UI.Icons.Up or txt == UI.Icons.Down or txt == UI.Icons.Left or txt == UI.Icons.Right
    end

    local function shouldUseTextGradient(instance)
        if not isTextObject(instance) then return false end
        -- Gradient teks hanya aman pada teks transparan. Kalau ada background, pakai border/aksen saja.
        if hasVisibleTextBackground(instance) then return false end
        return developerTargetNames[instance.Name]
            or isNavigationTriangle(instance)
            or safeGetAttribute(instance, "ArexansThemeAccent") == true
            or safeGetAttribute(instance, "ArexansNavIcon") == true
    end

    local function ensureTextAccentStroke(instance)
        if not isTextObject(instance) then return nil end
        local stroke = instance:FindFirstChild("DeveloperTextAccentStroke")
        if not stroke then
            stroke = Instance.new("UIStroke")
            stroke.Name = "DeveloperTextAccentStroke"
            stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
            stroke.Thickness = 1
            stroke.Transparency = 0.15
            stroke.Parent = instance
        end
        stroke.Color = getDeveloperAccentColor()
        return stroke
    end

    local function hasDeveloperBroadNameHint(instance)
        local name = tostring(instance and instance.Name or "")
        if name == "" then return false end
        for _, hint in ipairs(developerBroadNameHints) do
            if string.find(name, hint, 1, true) then
                return true
            end
        end
        return false
    end

    local function isHighPriorityGradientTarget(instance)
        if not instance then return false end
        return isMainBorderStroke(instance)
            or developerTargetNames[instance.Name] == true
            or isNavigationTriangle(instance)
            or safeGetAttribute(instance, "ArexansThemeAccent") == true
            or safeGetAttribute(instance, "ArexansNavIcon") == true
    end

    local function shouldUseBroadDeveloperGradient(instance)
        if not instance then return false end
        local allowImageGradient = UI.allowsDeveloperIconGradient and UI.allowsDeveloperIconGradient(instance)
        if safeGetAttribute(instance, "ArexansNoDeveloperGradient") == true and not allowImageGradient then return false end
        -- v30: jangan tempel animasi gradient langsung ke gambar/avatar umum.
        -- Hanya icon yang ditandai khusus (save/load/info/emote/animation/close) yang boleh diberi gradient.
        if (instance:IsA("ImageButton") or instance:IsA("ImageLabel")) and not allowImageGradient then return false end

        if instance:IsA("UIStroke") then
            local okTrans, transparency = pcall(function() return instance.Transparency end)
            return hasDeveloperBroadNameHint(instance) and (not okTrans or transparency < 0.98)
        end

        if not instance:IsA("GuiObject") then return false end
        local okVisible, visible = pcall(function() return instance.Visible end)
        if okVisible and visible == false then return false end
        if not hasDeveloperBroadNameHint(instance) then return false end

        -- TextButton/TextLabel yang punya background tetap dijaga readable oleh attachDeveloperGradient(),
        -- biasanya dialihkan ke stroke gradient agar teks tidak tenggelam.
        local okBg, bgTransparency = pcall(function() return instance.BackgroundTransparency end)
        if okBg and bgTransparency < 0.985 then return true end

        local okBorder, borderSize = pcall(function() return instance.BorderSizePixel end)
        if okBorder and borderSize and borderSize > 0 then return true end

        return isTextObject(instance) or instance:IsA("ImageButton") or instance:IsA("ImageLabel") or instance:IsA("ScrollingFrame")
    end

    local function unregisterDeveloperGradient(gradient)
        if gradient and activeDeveloperGradients[gradient] then
            activeDeveloperGradients[gradient] = nil
            activeDeveloperGradientCount = math.max(activeDeveloperGradientCount - 1, 0)
        elseif gradient then
            activeDeveloperGradients[gradient] = nil
        end
    end

    local function startDeveloperGradientLoop()
        if developerGradientConnection then return end
        developerGradientConnection = RunService.RenderStepped:Connect(function(dt)
            gradientUpdateAccumulator = gradientUpdateAccumulator + (dt or 0)
            if gradientUpdateAccumulator < GRADIENT_UPDATE_INTERVAL then return end
            gradientUpdateAccumulator = 0

            -- Offset -1 -> 1 = sapuan horizontal kiri ke kanan. Tidak pakai sine/pingpong.
            local x = ((tick() * GRADIENT_SPEED) % 2) - 1
            local hasAny = false
            for gradient in pairs(activeDeveloperGradients) do
                if gradient and gradient.Parent then
                    hasAny = true
                    gradient.Rotation = 0
                    gradient.Offset = Vector2.new(x, 0)
                else
                    unregisterDeveloperGradient(gradient)
                end
            end
            if not hasAny and developerGradientConnection then
                developerGradientConnection:Disconnect()
                developerGradientConnection = nil
                gradientUpdateAccumulator = 0
            end
        end)
    end

    local function registerDeveloperGradient(gradient, sourceInstance)
        if not gradient then return end
        if activeDeveloperGradients[gradient] then
            startDeveloperGradientLoop()
            return
        end

        local highPriority = isHighPriorityGradientTarget(sourceInstance or gradient.Parent)
        if activeDeveloperGradientCount >= MAX_ANIMATED_GRADIENTS and not highPriority then
            -- Tetap pakai gradient statis untuk cakupan visual, tapi jangan di-update tiap frame.
            unregisterDeveloperGradient(gradient)
            pcall(function() gradient:SetAttribute("ArexansGradientAnimated", false) end)
            gradient.Rotation = 0
            gradient.Offset = Vector2.new(0, 0)
            return
        end

        activeDeveloperGradients[gradient] = true
        activeDeveloperGradientCount = activeDeveloperGradientCount + 1
        pcall(function() gradient:SetAttribute("ArexansGradientAnimated", true) end)
        startDeveloperGradientLoop()
    end

    local function removeDeveloperGradient(instance)
        if not instance then return end
        for _, child in ipairs(instance:GetChildren()) do
            if child.Name == "DeveloperGradient" and child:IsA("UIGradient") then
                unregisterDeveloperGradient(child)
                child:Destroy()
            end
        end
    end

    local function isDeveloperGradientTarget(instance)
        if not instance then return false end
        -- v30: ArexansNoDeveloperGradient dicek paling awal, kecuali icon khusus yang memang diminta ikut gradient.
        local allowImageGradient = UI.allowsDeveloperIconGradient and UI.allowsDeveloperIconGradient(instance)
        if safeGetAttribute(instance, "ArexansNoDeveloperGradient") == true and not allowImageGradient then return false end
        -- Jangan pasang UIGradient pada ImageButton/ImageLabel umum agar icon/avatar tidak tertutup.
        if (instance:IsA("ImageButton") or instance:IsA("ImageLabel")) and not allowImageGradient then return false end
        if instance.Name == "TabButtonStroke" and safeGetAttribute(instance, "ArexansActiveTab") ~= true then return false end
        if isMainBorderStroke(instance) then return true end
        if developerTargetNames[instance.Name] then return true end
        if isNavigationTriangle(instance) then return true end
        if safeGetAttribute(instance, "ArexansThemeAccent") == true then return true end
        if safeGetAttribute(instance, "ArexansNavIcon") == true then return true end
        if shouldUseBroadDeveloperGradient(instance) then return true end

        if instance:IsA("UIStroke") then
            return isAccentBlue(instance.Color)
        end

        if instance:IsA("GuiObject") then
            local okBg, bg = pcall(function() return instance.BackgroundColor3 end)
            if okBg and isAccentBlue(bg) then return true end
            local okBorder, border = pcall(function() return instance.BorderColor3 end)
            if okBorder and isAccentBlue(border) then return true end
            if instance:IsA("TextButton") or instance:IsA("TextLabel") or instance:IsA("TextBox") then
                local okText, textColor = pcall(function() return instance.TextColor3 end)
                if okText and isAccentBlue(textColor) then return true end
            end
            if instance:IsA("ImageButton") or instance:IsA("ImageLabel") then
                local okImage, imageColor = pcall(function() return instance.ImageColor3 end)
                if okImage and isAccentBlue(imageColor) then return true end
            end
            if instance:IsA("ScrollingFrame") then
                local okScroll, scrollColor = pcall(function() return instance.ScrollBarImageColor3 end)
                if okScroll and isAccentBlue(scrollColor) then return true end
            end
        end

        return false
    end

    local function prepareBaseColor(instance)
        pcall(function()
            local accentColor = getDeveloperAccentColor()
            if instance:IsA("UIStroke") then
                instance.Color = accentColor
                if isMainBorderStroke(instance) then
                    instance.Thickness = math.max(instance.Thickness or 1, 3)
                    instance.Transparency = 0
                    instance.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
                elseif instance.Name == "DeveloperTextAccentStroke" then
                    instance.Thickness = 1
                    instance.Transparency = 0.15
                    instance.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
                elseif instance.Name == "TabButtonStroke" and safeGetAttribute(instance, "ArexansActiveTab") ~= true then
                    instance.Transparency = 1
                elseif instance.Transparency > 0.75 then
                    instance.Transparency = 0.5
                end
            elseif isTextObject(instance) then
                ensureTextReadable(instance)
            elseif instance:IsA("ImageButton") or instance:IsA("ImageLabel") then
                instance.ImageColor3 = accentColor
                if instance.BackgroundTransparency < 0.96 then
                    instance.BackgroundColor3 = READABLE_TEXT_BG
                end
            elseif instance:IsA("ScrollingFrame") then
                instance.ScrollBarImageColor3 = accentColor
            elseif instance:IsA("GuiObject") then
                if instance.BackgroundTransparency < 0.96 then
                    instance.BackgroundColor3 = accentColor
                end
                instance.BorderColor3 = accentColor
            end
        end)
    end

    local function attachDeveloperGradient(instance)
        if not instance then return end
        if not isDeveloperGradientTarget(instance) then
            removeDeveloperGradient(instance)
            return
        end

        -- v19: teks dengan background jangan diberi gradient langsung karena jadi sulit dibaca.
        if isTextObject(instance) then
            ensureTextReadable(instance)
            if not shouldUseTextGradient(instance) then
                removeDeveloperGradient(instance)
                local textStroke = ensureTextAccentStroke(instance)
                if textStroke then
                    attachDeveloperGradient(textStroke)
                end
                return
            end
        end

        prepareBaseColor(instance)

        local gradient = instance:FindFirstChild("DeveloperGradient")
        if not gradient then
            gradient = Instance.new("UIGradient")
            gradient.Name = "DeveloperGradient"
            gradient.Parent = instance
        end
        gradient.Color = isTextObject(instance) and makeReadableTextGradientSequence() or makeGradientSequence()
        gradient.Rotation = 0 -- horizontal: kiri ke kanan, bukan melingkar
        gradient.Offset = Vector2.new(-1, 0)
        registerDeveloperGradient(gradient, instance)
    end

    local function cleanExtraDeveloperGradients(root)
        if not root then return end
        local all = root:GetDescendants()
        table.insert(all, root)
        for _, inst in ipairs(all) do
            if inst:FindFirstChild("DeveloperGradient") and not isDeveloperGradientTarget(inst) then
                removeDeveloperGradient(inst)
            end
        end
    end

    local function findMainBorderStroke(root)
        root = root or (options.getScreenGui and options.getScreenGui()) or CoreGui:FindFirstChild("ArexanstoolsGUI")
        if not root then return nil end
        local borderFrame = root:FindFirstChild("BorderFrame", true)
        if borderFrame then
            local stroke = borderFrame:FindFirstChild("MainBorderStroke")
            if stroke and stroke:IsA("UIStroke") then return stroke end
        end
        local stroke = root:FindFirstChild("MainBorderStroke", true)
        if stroke and stroke:IsA("UIStroke") then return stroke end
        return nil
    end

    local function applyDeveloperGradient(instance)
        if not instance then return end
        if not isGradientRole() then
            removeDeveloperGradient(instance)
            return
        end
        attachDeveloperGradient(instance)
    end

    local function refreshRoleGradientUI(root)
        root = root or (options.getScreenGui and options.getScreenGui()) or CoreGui:FindFirstChild("ArexanstoolsGUI")
        if not root then return end

        if not isGradientRole() then
            local all = root:GetDescendants()
            table.insert(all, root)
            for _, inst in ipairs(all) do
                removeDeveloperGradient(inst)
            end
            return
        end

        cleanExtraDeveloperGradients(root)

        local mainStroke = findMainBorderStroke(root)
        if mainStroke then
            attachDeveloperGradient(mainStroke)
        end

        -- Elemen yang didaftarkan themeable = elemen yang normalnya ikut warna role Normal/VIP.
        for _, el in ipairs(UI.ThemeableElements or {}) do
            if el.instance and el.instance.Parent then
                pcall(function() el.instance:SetAttribute("ArexansThemeAccent", true) end)
                attachDeveloperGradient(el.instance)
            end
        end

        local all = root:GetDescendants()
        for _, inst in ipairs(all) do
            if isDeveloperGradientTarget(inst) then
                attachDeveloperGradient(inst)
            end
        end
    end

    local function loadThemeStateEarly()
        UI.defaultThemeColor = getRoleDefaultThemeColor()
        UI.currentThemeColor = UI.defaultThemeColor
        UI._ArexansPendingThemeColor = UI.defaultThemeColor
        UI.isThemeManagerActive = false
    end

    UI._ArexansApplyDeveloperGradient = applyDeveloperGradient
    UI._ArexansRefreshDeveloperGradientUI = refreshRoleGradientUI
    UI._ArexansIsDeveloperGradientRole = isGradientRole

    return {
        isGradientRole = isGradientRole,
        getRoleDefaultThemeColor = getRoleDefaultThemeColor,
        applyDeveloperGradient = applyDeveloperGradient,
        refreshRoleGradientUI = refreshRoleGradientUI,
        loadThemeStateEarly = loadThemeStateEarly,
    }
end

return UI