#!/bin/bash

# Script to generate all required Tauri icon formats from a source PNG
# Usage: ./scripts/generate-icons.sh

SOURCE_ICON="src-tauri/icons/source-icon.png"
ICONS_DIR="src-tauri/icons"

if [ ! -f "$SOURCE_ICON" ]; then
    echo "Error: Source icon not found at $SOURCE_ICON"
    echo "Please save your icon as a high-resolution PNG (512x512 or larger) at $SOURCE_ICON"
    exit 1
fi

echo "Generating icons from $SOURCE_ICON..."

# Check if ImageMagick is installed
if ! command -v magick &> /dev/null; then
    echo "ImageMagick is required but not installed."
    echo "Install it with: brew install imagemagick"
    exit 1
fi

# Generate PNG icons with RGBA format (required by Tauri)
magick "$SOURCE_ICON" -background none -resize 32x32 -colorspace sRGB -type TrueColorAlpha "$ICONS_DIR/32x32.png"
magick "$SOURCE_ICON" -background none -resize 128x128 -colorspace sRGB -type TrueColorAlpha "$ICONS_DIR/128x128.png"
magick "$SOURCE_ICON" -background none -resize 256x256 -colorspace sRGB -type TrueColorAlpha "$ICONS_DIR/128x128@2x.png"
magick "$SOURCE_ICON" -background none -resize 512x512 -colorspace sRGB -type TrueColorAlpha "$ICONS_DIR/icon.png"

# Generate Windows ICO (multiple sizes in one file)
magick "$SOURCE_ICON" -resize 256x256 \
        \( -clone 0 -resize 128x128 \) \
        \( -clone 0 -resize 64x64 \) \
        \( -clone 0 -resize 48x48 \) \
        \( -clone 0 -resize 32x32 \) \
        \( -clone 0 -resize 16x16 \) \
        "$ICONS_DIR/icon.ico"

# Generate macOS ICNS
# First create iconset directory
ICONSET_DIR="$ICONS_DIR/icon.iconset"
mkdir -p "$ICONSET_DIR"

# Generate all required sizes for iconset with RGBA format
magick "$SOURCE_ICON" -background none -resize 16x16 -colorspace sRGB -type TrueColorAlpha "$ICONSET_DIR/icon_16x16.png"
magick "$SOURCE_ICON" -background none -resize 32x32 -colorspace sRGB -type TrueColorAlpha "$ICONSET_DIR/icon_16x16@2x.png"
magick "$SOURCE_ICON" -background none -resize 32x32 -colorspace sRGB -type TrueColorAlpha "$ICONSET_DIR/icon_32x32.png"
magick "$SOURCE_ICON" -background none -resize 64x64 -colorspace sRGB -type TrueColorAlpha "$ICONSET_DIR/icon_32x32@2x.png"
magick "$SOURCE_ICON" -background none -resize 128x128 -colorspace sRGB -type TrueColorAlpha "$ICONSET_DIR/icon_128x128.png"
magick "$SOURCE_ICON" -background none -resize 256x256 -colorspace sRGB -type TrueColorAlpha "$ICONSET_DIR/icon_128x128@2x.png"
magick "$SOURCE_ICON" -background none -resize 256x256 -colorspace sRGB -type TrueColorAlpha "$ICONSET_DIR/icon_256x256.png"
magick "$SOURCE_ICON" -background none -resize 512x512 -colorspace sRGB -type TrueColorAlpha "$ICONSET_DIR/icon_256x256@2x.png"
magick "$SOURCE_ICON" -background none -resize 512x512 -colorspace sRGB -type TrueColorAlpha "$ICONSET_DIR/icon_512x512.png"
magick "$SOURCE_ICON" -background none -resize 1024x1024 -colorspace sRGB -type TrueColorAlpha "$ICONSET_DIR/icon_512x512@2x.png"

# Convert iconset to icns
iconutil -c icns "$ICONSET_DIR" -o "$ICONS_DIR/icon.icns"

# Clean up iconset directory
rm -rf "$ICONSET_DIR"

# Generate Windows Store logos with RGBA format
magick "$SOURCE_ICON" -background none -resize 30x30 -colorspace sRGB -type TrueColorAlpha "$ICONS_DIR/Square30x30Logo.png"
magick "$SOURCE_ICON" -background none -resize 44x44 -colorspace sRGB -type TrueColorAlpha "$ICONS_DIR/Square44x44Logo.png"
magick "$SOURCE_ICON" -background none -resize 71x71 -colorspace sRGB -type TrueColorAlpha "$ICONS_DIR/Square71x71Logo.png"
magick "$SOURCE_ICON" -background none -resize 89x89 -colorspace sRGB -type TrueColorAlpha "$ICONS_DIR/Square89x89Logo.png"
magick "$SOURCE_ICON" -background none -resize 107x107 -colorspace sRGB -type TrueColorAlpha "$ICONS_DIR/Square107x107Logo.png"
magick "$SOURCE_ICON" -background none -resize 142x142 -colorspace sRGB -type TrueColorAlpha "$ICONS_DIR/Square142x142Logo.png"
magick "$SOURCE_ICON" -background none -resize 150x150 -colorspace sRGB -type TrueColorAlpha "$ICONS_DIR/Square150x150Logo.png"
magick "$SOURCE_ICON" -background none -resize 284x284 -colorspace sRGB -type TrueColorAlpha "$ICONS_DIR/Square284x284Logo.png"
magick "$SOURCE_ICON" -background none -resize 310x310 -colorspace sRGB -type TrueColorAlpha "$ICONS_DIR/Square310x310Logo.png"
magick "$SOURCE_ICON" -background none -resize 50x50 -colorspace sRGB -type TrueColorAlpha "$ICONS_DIR/StoreLogo.png"

echo "✅ All icons generated successfully!"
echo "Icons are ready in $ICONS_DIR"