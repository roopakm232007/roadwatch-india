from huggingface_hub import hf_hub_download
import shutil

print("Downloading pothole model from HuggingFace...")

path = hf_hub_download(
    repo_id="keremberke/yolov8n-pothole-segmentation",
    filename="best.pt"
)

shutil.copy(path, "pothole.pt")
print("Done! pothole.pt saved in your folder.")