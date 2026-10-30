"""SegFormer-b1 di OpenEarthMap (9 kelas), dijalankan sebagai Kaggle script dengan GPU.

Pasangan citra-label ditemukan otomatis di /kaggle/input (images/<split>/x.tif, labels/<split>/x.tif).
Keluaran di /kaggle/working: model/ (format Hugging Face), metrics.json, history.json.
"""
import glob
import json
import math
import os
import time

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from transformers import SegformerForSemanticSegmentation

EPOCHS = int(os.environ.get("EPOCHS", 30))
BATCH = 12
CROP = 512
TIME_LIMIT_S = 3.5 * 3600  # berhenti rapi dan simpan model terbaik
NUM_CLASSES = 9
IGNORE = 255
CLASSES = ["background", "bareland", "rangeland", "developed", "road", "tree", "water", "agriculture", "building"]
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
OUT = "/kaggle/working"
t0 = time.time()


def find_pairs():
    exts = (".tif", ".tiff", ".png", ".jpg")
    files = [p for p in glob.glob("/kaggle/input/**/*", recursive=True) if p.lower().endswith(exts)]
    tree = {}
    for p in files:
        d = os.path.dirname(p)
        tree.setdefault(d, []).append(os.path.basename(p))
    for d, names in sorted(tree.items())[:40]:
        print(f"{d}: {len(names)} berkas, contoh {names[0]}", flush=True)
    images, labels = {}, {}
    for p in files:
        parts = [x.lower() for x in p.split("/")]
        split = parts[-2]
        stem = os.path.splitext(parts[-1])[0]
        folders = parts[:-2]
        if any(k in f for f in folders for k in ("label", "mask", "gt")):
            labels[(split, stem)] = p
        elif any("image" in f or f == "img" for f in folders):
            images[(split, stem)] = p
    pairs = {}
    for key in images.keys() & labels.keys():
        pairs.setdefault(key[0], []).append((images[key], labels[key]))
    print({split: len(v) for split, v in pairs.items()}, flush=True)
    return {split: sorted(v) for split, v in pairs.items()}


class OEM(Dataset):
    def __init__(self, pairs, train):
        self.pairs, self.train = pairs, train

    def __len__(self):
        return len(self.pairs)

    def __getitem__(self, i):
        img = np.asarray(Image.open(self.pairs[i][0]).convert("RGB"), dtype=np.uint8)
        lab = np.asarray(Image.open(self.pairs[i][1]), dtype=np.uint8)
        if self.train:
            h, w = lab.shape
            if h < CROP or w < CROP:  # beberapa tile < 512 px: pad, label pad diabaikan saat loss
                ph, pw = max(0, CROP - h), max(0, CROP - w)
                img = np.pad(img, ((0, ph), (0, pw), (0, 0)))
                lab = np.pad(lab, ((0, ph), (0, pw)), constant_values=IGNORE)
                h, w = lab.shape
            y, x = np.random.randint(0, h - CROP + 1), np.random.randint(0, w - CROP + 1)
            img, lab = img[y : y + CROP, x : x + CROP], lab[y : y + CROP, x : x + CROP]
            k = np.random.randint(4)
            img, lab = np.rot90(img, k), np.rot90(lab, k)
            if np.random.rand() < 0.5:
                img, lab = img[:, ::-1], lab[:, ::-1]
        x = ((img.astype(np.float32) / 255.0 - MEAN) / STD).transpose(2, 0, 1)
        return torch.from_numpy(np.ascontiguousarray(x)), torch.from_numpy(np.ascontiguousarray(lab)).long()


def seed_worker(_):
    np.random.seed(torch.initial_seed() % 2**32)  # tanpa ini tiap worker memakai crop acak yang sama


