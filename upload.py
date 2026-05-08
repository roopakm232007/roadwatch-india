import firebase_admin
from firebase_admin import credentials, firestore
import json

cred = credentials.Certificate("serviceKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

with open("potholes.json") as f:
    potholes = json.load(f)

for p in potholes:
    db.collection("potholes").document(p["id"]).set(p)
    print(f"Uploaded: {p['id']} — {p['severity']}")

print(f"\nDone! {len(potholes)} potholes uploaded to Firebase.")