# Generating PNG icons from icon.svg

The manifest references `icon-192.png` and `icon-512.png`. Generate them from `icon.svg` using any of:

```bash
# Using Inkscape (install via apt/brew)
inkscape icon.svg --export-png=icon-192.png --export-width=192
inkscape icon.svg --export-png=icon-512.png --export-width=512

# Using ImageMagick
convert -background none -resize 192x192 icon.svg icon-192.png
convert -background none -resize 512x512 icon.svg icon-512.png

# Using sharp (Node)
npx sharp-cli -i icon.svg -o icon-192.png resize 192 192
npx sharp-cli -i icon.svg -o icon-512.png resize 512 512
```

Replace `icon.svg` with a proper logo file when one is available.
The SVG placeholder shows a calendar grid on a dark background.
