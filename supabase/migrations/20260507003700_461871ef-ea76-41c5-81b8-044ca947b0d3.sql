
UPDATE lua_scripts
SET content = REPLACE(
  REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(content,
            'TabsFrame.Size = UDim2.new(0, 60, 1, -48) -- Lebar diperkecil',
            'TabsFrame.Size = UDim2.new(0, 60, 1, -66) -- Room for expiry'
          ),
          'ContentFrame.Size = UDim2.new(1, -60, 1, -48) -- Disesuaikan dengan TabsFrame',
          'ContentFrame.Size = UDim2.new(1, -60, 1, -66) -- Room for expiry'
        ),
        'ExpirationLabel.Text = "..."',
        'ExpirationLabel.Text = "Loading expiry..."'
      ),
      'ExpirationLabel.TextSize = 14',
      'ExpirationLabel.TextSize = 11'
    ),
    'ExpirationLabel.Size = UDim2.new(1, -10, 0, 18)',
    'ExpirationLabel.Size = UDim2.new(1, -10, 0, 16)'
  ),
  'ExpirationLabel.Position = UDim2.new(0, 5, 1, -18) -- Positioned at bottom, slight padding',
  'ExpirationLabel.Position = UDim2.new(0, 5, 1, -17) -- Bottom with padding'
)
WHERE name = 'main';
