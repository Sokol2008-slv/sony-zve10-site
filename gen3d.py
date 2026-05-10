"""
Генерирует 3D модель Sony ZV-E10 II через fal.ai Hunyuan3D.
Использует FAL_KEY из axi-crystal/.env
"""
import os
import sys
import base64
import time
import urllib.request
from pathlib import Path
from dotenv import load_dotenv

ENV_PATH = Path("C:/Users/Denys.Romanchuk/Downloads/axi-crystal/.env")
load_dotenv(ENV_PATH)

if not os.getenv("FAL_KEY"):
    print("ERROR: FAL_KEY not found in", ENV_PATH)
    sys.exit(1)

import fal_client

IMG = Path("C:/Users/Denys.Romanchuk/Downloads/sony-zve10-site/input/sony.jpg")
OUT = Path("C:/Users/Denys.Romanchuk/Downloads/sony-zve10-site/public/models")
OUT.mkdir(parents=True, exist_ok=True)

print(f"Uploading {IMG.name} ({IMG.stat().st_size // 1024} KB) to fal.ai storage...")
t0 = time.time()
image_url = fal_client.upload_file(str(IMG))
print(f"Uploaded: {image_url}")

print(f"Submitting to Trellis...")
handler = fal_client.submit(
    "fal-ai/trellis",
    arguments={
        "image_url": image_url,
        "texture_size": 1024,
    },
)

result = handler.get()
print(f"Generated in {time.time()-t0:.1f}s")
print("Result keys:", list(result.keys()))

mesh_url = result.get("model_mesh", {}).get("url") or result.get("mesh", {}).get("url")
if not mesh_url:
    print("Unexpected result structure:", result)
    sys.exit(1)

glb_path = OUT / "sony-zve10.glb"
urllib.request.urlretrieve(mesh_url, glb_path)
print(f"Saved: {glb_path} ({glb_path.stat().st_size // 1024} KB)")
