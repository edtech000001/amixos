#!/usr/bin/env python3
"""Generate every icon variant the apps need from the four source exports.

Run from the repo root after replacing any source file:
    python3 scripts/build-icons.py

Sources live in mobile/assets/ and are committed:
    icon.png                      light icon, opaque #F9F9FA background
    icon_only.png                 colour mark, transparent
    icon_only_simple.png          solid white mark, transparent
    icon_only_simple_outline.png  white outline mark, transparent

Two rules drive the transforms:

* Apple rejects an app icon with an alpha channel, so the primary iOS icon is
  flattened onto the light background. The dark and tinted VARIANTS are the
  opposite — Apple draws its own background behind them, so those keep alpha.
* Android composites the adaptive foreground over a background colour and then
  masks the result to whatever shape the launcher uses. Only the centre 66% is
  guaranteed to survive, and the raw mark spans ~72%, so it gets scaled down to
  fit the safe zone before it is written.
"""
import os
import tempfile

from PIL import Image, ImageOps
from pathlib import Path

ASSETS = Path('mobile/assets')
WEB = Path('web/src/app')
SIZE = 1024
LIGHT_BG = (249, 249, 250)
# Android's documented adaptive-icon safe zone: the inner 66% of the canvas.
SAFE_ZONE = 0.66
# Alpha below this is export noise, not artwork — ignored when measuring bounds.
ALPHA_FLOOR = 8


def content_bbox(im):
    """Bounds of the real artwork, ignoring near-zero alpha noise."""
    alpha = im.getchannel('A').point(lambda v: 255 if v >= ALPHA_FLOOR else 0)
    return alpha.getbbox()


def fit(src, size=SIZE, span=None, bg=None):
    """Re-centre `src` on a `size` square, optionally scaling the artwork so it
    occupies `span` of the canvas. `bg` flattens the result (kills alpha)."""
    im = Image.open(src).convert('RGBA')
    box = content_bbox(im)
    art = im.crop(box)

    if span is None:
        # Keep the original framing, just change resolution.
        scale = size / im.width
    else:
        scale = (size * span) / max(art.width, art.height)

    art = art.resize(
        (max(1, round(art.width * scale)), max(1, round(art.height * scale))),
        Image.LANCZOS,
    )
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(art, ((size - art.width) // 2, (size - art.height) // 2), art)

    if bg is not None:
        flat = Image.new('RGB', (size, size), bg)
        flat.paste(out, (0, 0), out)
        return flat
    return out


def save(im, path):
    """Write atomically.

    A plain im.save() opens the target with 'wb', which truncates it to zero
    before the encoder writes a byte. Metro watches these files, and reading
    one inside that window caches a permanent
    "TransformError ...: Empty file" that survives until the cache is cleared.
    Writing to a temp file in the same directory and renaming means the path
    only ever points at a complete image.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix='.tmp')
    os.close(fd)
    try:
        im.save(tmp, 'PNG', optimize=True)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    mode = 'opaque' if im.mode == 'RGB' else 'alpha'
    print(f'  {path}  {im.size[0]}x{im.size[1]}  {mode}')


print('iOS')
# Primary icon: opaque, or App Store Connect rejects the binary.
save(fit(ASSETS / 'icon.png', bg=LIGHT_BG), ASSETS / 'icon.png')
# Dark + tinted: transparent on purpose — iOS supplies the background.
save(fit(ASSETS / 'icon_only.png'), ASSETS / 'icon-dark.png')
# Tinted is rendered through a user-chosen colour, so it must be greyscale.
tinted = fit(ASSETS / 'icon_only_simple_outline.png')
save(Image.merge('LA', (ImageOps.grayscale(tinted.convert('RGB')),
                        tinted.getchannel('A'))).convert('RGBA'),
     ASSETS / 'icon-tinted.png')

print('Android')
save(fit(ASSETS / 'icon_only.png', span=SAFE_ZONE), ASSETS / 'adaptive-icon.png')
save(fit(ASSETS / 'icon_only_simple.png', span=SAFE_ZONE), ASSETS / 'monochrome-icon.png')

print('Splash')
# Transparent mark, not the framed icon — a light square on the splash
# background reads as a visible edge on anything but a pure-white screen.
save(fit(ASSETS / 'icon_only.png', size=512), ASSETS / 'splash-icon.png')

print('Web (Next.js app-router conventions)')
# Favicon: the MARK on transparency, not the framed icon — a browser tab is
# often dark, and the opaque light icon read as a white tile sitting in it.
# Scaled to 92% because a 16px favicon has no room for the logo's padding.
save(fit(ASSETS / 'icon_only.png', size=512, span=0.92), WEB / 'icon.png')
# apple-icon is the iOS home-screen bookmark and must stay OPAQUE: iOS renders
# transparency there as solid black rather than compositing it.
save(fit(ASSETS / 'icon.png', size=180, bg=LIGHT_BG), WEB / 'apple-icon.png')


# --- Wordmark lockups -------------------------------------------------------
# Four exports from Illustrator, each on a 1254 square canvas with a lot of
# empty space around the artwork. Trimmed to the ink here so a layout can size
# them by width and trust the result — untrimmed, the baked padding makes the
# logo render visibly smaller than the box it is given.
#
# Named after the INK, not the appearance: `-black` goes on light backgrounds,
# `-white` on dark ones. Naming them light/dark would be ambiguous about
# whether it describes the art or the surface behind it.
WORDMARKS = {
    'icon_textblack_down.png':      ('logo-stacked-black.png', 720),
    'icon_textwhite_down.png':      ('logo-stacked-white.png', 720),
    'icon_textblack_side.png':      ('logo-side-black.png', 1080),
    'icon_textwhite_side.png':      ('logo-side-white.png', 1080),
}


def trim(src, width):
    """Crop to the artwork and scale to `width`, preserving aspect ratio."""
    im = Image.open(src).convert('RGBA')
    art = im.crop(content_bbox(im))
    h = max(1, round(art.height * width / art.width))
    return art.resize((width, h), Image.LANCZOS)


# Written to THREE places on purpose. mobile/assets keeps them next to the
# other native art; shared/src/assets is what the shared <Logo> require()s so
# one component serves both apps; web/public is the web build's copy, because
# react-native-web cannot consume Metro's require() of a PNG. Generated rather
# than copied by hand so the three can never drift.
SHARED = Path('shared/src/assets')
PUBLIC = Path('web/public')

print('Wordmarks')
for src, (dest, width) in WORDMARKS.items():
    art = trim(ASSETS / src, width)
    for out in (ASSETS, SHARED, PUBLIC):
        save(art, out / dest)
