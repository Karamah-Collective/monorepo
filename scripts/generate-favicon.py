#!/usr/bin/env python3
"""Generate favicon with rounded corners from preview image."""

import os
from PIL import Image, ImageDraw

def create_rounded_image(input_path, output_path, size, radius=None):
    """Create a rounded corner image and save it."""
    # Open the image
    img = Image.open(input_path).convert("RGBA")
    
    # Resize to target size
    img = img.resize((size, size), Image.Resampling.LANCZOS)
    
    # Calculate radius for rounded corners (default: 15% of size)
    if radius is None:
        radius = max(1, size // 7)
    
    # Create a new image with alpha channel
    output_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    
    # Create a mask for rounded corners
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle(
        [(0, 0), (size - 1, size - 1)],
        radius=radius,
        fill=255
    )
    
    # Apply the mask
    output_img.paste(img, (0, 0), mask)
    output_img.save(output_path)
    print(f"  Created: {output_path}")

def main():
    input_file = "data/halal-finder-preview.png"
    
    if not os.path.exists(input_file):
        print(f"Error: {input_file} not found")
        return False
    
    print("Generating favicon with rounded corners...")
    
    # Create favicon.png (512x512 as primary)
    create_rounded_image(input_file, "favicon.png", 512)
    
    # Create smaller versions for favicon.ico as well
    # We'll create these but keep main as PNG for better quality
    print("✓ Favicon generated successfully")
    return True

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
