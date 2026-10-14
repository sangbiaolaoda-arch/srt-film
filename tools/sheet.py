# 拼接触印相：python sheet.py <目录> <输出> [目录2 输出2 ...]
import sys, os, glob
from PIL import Image, ImageDraw

def sheet(files, out, cols=4, w=426):
    h = int(w * 720 / 1280)
    rows = (len(files) + cols - 1) // cols
    W, H = cols * w + (cols + 1) * 8, rows * (h + 26) + 8
    canvas = Image.new("RGB", (W, H), (24, 24, 24))
    d = ImageDraw.Draw(canvas)
    for i, f in enumerate(files):
        im = Image.open(f).resize((w, h))
        x = 8 + (i % cols) * (w + 8)
        y = 8 + (i // cols) * (h + 26)
        canvas.paste(im, (x, y))
        d.text((x + 4, y + h + 6), os.path.basename(f)[:-4].replace("-", " "), fill=(220, 220, 220))
    canvas.save(out)
    print(out, canvas.size)

args = sys.argv[1:]
for i in range(0, len(args), 2):
    d, out = args[i], args[i + 1]
    sheet(sorted(glob.glob(os.path.join(d, "*.png"))), out)
