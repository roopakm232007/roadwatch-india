import cv2
import json
import random
from datetime import datetime, timedelta
from ultralytics import YOLO

# ── Config ──────────────────────────────────────────────
VIDEO_IN   = "road.mp4"
VIDEO_OUT  = "output.mp4"
JSON_OUT   = "potholes.json"
MODEL_PATH = "pothole.pt"
FRAME_STEP = 5          # check every 5th frame (more frames = more detections)
MIN_CONF   = 0.25       # lower confidence = catches more potholes
MIN_AREA   = 800        # minimum box area in pixels

# Koramangala Bengaluru GPS range
BASE_LAT, BASE_LON = 12.9352, 77.6245

# ── Colours ─────────────────────────────────────────────
SEV_COLOURS = {
    "Critical": (0,   0,   220),   # red
    "High":     (0,   140, 255),   # orange
    "Medium":   (255, 180, 0  ),   # blue
    "Low":      (0,   200, 80 ),   # green
}

# ── GPS helper ──────────────────────────────────────────
def fake_gps():
    return {
        "lat": round(BASE_LAT + random.uniform(-0.008, 0.008), 6),
        "lng": round(BASE_LON + random.uniform(-0.008, 0.008), 6)
    }

# ── Severity from area ──────────────────────────────────
def get_severity(area):
    if area > 6000: return "Critical"
    if area > 3000: return "High"
    if area > 1200: return "Medium"
    return "Low"

# ── Deadline from severity ──────────────────────────────
def get_deadline(sev):
    days = {"Critical":7, "High":14, "Medium":30, "Low":60}
    return (datetime.now() + timedelta(days=days[sev])).strftime("%Y-%m-%d")

# ── Is this likely a pothole? ────────────────────────────
def is_pothole(x1, y1, x2, y2, frame_h, frame_w, conf):
    w = x2 - x1
    h = y2 - y1
    area = w * h
    cx = (x1 + x2) / 2
    cy = (y1 + y2) / 2

    # must be in bottom 70% of frame (potholes on ground)
    if cy < frame_h * 0.30:
        return False

    # must not be too narrow/tall (cars are tall)
    aspect = w / h if h > 0 else 0
    if aspect < 0.4:   # too tall = car or person
        return False

    # must have minimum size
    if area < MIN_AREA:
        return False

    # must not be too wide relative to full frame (sky/horizon)
    if w > frame_w * 0.85:
        return False

    return True

# ── Draw box on frame ────────────────────────────────────
def draw_box(frame, x1, y1, x2, y2, sev, conf):
    colour = SEV_COLOURS[sev]
    cv2.rectangle(frame, (x1,y1), (x2,y2), colour, 2)
    label = f"Pothole {sev} {conf:.0%}"
    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
    cv2.rectangle(frame, (x1, y1-th-8), (x1+tw+6, y1), colour, -1)
    cv2.putText(frame, label, (x1+3, y1-4),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255,255,255), 1)

# ── MAIN ────────────────────────────────────────────────
def main():
    print("="*55)
    print("  RoadWatch India — Pothole Detection")
    print("="*55)

    # load model
    print("[1/4] Loading AI model...")
    model = YOLO(MODEL_PATH)
    # get all class names the model knows
    names = model.names
    print(f"      Model loaded. Classes: {list(names.values())[:5]}...")

    # open video
    print("[2/4] Opening video...")
    cap = cv2.VideoCapture(VIDEO_IN)
    if not cap.isOpened():
        raise FileNotFoundError(f"Cannot open video: {VIDEO_IN}")

    W  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H  = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    FPS = cap.get(cv2.CAP_PROP_FPS) or 25
    TOTAL = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"      {W}x{H} @ {FPS:.0f}fps  |  {TOTAL} frames total")

    # output video writer
    out = cv2.VideoWriter(VIDEO_OUT,
          cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))

    detections = []
    summary    = {"Critical":0, "High":0, "Medium":0, "Low":0}
    frame_idx  = 0
    detect_idx = 0

    print("[3/4] Running detection...")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_idx += 1

        if frame_idx % FRAME_STEP == 0:
            results = model(frame, verbose=False, conf=MIN_CONF)[0]
            detect_idx += 1

            for box in results.boxes:
                x1,y1,x2,y2 = map(int, box.xyxy[0].tolist())
                conf  = float(box.conf[0])
                cls   = int(box.cls[0])
                cname = names[cls].lower()

                # ── pothole filter ──────────────────────────
                # Accept if:
                # (a) class name contains pothole, OR
                # (b) passes our shape/position test
                shape_ok = is_pothole(x1,y1,x2,y2, H, W, conf)
                name_ok  = "pothole" in cname or "hole" in cname or "road" in cname

                if not (shape_ok or name_ok):
                    continue

                area = (x2-x1) * (y2-y1)
                sev  = get_severity(area)
                ts   = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

                detections.append({
                    "id":        f"RW-{len(detections)+1:04d}",
                    "frame":     frame_idx,
                    "severity":  sev,
                    "confidence": round(conf, 3),
                    "status":    "pending",
                    "timestamp": ts,
                    "deadline":  get_deadline(sev),
                    "ward":      "Koramangala, Bengaluru",
                    "politician": random.choice([
                        "Rizwan Arshad", "Sowmya Reddy",
                        "Ramalinga Reddy", "N A Haris"
                    ]),
                    "bbox": {"x1":x1,"y1":y1,"x2":x2,"y2":y2,
                             "area_px": area},
                    "gps": fake_gps()
                })
                summary[sev] += 1
                draw_box(frame, x1,y1,x2,y2, sev, conf)

        out.write(frame)

        if frame_idx % 100 == 0:
            pct = frame_idx / TOTAL * 100
            print(f"      Frame {frame_idx}/{TOTAL}  ({pct:.0f}%)  "
                  f"Potholes so far: {len(detections)}")

    cap.release()
    out.release()

    # save JSON
    with open(JSON_OUT, "w") as f:
        json.dump(detections, f, indent=2)

    print("\n" + "="*55)
    print(f"  Done!  {frame_idx} frames  |  {detect_idx} analysed")
    print(f"  Total potholes detected : {len(detections)}")
    for s in ["Critical","High","Medium","Low"]:
        print(f"    {s:<10}: {summary[s]}")
    print(f"\n  Output video : {VIDEO_OUT}")
    print(f"  JSON report  : {JSON_OUT}")
    print("="*55)

if __name__ == "__main__":
    main()