local HttpService = game:GetService("HttpService")
local CoreGui = game:GetService("CoreGui")
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")

-- Cleanup previous connections for keysystem if any
if not _G.Arexans_Connections then
    _G.Arexans_Connections = {}
end

local function ConnectEvent(event, func)
    local conn = event:Connect(func)
    table.insert(_G.Arexans_Connections, conn)
    return conn
end

-- [[ FUNGSI DRAGGABLE ]] --
local function MakeDraggable(guiObject, dragHandle, isDraggableCheck, clickCallback)
    local dragInput = nil
    local dragStart = nil
    local startPos = nil
    local wasDragged = false

    ConnectEvent(dragHandle.InputBegan, function(input)
        if not (input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch) then return end
        if dragInput then return end

        if isDraggableCheck and not isDraggableCheck() then
            if clickCallback then
                local timeSinceBegan = tick()
                local endedConn
                endedConn = UserInputService.InputEnded:Connect(function(endInput)
                    if endInput.UserInputType == input.UserInputType then
                        if endInput.UserInputType == Enum.UserInputType.Touch and endInput ~= input then
                            return
                        end
                        if tick() - timeSinceBegan < 0.2 then
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

    ConnectEvent(UserInputService.InputChanged, function(input)
        if dragInput then 
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
                if not wasDragged and delta.Magnitude > 5 then
                    wasDragged = true
                end
            end
        end
    end)

    ConnectEvent(UserInputService.InputEnded, function(input)
        if dragInput and input.UserInputType == dragInput.UserInputType then
            if input.UserInputType == Enum.UserInputType.Touch and input ~= dragInput then
                return
            end
            if not wasDragged and clickCallback then
                clickCallback()
            end
            dragInput = nil
        end
    end)
end

-- ====================================================================
-- == AREXANS TOOLS - HWID AUTHENTICATION SYSTEM (REALTIME SYNC)    ==
-- ====================================================================

-- ================== CONFIG - FIXED API ==================
local API_BASE = "https://caecqqzbikmwroevvyrd.supabase.co/functions/v1"
local API_URL = API_BASE .. "/validate-key"
local API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZWNxcXpiaWttd3JvZXZ2eXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0Mjk5MzQsImV4cCI6MjEwMDAwNTkzNH0.B0lrXEa8TUc82yW6rGb024TUTyqYI3gMTuE2QU2XDQc"

local reqFunc = request or (syn and syn.request) or http_request or (HttpService and HttpService.RequestAsync)

-- ================== HWID GENERATOR ==================
local function generateHWID()
    local hwid = ""
    local userId = tostring(LocalPlayer.UserId)
    
    if gethwid then
        pcall(function() hwid = gethwid() end)
    elseif get_hwid then
        pcall(function() hwid = get_hwid() end)
    elseif syn and syn.hwid then
        pcall(function() hwid = syn.hwid() end)
    elseif getexecutorname then
        pcall(function() hwid = "RBLX-" .. userId .. "-" .. getexecutorname() end)
    else
        hwid = "RBLX-" .. userId
    end
    
    return hwid
end

-- ================== API VALIDATOR (REALTIME) ==================
local function validateKeyWithAPI(keyInput)
    local hwid = generateHWID()
    local username = LocalPlayer.Name
    
    local success, result = pcall(function()
        return reqFunc({
            Url = API_URL,
            Method = "POST",
            Headers = {
                ["Content-Type"] = "application/json",
                ["apikey"] = API_KEY,
                ["Authorization"] = "Bearer " .. API_KEY
            },
            Body = HttpService:JSONEncode({
                key = keyInput,
                hwid = hwid,
                robloxUsername = username
            })
        })
    end)
    
    if not success or not result then
        return {
            valid = false,
            error = "Connection Error",
            message = "Gagal terhubung ke server"
        }
    end
    
    local responseBody = result.Body or result
    local data = {}
    
    local decodeSuccess, decodeResult = pcall(function()
        return HttpService:JSONDecode(responseBody)
    end)
    
    if decodeSuccess then
        data = decodeResult
    else
        return {
            valid = false,
            error = "JSON Error",
            message = "Gagal membaca respon server"
        }
    end
    
    return data
end

local function authenticateUser(inputKey)
    local result = validateKeyWithAPI(inputKey)
    
    local function extractRole(res)
        if type(res) ~= "table" then return nil end
        if res.role then return res.role end
        local r = res.Role or res.ROLE or res.user_role or res.UserRole
        if r then return r end
        if type(res.data) == "table" then
            if res.data.role then return res.data.role end
            r = res.data.Role or res.data.ROLE or res.data.user_role or res.data.UserRole
            if r then return r end
        end
        return nil
    end

    local extractedRole = extractRole(result)

    if result.valid and result.success then
        if result.frozen then
            return false, {
                reason = "FROZEN",
                message = "Key dibekukan: " .. (result.frozenRemainingText or "Permanent"),
                frozenUntil = result.frozenUntil,
                frozenRemainingMs = result.frozenRemainingMs,
                role = extractedRole
            }
        end
        
        return true, {
            key = inputKey,
            role = extractedRole,
            timeRemainingMs = result.timeRemainingMs,
            timeRemainingText = result.timeRemainingText,
            daysRemaining = result.daysRemaining,
            hoursRemaining = result.hoursRemaining,
            minutesRemaining = result.minutesRemaining,
            secondsRemaining = result.secondsRemaining,
            expiredTimestamp = result.expiredTimestamp,
            expired = result.expired,
            hwidStatus = result.hwid_status,
            hwidCount = result.hwidCount,
            maxHwid = result.maxHwid,
            registeredHwids = result.registeredHwids,
            robloxUsers = result.robloxUsers,
            scriptUrl = result.scriptUrl or (API_BASE .. "/get-script?name=main"),
            message = "Akses diberikan"
        }
    elseif result.expired then
        return false, {
            reason = "EXPIRED",
            message = "Key expired: " .. (result.expiredAgoText or ""),
            expiredAt = result.expiredAt,
            role = extractedRole
        }
    elseif result.hwid_limit_reached then
        return false, {
            reason = "HWID_LIMIT",
            message = result.error or "Batas perangkat tercapai"
        }
    else
        return false, {
            reason = "INVALID",
            message = result.error or result.message or "Key tidak valid"
        }
    end
end

-- [[ SESSION MANAGEMENT ]]
local SAVE_FOLDER = "ArexansTools"
if isfolder and not isfolder(SAVE_FOLDER) then
    pcall(makefolder, SAVE_FOLDER)
end
local SESSION_SAVE_FILE = SAVE_FOLDER .. "/ArexansTools_Session.json"

local function saveSession(sessionData, userKey)
    if not writefile then return end
    local data = {
        key = userKey,
        role = sessionData.role,
        expiredTimestamp = sessionData.expiredTimestamp,
        savedAt = os.time()
    }
    pcall(function()
        writefile(SESSION_SAVE_FILE, HttpService:JSONEncode(data))
    end)
end

local function loadSession()
    if not readfile or not isfile or not isfile(SESSION_SAVE_FILE) then
        return nil
    end
    local success, content = pcall(readfile, SESSION_SAVE_FILE)
    if not success then return nil end

    local success2, data = pcall(HttpService.JSONDecode, HttpService, content)
    if not success2 or type(data) ~= "table" then return nil end

    return data.key
end

local function deleteSession()
    if isfile and isfile(SESSION_SAVE_FILE) and delfile then
        pcall(delfile, SESSION_SAVE_FILE)
    end
end

-- [[ LOAD AND RUN TOOL ]]
local function LoadAndRunTool(sessionData)
    local scriptUrl = sessionData.scriptUrl or (API_BASE .. "/get-script?name=main")
    local scriptContent = nil
    
    -- 1. Coba request dengan Headers API Key Supabase (mencegah HTTP 403)
    if reqFunc then
        pcall(function()
            local res = reqFunc({
                Url = scriptUrl,
                Method = "GET",
                Headers = {
                    ["apikey"] = API_KEY,
                    ["Authorization"] = "Bearer " .. API_KEY
                }
            })
            if res and res.Body then
                scriptContent = res.Body
            end
        end)
    end

    -- 2. Fallback ke game:HttpGet jika request tidak tersedia atau gagal
    if not scriptContent then
        pcall(function()
            scriptContent = game:HttpGet(scriptUrl)
        end)
    end

    if not scriptContent or scriptContent == "" then
        warn("[ArexansTools] Gagal mengunduh script (Cek koneksi / akses API)")
        return
    end

    local loadFunc, loadErr = loadstring(scriptContent)
    if not loadFunc then
        warn("[ArexansTools] Syntax error pada script tujuan: " .. tostring(loadErr))
        return
    end

    local success, result = pcall(loadFunc)
    if success and result then
        if type(result) == "function" then
            local runSuccess, err = pcall(result, {
                role = sessionData.role,
                timeRemainingMs = sessionData.timeRemainingMs,
                timeRemainingText = sessionData.timeRemainingText,
                daysRemaining = sessionData.daysRemaining,
                hoursRemaining = sessionData.hoursRemaining,
                hwidCount = sessionData.hwidCount,
                maxHwid = sessionData.maxHwid,
                robloxUsers = sessionData.robloxUsers,
                check_realtime = function()
                    if sessionData.key then
                        return validateKeyWithAPI(sessionData.key)
                    end
                    return nil
                end
            })
            
            if not runSuccess then
                warn("[ArexansTools] Failed to run tool: " .. tostring(err))
            end
        end
    else
        warn("[ArexansTools] Failed to execute script: " .. tostring(result))
    end
end

-- [[ KEY PROMPT GUI ]]
local function CreateKeyPromptGUI()
    local function RegisterButtonEffect(button, shouldFlash)
        if not button then return end
        
        button.AutoButtonColor = false
        local originalTransparency = button.BackgroundTransparency

        local uiScale = button:FindFirstChild("ButtonScaleEffect")
        if not uiScale then
            uiScale = Instance.new("UIScale")
            uiScale.Name = "ButtonScaleEffect"
            uiScale.Parent = button
        end
        
        button.MouseButton1Down:Connect(function()
            TweenService:Create(uiScale, TweenInfo.new(0.1), {Scale = 0.95}):Play()
            if shouldFlash then
                local targetTransparency = math.max(0, originalTransparency - 0.2)
                if originalTransparency >= 0.9 then targetTransparency = 0.4 end
                TweenService:Create(button, TweenInfo.new(0.1), {BackgroundTransparency = targetTransparency}):Play()
            end
        end)
        
        local function restore()
            TweenService:Create(uiScale, TweenInfo.new(0.1), {Scale = 1}):Play()
            if shouldFlash then
                TweenService:Create(button, TweenInfo.new(0.2), {BackgroundTransparency = originalTransparency}):Play()
            end
        end
        
        button.MouseButton1Up:Connect(restore)
        button.MouseLeave:Connect(restore)
    end

    local keyScreenGui = Instance.new("ScreenGui")
    keyScreenGui.Name = "ArexansKeySystemGUI"
    keyScreenGui.Parent = CoreGui
    keyScreenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    keyScreenGui.ResetOnSpawn = false

    local PromptFrame = Instance.new("Frame")
    PromptFrame.Name = "PromptFrame"
    PromptFrame.Size = UDim2.new(0, 280, 0, 150)
    PromptFrame.Position = UDim2.new(0.5, -140, 0.5, -75)
    PromptFrame.BackgroundColor3 = Color3.fromRGB(10, 10, 10)
    PromptFrame.BackgroundTransparency = 0.2
    PromptFrame.BorderSizePixel = 0
    PromptFrame.Parent = keyScreenGui

    local FrameCorner = Instance.new("UICorner")
    FrameCorner.CornerRadius = UDim.new(0, 8)
    FrameCorner.Parent = PromptFrame

    local BorderStroke = Instance.new("UIStroke")
    BorderStroke.Color = Color3.fromRGB(0, 150, 255)
    BorderStroke.Thickness = 3
    BorderStroke.Parent = PromptFrame

    local TitleBar = Instance.new("TextButton")
    TitleBar.Name = "TitleBar"
    TitleBar.Size = UDim2.new(1, 0, 0, 35)
    TitleBar.BackgroundTransparency = 1
    TitleBar.Text = ""
    TitleBar.AutoButtonColor = false
    TitleBar.Parent = PromptFrame

    local TitleLabel = Instance.new("TextLabel")
    TitleLabel.Size = UDim2.new(1, -40, 1, 0)
    TitleLabel.Position = UDim2.new(0, 10, 0, 0)
    TitleLabel.BackgroundTransparency = 1
    TitleLabel.Text = "Arexans Key System"
    TitleLabel.Font = Enum.Font.GothamBold
    TitleLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
    TitleLabel.TextSize = 16
    TitleLabel.TextXAlignment = Enum.TextXAlignment.Left
    TitleLabel.Parent = TitleBar

    local UIGradient = Instance.new("UIGradient")
    UIGradient.Color = ColorSequence.new({
        ColorSequenceKeypoint.new(0, Color3.fromRGB(0, 150, 255)),
        ColorSequenceKeypoint.new(0.5, Color3.fromRGB(0, 255, 255)),
        ColorSequenceKeypoint.new(1, Color3.fromRGB(0, 150, 255))
    })
    UIGradient.Rotation = 45
    UIGradient.Parent = TitleLabel

    task.spawn(function()
        while TitleLabel.Parent do
             local t = tick()
             UIGradient.Rotation = (t * 50) % 360
             RunService.Heartbeat:Wait()
        end
    end)

    local CloseButton = Instance.new("TextButton")
    CloseButton.Size = UDim2.new(0, 25, 0, 25)
    CloseButton.Position = UDim2.new(1, -30, 0.5, 0)
    CloseButton.AnchorPoint = Vector2.new(0, 0.5)
    CloseButton.BackgroundColor3 = Color3.fromRGB(200, 50, 50)
    CloseButton.BackgroundTransparency = 1
    CloseButton.Text = "X"
    CloseButton.Font = Enum.Font.GothamBold
    CloseButton.TextColor3 = Color3.fromRGB(255, 100, 100)
    CloseButton.TextSize = 16
    CloseButton.Parent = TitleBar
    Instance.new("UICorner", CloseButton).CornerRadius = UDim.new(0, 4)
    local CloseStroke = Instance.new("UIStroke", CloseButton)
    CloseStroke.Color = Color3.fromRGB(255, 100, 100)
    CloseStroke.Thickness = 1
    CloseStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    RegisterButtonEffect(CloseButton, true)
    CloseButton.MouseButton1Click:Connect(function()
        keyScreenGui:Destroy()
    end)

    local Separator = Instance.new("Frame")
    Separator.Size = UDim2.new(1, -20, 0, 1)
    Separator.Position = UDim2.new(0, 10, 0, 35)
    Separator.BackgroundColor3 = Color3.fromRGB(0, 150, 255)
    Separator.BackgroundTransparency = 0.5
    Separator.BorderSizePixel = 0
    Separator.Parent = PromptFrame

    local KeyBox = Instance.new("TextBox")
    KeyBox.Size = UDim2.new(1, -20, 0, 35)
    KeyBox.Position = UDim2.new(0, 10, 0, 45)
    KeyBox.BackgroundColor3 = Color3.fromRGB(30, 30, 40)
    KeyBox.BackgroundTransparency = 1
    KeyBox.TextColor3 = Color3.fromRGB(0, 150, 255)
    KeyBox.PlaceholderText = "Masukkan key..."
    KeyBox.PlaceholderColor3 = Color3.fromRGB(0, 100, 180)
    KeyBox.Text = ""
    KeyBox.Font = Enum.Font.GothamBold
    KeyBox.TextSize = 14
    KeyBox.ClearTextOnFocus = false
    KeyBox.Parent = PromptFrame
    Instance.new("UICorner", KeyBox).CornerRadius = UDim.new(0, 6)
    local KeyStroke = Instance.new("UIStroke", KeyBox)
    KeyStroke.Color = Color3.fromRGB(0, 150, 255)
    KeyStroke.Thickness = 1
    KeyStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border

    local ButtonsFrame = Instance.new("Frame")
    ButtonsFrame.Size = UDim2.new(1, -20, 0, 35)
    ButtonsFrame.Position = UDim2.new(0, 10, 0, 90)
    ButtonsFrame.BackgroundTransparency = 1
    ButtonsFrame.Parent = PromptFrame

    local GetKeyButton = Instance.new("TextButton")
    GetKeyButton.Size = UDim2.new(0.48, 0, 1, 0)
    GetKeyButton.BackgroundColor3 = Color3.fromRGB(0, 150, 255)
    GetKeyButton.BackgroundTransparency = 1
    GetKeyButton.Text = "Get Key"
    GetKeyButton.Font = Enum.Font.GothamBold
    GetKeyButton.TextColor3 = Color3.fromRGB(0, 150, 255)
    GetKeyButton.TextSize = 14
    GetKeyButton.Parent = ButtonsFrame
    Instance.new("UICorner", GetKeyButton).CornerRadius = UDim.new(0, 6)
    local GetKeyStroke = Instance.new("UIStroke", GetKeyButton)
    GetKeyStroke.Color = Color3.fromRGB(0, 150, 255)
    GetKeyStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border

    local LoginButton = Instance.new("TextButton")
    LoginButton.Size = UDim2.new(0.48, 0, 1, 0)
    LoginButton.Position = UDim2.new(0.52, 0, 0, 0)
    LoginButton.BackgroundColor3 = Color3.fromRGB(0, 150, 255)
    LoginButton.BackgroundTransparency = 1
    LoginButton.Text = "Login"
    LoginButton.Font = Enum.Font.GothamBold
    LoginButton.TextColor3 = Color3.fromRGB(0, 150, 255)
    LoginButton.TextSize = 14
    LoginButton.Parent = ButtonsFrame
    Instance.new("UICorner", LoginButton).CornerRadius = UDim.new(0, 6)
    local LoginStroke = Instance.new("UIStroke", LoginButton)
    LoginStroke.Color = Color3.fromRGB(0, 150, 255)
    LoginStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border

    local StatusLabel = Instance.new("TextLabel")
    StatusLabel.Size = UDim2.new(1, -20, 0, 20)
    StatusLabel.Position = UDim2.new(0, 10, 1, -25)
    StatusLabel.BackgroundTransparency = 1
    StatusLabel.Text = ""
    StatusLabel.Font = Enum.Font.GothamBold
    StatusLabel.TextColor3 = Color3.fromRGB(0, 150, 255)
    StatusLabel.TextSize = 14
    StatusLabel.Parent = PromptFrame

    pcall(function()
        MakeDraggable(PromptFrame, TitleBar, function() return true end, nil)
    end)

    RegisterButtonEffect(GetKeyButton, true)
    RegisterButtonEffect(LoginButton, true)

    GetKeyButton.MouseButton1Click:Connect(function()
        if setclipboard then
            setclipboard("https://tools.arexans.my.id")
            StatusLabel.Text = "Link disalin!"
            StatusLabel.TextColor3 = Color3.fromRGB(100, 255, 100)
        else
            StatusLabel.Text = "Clipboard tidak didukung"
            StatusLabel.TextColor3 = Color3.fromRGB(255, 100, 100)
        end
    end)

    local function attemptLogin()
        local enteredKey = KeyBox.Text
        if enteredKey == "" then
            StatusLabel.Text = "Masukkan key terlebih dahulu"
            StatusLabel.TextColor3 = Color3.fromRGB(255, 200, 50)
            return
        end

        StatusLabel.Text = "Memvalidasi..."
        StatusLabel.TextColor3 = Color3.fromRGB(255, 255, 100)
        LoginButton.Text = "..."
        
        task.spawn(function()
            local isValid, result = authenticateUser(enteredKey)

            if isValid then
                StatusLabel.Text = (result.role or "Member") .. " | " .. (result.timeRemainingText or "Active")
                StatusLabel.TextColor3 = Color3.fromRGB(100, 255, 100)
                
                pcall(saveSession, result, enteredKey)
                
                task.wait(0.5)
                keyScreenGui:Destroy()
                LoadAndRunTool(result)
            else
                LoginButton.Text = "Login"
                StatusLabel.TextColor3 = Color3.fromRGB(255, 100, 100)
                
                if result.reason == "FROZEN" then
                    StatusLabel.Text = result.message
                elseif result.reason == "EXPIRED" then
                    StatusLabel.Text = result.message
                elseif result.reason == "HWID_LIMIT" then
                    StatusLabel.Text = result.message
                else
                    StatusLabel.Text = (result.message or "Key tidak valid")
                end
            end
        end)
    end

    LoginButton.MouseButton1Click:Connect(attemptLogin)

    KeyBox.FocusLost:Connect(function(enterPressed)
        if enterPressed then
            attemptLogin()
        end
    end)
end

-- ====================================================================
-- == MAIN STARTUP LOGIC                                             ==
-- ====================================================================
local savedKey = loadSession()

if savedKey then
    local isValid, result = authenticateUser(savedKey)
    
    if isValid then
        pcall(saveSession, result, savedKey)
        LoadAndRunTool(result)
    else
        deleteSession()
        CreateKeyPromptGUI()
    end
else
    CreateKeyPromptGUI()
end