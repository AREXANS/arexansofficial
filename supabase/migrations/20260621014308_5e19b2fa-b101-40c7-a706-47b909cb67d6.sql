-- =========================================================
-- 1) MAIN: remove 🌐 / 🔐 buttons and expose fetcher to _G
-- =========================================================
UPDATE public.lua_scripts
SET content = replace(
  content,
  $OLD1$        local webPublicButton = UI.createIconButton(controlButtonsFrame, "🌐", Color3.fromRGB(0, 220, 255), 22)
        local webMineButton = UI.createIconButton(controlButtonsFrame, "🔐", Color3.fromRGB(180, 120, 255), 22)
        local joinButton$OLD1$,
  $NEW1$        local joinButton$NEW1$
)
WHERE name = 'main';

UPDATE public.lua_scripts
SET content = replace(
  content,
  $OLD2$        webPublicButton.MouseButton1Click:Connect(function()
            importRecordingsFromWeb("public")
        end)

        webMineButton.MouseButton1Click:Connect(function()
            importRecordingsFromWeb("mine")
        end)

        importButton.MouseButton1Click:Connect(function()$OLD2$,
  $NEW2$        importButton.MouseButton1Click:Connect(function()$NEW2$
)
WHERE name = 'main';

UPDATE public.lua_scripts
SET content = replace(
  content,
  $OLD3$    local function importRecordingsFromWeb(scope)$OLD3$,
  $NEW3$    _G.ArexansFetchWebRecordings = fetchWebRecordingsRaw
    local function importRecordingsFromWeb(scope)$NEW3$
)
WHERE name = 'main';

-- =========================================================
-- 2) LIBRARY: add My record / Public / All tabs to picker
-- =========================================================
UPDATE public.lua_scripts
SET content = replace(
  content,
  $OLDA$function UI.showRecordingFilePicker(RECORDING_FOLDER, callback)$OLDA$,
  $NEWA$function UI.showRecordingFilePicker(RECORDING_FOLDER, callback, options)$NEWA$
)
WHERE name = 'library';

UPDATE public.lua_scripts
SET content = replace(
  content,
  $OLDB$    -- Fitur URL Download dan tombol unduh dihapus.

    populateFiles("") -- Initial population$OLDB$,
  $NEWB$    -- ==== Tabs integrasi website: My record / Public / All ====
    FileListContainer.Position = UDim2.new(0, 10, 0, 100)
    FileListContainer.Size = UDim2.new(1, -20, 1, -110)

    local TabsFrame = Instance.new("Frame", Frame)
    TabsFrame.Size = UDim2.new(1, -20, 0, 22)
    TabsFrame.Position = UDim2.new(0, 10, 0, 70)
    TabsFrame.BackgroundTransparency = 1
    local tlay = Instance.new("UIListLayout", TabsFrame)
    tlay.FillDirection = Enum.FillDirection.Horizontal
    tlay.HorizontalAlignment = Enum.HorizontalAlignment.Center
    tlay.Padding = UDim.new(0, 6)

    local tabButtons = {}
    local switchMode, populateWeb
    local activeMode = "public"

    local function makeTab(label, mode)
        local b = Instance.new("TextButton", TabsFrame)
        b.Size = UDim2.new(0, 70, 1, 0)
        b.BackgroundColor3 = Color3.fromRGB(35, 35, 55)
        b.Text = label
        b.TextColor3 = Color3.fromRGB(200, 200, 220)
        b.Font = Enum.Font.SourceSansBold
        b.TextSize = 12
        b.AutoButtonColor = false
        Instance.new("UICorner", b).CornerRadius = UDim.new(0, 4)
        tabButtons[mode] = b
        b.MouseButton1Click:Connect(function() switchMode(mode) end)
    end
    makeTab("My record", "mine")
    makeTab("Public", "public")
    makeTab("All", "all")

    populateWeb = function(scope, filter)
        filter = filter and filter:lower() or ""
        for _, child in ipairs(FileListContainer:GetChildren()) do
            if not (child:IsA("UIListLayout") or child:IsA("UIPadding")) then child:Destroy() end
        end
        local loading = Instance.new("TextLabel", FileListContainer)
        loading.Size = UDim2.new(1, 0, 0, 25); loading.BackgroundTransparency = 1
        loading.Text = "Memuat rekaman dari website..."
        loading.TextColor3 = Color3.fromRGB(200, 220, 255)
        loading.Font = Enum.Font.SourceSans; loading.TextSize = 12

        task.spawn(function()
            local fetcher = (options and options.fetchWeb) or _G.ArexansFetchWebRecordings
            if type(fetcher) ~= "function" then
                loading.Text = "Integrasi web tidak tersedia."
                loading.TextColor3 = Color3.fromRGB(255, 150, 150)
                return
            end
            local ok, list = fetcher(scope)
            if loading and loading.Parent then loading:Destroy() end
            if not ok then
                local e = Instance.new("TextLabel", FileListContainer)
                e.Size = UDim2.new(1, 0, 0, 25); e.BackgroundTransparency = 1
                e.Text = tostring(list or "Gagal memuat.")
                e.TextColor3 = Color3.fromRGB(255, 150, 150)
                e.Font = Enum.Font.SourceSans; e.TextSize = 12
                return
            end
            local shown = 0
            for _, rec in ipairs(list or {}) do
                local title = tostring(rec.title or "Tanpa judul")
                if filter == "" or title:lower():find(filter, 1, true) then
                    shown = shown + 1
                    local itemFrame = Instance.new("Frame", FileListContainer)
                    itemFrame.Size = UDim2.new(1, 0, 0, 25); itemFrame.BackgroundTransparency = 1
                    local fb = Instance.new("TextButton", itemFrame)
                    fb.Size = UDim2.new(1, 0, 1, 0)
                    fb.BackgroundColor3 = rec.owned and Color3.fromRGB(50, 40, 80) or Color3.fromRGB(40, 50, 70)
                    fb.Text = (rec.owned and "[Saya] " or "[Public] ") .. title
                    fb.TextColor3 = Color3.new(1, 1, 1)
                    fb.Font = Enum.Font.SourceSans; fb.TextSize = 12
                    fb.TextXAlignment = Enum.TextXAlignment.Left
                    Instance.new("UIPadding", fb).PaddingLeft = UDim.new(0, 5)
                    Instance.new("UICorner", fb).CornerRadius = UDim.new(0, 4)
                    fb.MouseButton1Click:Connect(function()
                        callback(title, true, rec)
                        if ScreenGui and ScreenGui.Parent then ScreenGui:Destroy() end
                    end)
                end
            end
            if shown == 0 then
                local n = Instance.new("TextLabel", FileListContainer)
                n.Size = UDim2.new(1, 0, 0, 25); n.BackgroundTransparency = 1
                n.Text = "Tidak ada rekaman."
                n.TextColor3 = Color3.fromRGB(200, 200, 200)
                n.Font = Enum.Font.SourceSans; n.TextSize = 12
            end
        end)
    end

    switchMode = function(mode)
        activeMode = mode
        for k, b in pairs(tabButtons) do
            b.BackgroundColor3 = (k == mode) and Color3.fromRGB(0, 130, 200) or Color3.fromRGB(35, 35, 55)
            b.TextColor3 = (k == mode) and Color3.fromRGB(255, 255, 255) or Color3.fromRGB(200, 200, 220)
        end
        populateWeb(mode, SearchBox.Text)
    end

    -- Override search to drive web mode
    SearchBox:GetPropertyChangedSignal("Text"):Connect(function()
        populateWeb(activeMode, SearchBox.Text)
    end)

    switchMode("public")$NEWB$
)
WHERE name = 'library';

-- =========================================================
-- 3) Drop legacy search→local-populate handler (now overridden above)
--    Remove the duplicated original line so it doesn't override our web tab handler.
-- =========================================================
UPDATE public.lua_scripts
SET content = replace(
  content,
  $OLDC$    SearchBox:GetPropertyChangedSignal("Text"):Connect(function()
        populateFiles(SearchBox.Text)
    end)
    

$OLDC$,
  $NEWC$
$NEWC$
)
WHERE name = 'library';

-- Re-snapshot disabled — trigger already handles version history.
