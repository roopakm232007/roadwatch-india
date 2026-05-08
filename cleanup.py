# cleanup.py — deletes duplicate potholes, keeps only RW-0001 to RW-0072
import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate("serviceKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

docs = db.collection("potholes").stream()
for doc in docs:
    data = doc.to_dict()
    num = int(data["id"].split("-")[1])
    if num > 72:  # delete anything above original 72
        db.collection("potholes").document(doc.id).delete()
        print(f"Deleted: {doc.id}")

print("Done!")