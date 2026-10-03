import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Copy, Code, MessageSquare, Gamepad2, Globe, Server, FileJson, PlusCircle, Pencil, Trash2, CheckCircle } from 'lucide-react';

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const ApiDocumentation = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'whatsapp' | 'roblox' | 'javascript'>('overview');

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Disalin!', description: `${label} berhasil disalin ke clipboard` });
  };

  const codeBlocks = {
    getAllKeys: `// GET ALL KEYS - Mengambil semua data key
async function getAllKeys() {
  const response = await fetch('${API_BASE}/get-keys');
  const data = await response.json();
  
  console.log('Total keys:', data.count);
  console.log('Keys:', data.keys);
  
  // Response format:
  // {
  //   keys: [
  //     {
  //       key: "AXSTOOLS-XXXX-XXXX",
  //       expired: "2026-01-30T00:00:00.000Z",
  //       created: "2026-01-20T00:00:00.000Z",
  //       role: "VIP",
  //       maxHwid: 1,
  //       Freeze: false,
  //       frozenUntil: null,
  //       frozenRemainingMs: null,
  //       hwids: ["hwid-1", "hwid-2"],
  //       robloxUsers: [
  //         { 
  //           hwid: "hwid-1", 
  //           username: "Player1", 
  //           registeredAt: "2026-01-21T06:59:04.478Z" 
  //         }
  //       ]
  //     }
  //   ],
  //   count: 1
  // }
  
  return data;
}

// DELETE ALL KEYS - Menghapus semua key
async function deleteAllKeys() {
  const allKeys = await getAllKeys();
  const results = { success: 0, failed: 0 };
  
  for (const keyItem of allKeys.keys) {
    try {
      const res = await fetch('${API_BASE}/delete-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: keyItem.key })
      });
      const data = await res.json();
      if (data.success) results.success++;
      else results.failed++;
    } catch {
      results.failed++;
    }
  }
  
  console.log('Delete All Result:', results);
  return results;
}`,

    createKey: `// CREATE KEY - Membuat key baru
async function createKey(options = {}) {
  const response = await fetch('${API_BASE}/create-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: options.key || '',  // Kosong = auto generate AXSTOOLS-XXXX-XXXX
      role: options.role || 'VIP',  // Developer, VIP, NORMAL, Free
      expired: options.expired || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      max_hwid: options.maxHwid || 1,
      Freeze: options.freeze || false  // Status freeze awal
    })
  });
  
  const result = await response.json();
  // Response: { success: true, key: "AXSTOOLS-XXXX-XXXX", message: "..." }
  // atau: { success: false, error: "..." }
  
  return result;
}

// Contoh penggunaan:
await createKey(); // Auto generate key VIP 7 hari
await createKey({ role: 'Developer', maxHwid: 3 }); // Developer dengan 3 HWID
await createKey({ key: 'CUSTOM-KEY-123', expired: '2026-12-31T23:59:59Z' });
await createKey({ key: 'axstoolsdev', role: 'Developer', maxHwid: 1, freeze: false });`,

    updateKey: `// UPDATE KEY - Mengubah data key
async function updateKey(keyName, updates) {
  const response = await fetch('${API_BASE}/update-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: keyName,
      ...updates
    })
  });
  
  return await response.json();
}

// Contoh penggunaan:

// Mengubah role
await updateKey('AXSTOOLS-XXXX-XXXX', { role: 'Developer' });

// Memperpanjang expired
await updateKey('AXSTOOLS-XXXX-XXXX', { 
  expired: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() 
});

// Rename key
await updateKey('AXSTOOLS-XXXX-XXXX', { newKey: 'PREMIUM-USER-001' });

// Reset HWID dan Roblox Users
await updateKey('AXSTOOLS-XXXX-XXXX', { hwids: [], robloxUsers: [] });

// ============ FREEZE CONTROL ============

// Freeze key (pause expiry countdown)
// Saat di-freeze, sisa waktu disimpan dan countdown berhenti
const keyInfo = await getKeyInfo('AXSTOOLS-XXXX-XXXX');
const now = new Date();
const expiredDate = new Date(keyInfo.expired);
const remainingMs = expiredDate.getTime() - now.getTime();

await updateKey('AXSTOOLS-XXXX-XXXX', { 
  Freeze: true,
  frozenUntil: now.toISOString(),
  frozenRemainingMs: remainingMs > 0 ? remainingMs : 0
});

// Unfreeze key (resume expiry countdown)
// Saat di-unfreeze, expired dihitung ulang dari sisa waktu
const keyData = await getKeyInfo('AXSTOOLS-XXXX-XXXX');
const frozenRemainingMs = keyData.frozenRemainingMs || 0;
const newExpiry = new Date(Date.now() + frozenRemainingMs);

await updateKey('AXSTOOLS-XXXX-XXXX', { 
  Freeze: false,
  frozenUntil: null,
  frozenRemainingMs: null,
  expired: newExpiry.toISOString()
});

// Toggle freeze status
async function toggleFreeze(keyName) {
  const keys = await getAllKeys();
  const keyData = keys.keys.find(k => k.key === keyName);
  
  if (!keyData) return { success: false, error: 'Key not found' };
  
  if (keyData.Freeze || keyData.frozenUntil) {
    // Unfreeze
    const remainingMs = keyData.frozenRemainingMs || 0;
    return await updateKey(keyName, {
      Freeze: false,
      frozenUntil: null,
      frozenRemainingMs: null,
      expired: new Date(Date.now() + remainingMs).toISOString()
    });
  } else {
    // Freeze
    const now = new Date();
    const expiredDate = new Date(keyData.expired);
    const remainingMs = expiredDate.getTime() - now.getTime();
    return await updateKey(keyName, {
      Freeze: true,
      frozenUntil: now.toISOString(),
      frozenRemainingMs: remainingMs > 0 ? remainingMs : 0
    });
  }
}`,

    deleteKey: `// DELETE KEY - Menghapus key
async function deleteKey(keyName) {
  const response = await fetch('${API_BASE}/delete-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: keyName })
  });
  
  return await response.json();
  // Response: { success: true, message: "Key deleted" }
}

await deleteKey('AXSTOOLS-XXXX-XXXX');`,

    validateKey: `// VALIDATE KEY - Validasi dan registrasi HWID
async function validateKey(keyName, hwid, username) {
  const response = await fetch('${API_BASE}/validate-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: keyName,
      hwid: hwid,
      username: username
    })
  });
  
  const result = await response.json();
  // Response sukses: { valid: true, role: "VIP" }
  // Response gagal: { valid: false, error: "Key expired" / "Max HWID reached" / "Key not found" }
  
  return result;
}`,

    whatsappBot: `// ========================================
// WHATSAPP BOT INTEGRATION (Node.js)
// ========================================
// Menggunakan library: whatsapp-web.js atau baileys

const { Client } = require('whatsapp-web.js');
const axios = require('axios');

const API_BASE = '${API_BASE}';

// Inisialisasi WhatsApp client
const client = new Client();

client.on('ready', () => {
  console.log('WhatsApp Bot Ready!');
});

client.on('message', async (msg) => {
  const text = msg.body.toLowerCase();
  const sender = msg.from;

  // Command: !cekkey AXSTOOLS-XXXX-XXXX
  if (text.startsWith('!cekkey ')) {
    const key = msg.body.split(' ')[1];
    
    try {
      const res = await axios.get(\`\${API_BASE}/get-keys\`);
      const foundKey = res.data.keys.find(k => k.key === key);
      
      if (foundKey) {
        const expired = new Date(foundKey.expired);
        const now = new Date();
        const diff = expired - now;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        msg.reply(\`✅ *KEY VALID*
🔑 Key: \${foundKey.key}
👤 Role: \${foundKey.role}
📅 Expired: \${expired.toLocaleString('id-ID')}
⏰ Sisa: \${days} hari \${hours} jam
💻 HWID: \${foundKey.hwids.length}/\${foundKey.maxHwid}
🎮 Users: \${foundKey.robloxUsers.map(u => u.username).join(', ') || '-'}\`);
      } else {
        msg.reply('❌ Key tidak ditemukan!');
      }
    } catch (error) {
      msg.reply('❌ Gagal mengecek key: ' + error.message);
    }
  }

  // Command: !createkey [role] [days]
  if (text.startsWith('!createkey')) {
    const parts = msg.body.split(' ');
    const role = parts[1] || 'VIP';
    const days = parseInt(parts[2]) || 7;
    
    try {
      const res = await axios.post(\`\${API_BASE}/create-key\`, {
        key: '', // Auto generate
        role: role,
        expired: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        max_hwid: 1
      });
      
      if (res.data.success) {
        msg.reply(\`✅ *KEY BERHASIL DIBUAT*
🔑 Key: \${res.data.key}
👤 Role: \${role}
📅 Durasi: \${days} hari\`);
      } else {
        msg.reply('❌ Gagal membuat key: ' + res.data.error);
      }
    } catch (error) {
      msg.reply('❌ Error: ' + error.message);
    }
  }

  // Command: !deletekey AXSTOOLS-XXXX-XXXX
  if (text.startsWith('!deletekey ')) {
    const key = msg.body.split(' ')[1];
    
    try {
      const res = await axios.post(\`\${API_BASE}/delete-key\`, { key });
      
      if (res.data.success) {
        msg.reply('✅ Key berhasil dihapus!');
      } else {
        msg.reply('❌ Gagal: ' + res.data.error);
      }
    } catch (error) {
      msg.reply('❌ Error: ' + error.message);
    }
  }

  // Command: !resethwid AXSTOOLS-XXXX-XXXX
  if (text.startsWith('!resethwid ')) {
    const key = msg.body.split(' ')[1];
    
    try {
      const res = await axios.post(\`\${API_BASE}/update-key\`, {
        key: key,
        hwids: [],
        robloxUsers: []
      });
      
      if (res.data.success) {
        msg.reply('✅ HWID berhasil direset!');
      } else {
        msg.reply('❌ Gagal: ' + res.data.error);
      }
    } catch (error) {
      msg.reply('❌ Error: ' + error.message);
    }
  }

  // Command: !listkeys
  if (text === '!listkeys') {
    try {
      const res = await axios.get(\`\${API_BASE}/get-keys\`);
      const keys = res.data.keys.slice(0, 10); // Max 10 keys
      
      let message = \`📋 *DAFTAR KEY (\${res.data.count} total)*\\n\\n\`;
      keys.forEach((k, i) => {
        message += \`\${i+1}. \${k.key}\\n   Role: \${k.role} | HWID: \${k.hwids.length}/\${k.maxHwid}\\n\\n\`;
      });
      
      msg.reply(message);
    } catch (error) {
      msg.reply('❌ Error: ' + error.message);
    }
  }

  // Command: !help
  if (text === '!help') {
    msg.reply(\`🤖 *AXS KEY SYSTEM BOT*

*Commands:*
!cekkey <key> - Cek status key
!createkey [role] [days] - Buat key baru
!deletekey <key> - Hapus key
!resethwid <key> - Reset HWID
!listkeys - Lihat daftar key

*Roles:* Developer, VIP, NORMAL, Free\`);
  }
});

client.initialize();`,

    robloxScript: `-- ========================================
-- ROBLOX LUA SCRIPT - KEY VALIDATION
-- Dengan Freeze Status & HWID Support
-- ========================================

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer

-- ================== CONFIG ==================
local API_URL = "${API_BASE}/validate-key"
local API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2bm9ldWd5dWNkYW55anNya3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTIyNzMsImV4cCI6MjA4NDE2ODI3M30.qBkL2oZCpwYcAwRRXo_LhoaawarDwWec2DIxLpHxSRY"

-- ================== HWID GENERATOR ==================
local function generateHWID()
    local hwid = ""
    local userId = tostring(LocalPlayer.UserId)
    
    -- Coba dapatkan HWID dari executor
    if gethwid then
        pcall(function()
            hwid = gethwid()
        end)
    elseif get_hwid then
        pcall(function()
            hwid = get_hwid()
        end)
    elseif syn and syn.hwid then
        pcall(function()
            hwid = syn.hwid()
        end)
    elseif getexecutorname then
        pcall(function()
            hwid = "RBLX-" .. userId .. "-" .. getexecutorname()
        end)
    else
        -- Fallback menggunakan UserId
        hwid = "RBLX-" .. userId
    end
    
    return hwid
end

-- ================== API VALIDATOR ==================
local function validateKeyWithAPI(keyInput)
    local hwid = generateHWID()
    local username = LocalPlayer.Name
    
    -- Gunakan request function yang tersedia
    local reqFunc = request or syn.request or http_request or HttpService.RequestAsync
    
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
    
    if not success then
        return {
            valid = false,
            error = "Connection Error",
            message = "Gagal terhubung ke server"
        }
    end
    
    local responseBody = result.Body or result
    local data = HttpService:JSONDecode(responseBody)
    
    return data
end

-- ================== MAIN VALIDATION ==================
local function validateAndExecute(keyInput)
    print("=" .. string.rep("=", 40))
    print("🔐 AXS KEY SYSTEM - Validating...")
    print("=" .. string.rep("=", 40))
    
    local result = validateKeyWithAPI(keyInput)
    
    if result.valid then
        -- Cek apakah key dibekukan (freeze)
        if result.frozen then
            warn("=" .. string.rep("=", 40))
            warn("🥶 KEY FROZEN / DIBEKUKAN!")
            warn("=" .. string.rep("=", 40))
            warn("⏸️ Key Anda sedang dibekukan")
            if result.frozenUntil then
                warn("📅 Frozen Until: " .. tostring(result.frozenUntil))
            end
            warn("💡 Hubungi admin untuk membuka freeze")
            warn("=" .. string.rep("=", 40))
            
            return {
                success = false,
                reason = "FROZEN",
                message = "Key sedang dibekukan oleh admin"
            }
        end
        
        -- Key valid dan tidak frozen
        print("=" .. string.rep("=", 40))
        print("✅ KEY VALID!")
        print("=" .. string.rep("=", 40))
        print("🔑 Key: " .. keyInput)
        print("👤 Role: " .. tostring(result.role))
        print("🎮 Username: " .. LocalPlayer.Name)
        print("💻 HWID Registered: " .. tostring(result.hwid))
        
        if result.daysRemaining then
            print("📅 Sisa Waktu: " .. tostring(result.daysRemaining) .. " hari")
        end
        
        print("=" .. string.rep("=", 40))
        
        -- Script URL diambil dari response API (dikonfigurasi di dashboard admin)
        if result.scriptUrl then
            print("📦 Loading script from server config...")
            local scriptSuccess, scriptError = pcall(function()
                loadstring(game:HttpGet(result.scriptUrl))()
            end)
            
            if not scriptSuccess then
                warn("⚠️ Error loading script: " .. tostring(scriptError))
            end
        else
            print("ℹ️ Script akan dijalankan sesuai konfigurasi server")
        end
        
        return {
            success = true,
            role = result.role,
            message = "Akses diberikan"
        }
    else
        -- Key invalid
        warn("=" .. string.rep("=", 40))
        warn("❌ KEY INVALID!")
        warn("=" .. string.rep("=", 40))
        warn("Error: " .. tostring(result.error or result.message or "Unknown error"))
        warn("=" .. string.rep("=", 40))
        
        return {
            success = false,
            reason = "INVALID",
            message = result.error or result.message or "Key tidak valid"
        }
    end
end

-- ================== KEY INPUT UI ==================
local function createKeyUI()
    local ScreenGui = Instance.new("ScreenGui")
    local MainFrame = Instance.new("Frame")
    local UICorner = Instance.new("UICorner")
    local Title = Instance.new("TextLabel")
    local KeyInput = Instance.new("TextBox")
    local ValidateBtn = Instance.new("TextButton")
    local StatusLabel = Instance.new("TextLabel")
    local CloseBtn = Instance.new("TextButton")
    
    ScreenGui.Name = "AXSKeySystem"
    ScreenGui.Parent = game.CoreGui
    ScreenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    
    MainFrame.Name = "MainFrame"
    MainFrame.Size = UDim2.new(0, 320, 0, 200)
    MainFrame.Position = UDim2.new(0.5, -160, 0.5, -100)
    MainFrame.BackgroundColor3 = Color3.fromRGB(25, 25, 35)
    MainFrame.BorderSizePixel = 0
    MainFrame.Parent = ScreenGui
    MainFrame.Active = true
    MainFrame.Draggable = true
    
    UICorner.CornerRadius = UDim.new(0, 12)
    UICorner.Parent = MainFrame
    
    Title.Size = UDim2.new(1, -40, 0, 40)
    Title.Position = UDim2.new(0, 20, 0, 0)
    Title.BackgroundTransparency = 1
    Title.Text = "🔐 AXS KEY SYSTEM"
    Title.TextColor3 = Color3.fromRGB(255, 215, 0)
    Title.Font = Enum.Font.GothamBold
    Title.TextSize = 18
    Title.TextXAlignment = Enum.TextXAlignment.Left
    Title.Parent = MainFrame
    
    CloseBtn.Size = UDim2.new(0, 30, 0, 30)
    CloseBtn.Position = UDim2.new(1, -35, 0, 5)
    CloseBtn.BackgroundColor3 = Color3.fromRGB(200, 50, 50)
    CloseBtn.Text = "X"
    CloseBtn.TextColor3 = Color3.new(1, 1, 1)
    CloseBtn.Font = Enum.Font.GothamBold
    CloseBtn.TextSize = 14
    CloseBtn.Parent = MainFrame
    Instance.new("UICorner", CloseBtn).CornerRadius = UDim.new(0, 6)
    
    CloseBtn.MouseButton1Click:Connect(function()
        ScreenGui:Destroy()
    end)
    
    KeyInput.Size = UDim2.new(0.9, 0, 0, 40)
    KeyInput.Position = UDim2.new(0.05, 0, 0, 50)
    KeyInput.BackgroundColor3 = Color3.fromRGB(40, 40, 55)
    KeyInput.BorderSizePixel = 0
    KeyInput.TextColor3 = Color3.new(1, 1, 1)
    KeyInput.PlaceholderText = "Enter your key..."
    KeyInput.PlaceholderColor3 = Color3.fromRGB(150, 150, 150)
    KeyInput.Font = Enum.Font.Code
    KeyInput.TextSize = 14
    KeyInput.ClearTextOnFocus = false
    KeyInput.Parent = MainFrame
    Instance.new("UICorner", KeyInput).CornerRadius = UDim.new(0, 8)
    
    ValidateBtn.Size = UDim2.new(0.9, 0, 0, 40)
    ValidateBtn.Position = UDim2.new(0.05, 0, 0, 100)
    ValidateBtn.BackgroundColor3 = Color3.fromRGB(0, 170, 127)
    ValidateBtn.BorderSizePixel = 0
    ValidateBtn.Text = "✓ VALIDATE KEY"
    ValidateBtn.TextColor3 = Color3.new(1, 1, 1)
    ValidateBtn.Font = Enum.Font.GothamBold
    ValidateBtn.TextSize = 14
    ValidateBtn.Parent = MainFrame
    Instance.new("UICorner", ValidateBtn).CornerRadius = UDim.new(0, 8)
    
    StatusLabel.Size = UDim2.new(0.9, 0, 0, 30)
    StatusLabel.Position = UDim2.new(0.05, 0, 0, 150)
    StatusLabel.BackgroundTransparency = 1
    StatusLabel.Text = ""
    StatusLabel.TextColor3 = Color3.fromRGB(200, 200, 200)
    StatusLabel.Font = Enum.Font.Gotham
    StatusLabel.TextSize = 12
    StatusLabel.TextWrapped = true
    StatusLabel.Parent = MainFrame
    
    ValidateBtn.MouseButton1Click:Connect(function()
        local key = KeyInput.Text
        
        if key == "" then
            StatusLabel.TextColor3 = Color3.fromRGB(255, 100, 100)
            StatusLabel.Text = "❌ Masukkan key terlebih dahulu!"
            return
        end
        
        ValidateBtn.Text = "⏳ Validating..."
        ValidateBtn.BackgroundColor3 = Color3.fromRGB(100, 100, 100)
        StatusLabel.TextColor3 = Color3.fromRGB(200, 200, 200)
        StatusLabel.Text = "Menghubungi server..."
        
        local result = validateAndExecute(key)
        
        if result.success then
            ValidateBtn.BackgroundColor3 = Color3.fromRGB(0, 200, 100)
            ValidateBtn.Text = "✅ VALID - " .. result.role
            StatusLabel.TextColor3 = Color3.fromRGB(100, 255, 100)
            StatusLabel.Text = "Akses diberikan! Role: " .. result.role
            
            wait(2)
            ScreenGui:Destroy()
        else
            if result.reason == "FROZEN" then
                ValidateBtn.BackgroundColor3 = Color3.fromRGB(100, 150, 255)
                ValidateBtn.Text = "🥶 KEY FROZEN"
                StatusLabel.TextColor3 = Color3.fromRGB(100, 150, 255)
                StatusLabel.Text = "Key dibekukan! Hubungi admin."
            else
                ValidateBtn.BackgroundColor3 = Color3.fromRGB(200, 50, 50)
                ValidateBtn.Text = "❌ INVALID"
                StatusLabel.TextColor3 = Color3.fromRGB(255, 100, 100)
                StatusLabel.Text = result.message
            end
            
            wait(3)
            ValidateBtn.BackgroundColor3 = Color3.fromRGB(0, 170, 127)
            ValidateBtn.Text = "✓ VALIDATE KEY"
        end
    end)
    
    return ScreenGui
end

-- ================== PENGGUNAAN ==================
-- Pilih salah satu metode:

-- Metode 1: Langsung validasi dengan key
-- local result = validateAndExecute("AXSTOOLS-XXXX-XXXX")

-- Metode 2: Tampilkan UI input key
createKeyUI()`
  };

  const TabButton = ({ id, label, icon: Icon }: { id: typeof activeTab; label: string; icon: any }) => (
    <Button
      variant={activeTab === id ? 'default' : 'outline'}
      className="gap-2"
      onClick={() => setActiveTab(id)}
    >
      <Icon className="w-4 h-4" />
      {label}
    </Button>
  );

  const CodeBlock = ({ code, label }: { code: string; label: string }) => (
    <div className="relative group">
      <pre className="bg-muted/50 p-4 rounded-lg overflow-x-auto text-xs font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">
        {code}
      </pre>
      <Button
        size="sm"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => copyToClipboard(code, label)}
      >
        <Copy className="w-4 h-4 mr-1" />
        Salin
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <div className="flex flex-wrap gap-2">
        <TabButton id="overview" label="Overview" icon={Globe} />
        <TabButton id="javascript" label="JavaScript" icon={Code} />
        <TabButton id="whatsapp" label="WhatsApp Bot" icon={MessageSquare} />
        <TabButton id="roblox" label="Roblox Lua" icon={Gamepad2} />
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <Card className="glass-card border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="w-5 h-5 text-primary" />
                API Base URL
              </CardTitle>
              <CardDescription>Gunakan URL ini untuk semua request API</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 bg-muted/30 p-3 rounded-lg">
                <code className="flex-1 font-mono text-sm text-primary">{API_BASE}</code>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(API_BASE, 'API URL')}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Endpoints Tersedia</CardTitle>
              <CardDescription>Semua API bersifat public tanpa autentikasi</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="flex items-start gap-4 p-4 bg-muted/20 rounded-lg">
                  <FileJson className="w-8 h-8 text-blue-400 shrink-0" />
                  <div>
                    <h4 className="font-semibold">GET /get-keys</h4>
                    <p className="text-sm text-muted-foreground">Mengambil semua data key dalam format JSON</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-muted/20 rounded-lg">
                  <PlusCircle className="w-8 h-8 text-green-400 shrink-0" />
                  <div>
                    <h4 className="font-semibold">POST /create-key</h4>
                    <p className="text-sm text-muted-foreground">Membuat key baru dengan auto-generate atau custom</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-muted/20 rounded-lg">
                  <Pencil className="w-8 h-8 text-yellow-400 shrink-0" />
                  <div>
                    <h4 className="font-semibold">POST /update-key</h4>
                    <p className="text-sm text-muted-foreground">Update role, expired, HWID, freeze, rename key</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-muted/20 rounded-lg">
                  <Trash2 className="w-8 h-8 text-red-400 shrink-0" />
                  <div>
                    <h4 className="font-semibold">POST /delete-key</h4>
                    <p className="text-sm text-muted-foreground">Menghapus key dari database</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-muted/20 rounded-lg">
                  <CheckCircle className="w-8 h-8 text-secondary shrink-0" />
                  <div>
                    <h4 className="font-semibold">POST /validate-key</h4>
                    <p className="text-sm text-muted-foreground">Validasi key dan registrasi HWID + username Roblox</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Format Data Key (JSON)</CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock 
                code={`{
  "key": "AXSTOOLS-XXXX-XXXX",
  "expired": "2026-01-30T00:00:00.000Z",
  "role": "VIP",  // Developer, VIP, NORMAL, Free
  "maxHwid": 1,
  "frozenUntil": null,  // null atau "frozen"
  "frozenRemainingMs": null,  // Sisa waktu saat freeze (ms)
  "hwids": ["hwid-string-1", "hwid-string-2"],
  "robloxUsers": [
    {
      "hwid": "hwid-string-1",
      "username": "RobloxPlayer",
      "registeredAt": "2026-01-21T07:02:27.302Z"
    }
  ]
}`}
                label="JSON Format"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* JavaScript Tab */}
      {activeTab === 'javascript' && (
        <div className="space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileJson className="w-5 h-5 text-blue-400" />
                Get All Keys
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock code={codeBlocks.getAllKeys} label="Get All Keys" />
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-green-400" />
                Create Key
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock code={codeBlocks.createKey} label="Create Key" />
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-yellow-400" />
                Update Key
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock code={codeBlocks.updateKey} label="Update Key" />
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-400" />
                Delete Key
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock code={codeBlocks.deleteKey} label="Delete Key" />
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-secondary" />
                Validate Key
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock code={codeBlocks.validateKey} label="Validate Key" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* WhatsApp Tab */}
      {activeTab === 'whatsapp' && (
        <div className="space-y-6">
          <Card className="glass-card border-green-500/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-400">
                <MessageSquare className="w-5 h-5" />
                WhatsApp Bot Integration
              </CardTitle>
              <CardDescription>
                Gunakan library whatsapp-web.js atau baileys untuk membuat bot WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/30 p-4 rounded-lg">
                <h4 className="font-semibold text-green-400 mb-2">Requirements:</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• Node.js v16 atau lebih tinggi</li>
                  <li>• npm install whatsapp-web.js axios</li>
                  <li>• Atau: npm install @whiskeysockets/baileys axios</li>
                </ul>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-lg">
                <h4 className="font-semibold text-yellow-400 mb-2">Commands yang tersedia:</h4>
                <ul className="text-sm space-y-1 font-mono">
                  <li>!help - Menampilkan bantuan</li>
                  <li>!cekkey &lt;key&gt; - Cek status key</li>
                  <li>!createkey [role] [days] - Buat key baru</li>
                  <li>!deletekey &lt;key&gt; - Hapus key</li>
                  <li>!resethwid &lt;key&gt; - Reset HWID</li>
                  <li>!listkeys - Lihat daftar key</li>
                </ul>
              </div>
              <CodeBlock code={codeBlocks.whatsappBot} label="WhatsApp Bot Code" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Roblox Tab */}
      {activeTab === 'roblox' && (
        <div className="space-y-6">
          <Card className="glass-card border-blue-500/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-400">
                <Gamepad2 className="w-5 h-5" />
                Roblox Lua Integration
              </CardTitle>
              <CardDescription>
                Script untuk validasi key di Roblox executor
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-lg">
                <h4 className="font-semibold text-blue-400 mb-2">Fitur:</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• Validasi key dengan HWID unik per device</li>
                  <li>• Auto-registrasi username Roblox</li>
                  <li>• UI input key built-in (opsional)</li>
                  <li>• Load script berbeda berdasarkan role</li>
                </ul>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-lg">
                <h4 className="font-semibold text-yellow-400 mb-2">Catatan HWID:</h4>
                <p className="text-sm text-muted-foreground">
                  Setiap executor memiliki metode HWID berbeda. Pastikan menggunakan metode yang sesuai
                  dengan executor yang Anda gunakan (Synapse X, Script-Ware, Fluxus, KRNL, dll).
                </p>
              </div>
              <CodeBlock code={codeBlocks.robloxScript} label="Roblox Lua Script" />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ApiDocumentation;
