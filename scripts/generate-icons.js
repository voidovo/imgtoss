#!/usr/bin/env node

/**
 * Generate all required Tauri icon formats from a source PNG
 * Requires: npm install sharp
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE_ICON = 'src-tauri/icons/source-icon.png';
const ICONS_DIR = 'src-tauri/icons';

const iconSizes = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: 'icon.png', size: 512 },
  // Windows Store logos
  { name: 'Square30x30Logo.png', size: 30 },
  { name: 'Square44x44Logo.png', size: 44 },
  { name: 'Square71x71Logo.png', size: 71 },
  { name: 'Square89x89Logo.png', size: 89 },
  { name: 'Square107x107Logo.png', size: 107 },
  { name: 'Square142x142Logo.png', size: 142 },
  { name: 'Square150x150Logo.png', size: 150 },
  { name: 'Square284x284Logo.png', size: 284 },
  { name: 'Square310x310Logo.png', size: 310 },
  { name: 'StoreLogo.png', size: 50 },
];

async function generateIcons() {
  if (!fs.existsSync(SOURCE_ICON)) {
    console.error(`Error: Source icon not found at ${SOURCE_ICON}`);
    console.error('Please save your icon as a high-resolution PNG (512x512 or larger) at', SOURCE_ICON);
    process.exit(1);
  }

  console.log(`Generating icons from ${SOURCE_ICON}...`);

  try {
    // Generate PNG icons with RGBA format (required by Tauri)
    for (const { name, size } of iconSizes) {
      await sharp(SOURCE_ICON)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
        })
        .png({
          compressionLevel: 9,
          adaptiveFiltering: false,
          force: true
        })
        .ensureAlpha() // Ensure alpha channel is present
        .toFile(path.join(ICONS_DIR, name));
      console.log(`✓ Generated ${name}`);
    }

    // Generate ICO for Windows (requires additional processing)
    console.log('Note: For Windows ICO and macOS ICNS files, please use the shell script or online converters');
    console.log('✅ PNG icons generated successfully!');
    
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

// Check if sharp is installed
try {
  require.resolve('sharp');
  generateIcons();
} catch (error) {
  console.error('Sharp is required but not installed.');
  console.error('Install it with: npm install sharp');
  console.error('Or use the shell script instead: ./scripts/generate-icons.sh');
  process.exit(1);
}