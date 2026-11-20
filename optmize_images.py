#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageOps

root_folder = Path('images')
extensions = {'.jpg', '.jpeg', '.png'}

for src in root_folder.rglob('*'):
    if not src.is_file() or src.suffix.lower() not in extensions:
        continue

    new_name = src.stem.lower().replace(' ', '-') + '.webp'
    dst = src.with_name(new_name)

    try:
        with Image.open(src) as img:
            img = ImageOps.exif_transpose(img)
            
            # Mantém transparência se for PNG com canal alfa; caso contrário, converte para RGB
            if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
                img = img.convert('RGBA')
            else:
                img = img.convert('RGB')

            if img.width > 1200:
                new_height = int(img.height * 1200 / img.width)
                img = img.resize((1200, new_height), Image.Resampling.LANCZOS)

            img.save(dst, 'WEBP', quality=82, method=6)

        # Só remove o original se o novo arquivo foi criado com sucesso e tem nome diferente
        if src != dst and dst.exists():
            src.unlink()
            print(f'Convertido: {src} -> {dst}')

    except Exception as e:
        print(f'Erro ao processar {src}: {e}')