def evaluate(model, loader, device):
    conf = torch.zeros(NUM_CLASSES, NUM_CLASSES, dtype=torch.long, device=device)
    model.eval()
    with torch.no_grad(), torch.autocast("cuda", dtype=torch.float16):
        for x, y in loader:
            x, y = x.to(device), y.to(device)
            logits = F.interpolate(model(pixel_values=x).logits, size=y.shape[-2:], mode="bilinear", align_corners=False)
            pred = logits.argmax(1)
            keep = y < NUM_CLASSES
            conf += torch.bincount((y[keep] * NUM_CLASSES + pred[keep]), minlength=NUM_CLASSES**2).view(NUM_CLASSES, NUM_CLASSES)
    conf = conf.double()
    iou = conf.diag() / (conf.sum(0) + conf.sum(1) - conf.diag()).clamp(min=1)
    present = conf.sum(1) > 0
    return {
        "pixel_acc": (conf.diag().sum() / conf.sum()).item(),
        "mIoU": iou[present].mean().item(),
        "iou": {c: round(v, 4) for c, v in zip(CLASSES, iou.tolist())},
    }


def main():
    pairs = find_pairs()
    train_pairs = pairs["train"]
    val_pairs = pairs.get("val") or pairs.get("test")
    assert train_pairs and val_pairs, f"split tidak lengkap: {list(pairs)}"

    sample = np.unique(np.concatenate([np.unique(np.asarray(Image.open(p[1]))) for p in train_pairs[:30]]))
    print("nilai label contoh:", sample.tolist(), flush=True)
    assert sample.max() < NUM_CLASSES, "nilai label di luar 0..8: periksa pemetaan kelas"

    device = "cuda"
    model = SegformerForSemanticSegmentation.from_pretrained(
        "nvidia/mit-b1", num_labels=NUM_CLASSES, id2label=dict(enumerate(CLASSES)), label2id={c: i for i, c in enumerate(CLASSES)}
    ).to(device)

    train_loader = DataLoader(OEM(train_pairs, True), batch_size=BATCH, shuffle=True, num_workers=4, drop_last=True, pin_memory=True, worker_init_fn=seed_worker)
    val_loader = DataLoader(OEM(val_pairs[::4], False), batch_size=1, num_workers=4)  # 1/4 val tiap epoch, penuh di akhir

    head = [p for n, p in model.named_parameters() if n.startswith("decode_head")]
    body = [p for n, p in model.named_parameters() if not n.startswith("decode_head")]
    opt = torch.optim.AdamW([{"params": body, "lr": 6e-5}, {"params": head, "lr": 6e-4}], weight_decay=0.01)
    base = [6e-5, 6e-4]
    total = EPOCHS * len(train_loader)
    scaler = torch.amp.GradScaler()
    history, best, step = [], -1.0, 0

    for epoch in range(EPOCHS):
        model.train()
        for x, y in train_loader:
            scale = min(1.0, (step + 1) / 200) * (1 - step / total) ** 0.9  # warmup lalu poly decay
            for g, lr in zip(opt.param_groups, base):
                g["lr"] = lr * scale
            x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
            with torch.autocast("cuda", dtype=torch.float16):
                logits = F.interpolate(model(pixel_values=x).logits, size=y.shape[-2:], mode="bilinear", align_corners=False)
                loss = F.cross_entropy(logits, y, ignore_index=IGNORE)
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            step += 1
            if step % 50 == 0:
                print(f"epoch {epoch} step {step}/{total} loss {loss.item():.4f} t={time.time()-t0:.0f}s", flush=True)

        m = evaluate(model, val_loader, device)
        history.append({"epoch": epoch, **m, "t": round(time.time() - t0)})
        print("VAL", json.dumps(history[-1]), flush=True)
        if m["mIoU"] > best:
            best = m["mIoU"]
            model.save_pretrained(f"{OUT}/model")
        json.dump(history, open(f"{OUT}/history.json", "w"), indent=1)
        if time.time() - t0 > TIME_LIMIT_S:
            print("batas waktu tercapai, berhenti", flush=True)
            break

    best_model = SegformerForSemanticSegmentation.from_pretrained(f"{OUT}/model").to(device)
    final = evaluate(best_model, DataLoader(OEM(val_pairs, False), batch_size=1, num_workers=4), device)
    final.update(best_epoch_mIoU=best, epochs_run=len(history), val_images=len(val_pairs), train_images=len(train_pairs))
    json.dump(final, open(f"{OUT}/metrics.json", "w"), indent=1)
    print("FINAL", json.dumps(final), flush=True)


if __name__ == "__main__":
    main()
