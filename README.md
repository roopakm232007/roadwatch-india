# 🚧 RepuScore  
### India’s First AI-Powered Politician Road Accountability System

> “Bad roads are not just an infrastructure problem — they are an accountability problem.”

RepuScore is an AI-driven civic-tech platform that automatically detects potholes, assigns responsibility to the correct politician, tracks repair deadlines, and publicly scores political performance based on road maintenance.

---

# 🌍 The Problem

India loses billions every year because of poor road conditions:

- ₹3 lakh crore lost yearly due to bad roads  
- 3,500+ pothole-related deaths annually  
- No real accountability system for politicians  

Current complaint systems fail because:
- Complaints disappear into portals  
- No tracking or deadlines  
- No public consequences for inaction  

---

# 💡 Solution: RepuScore

RepuScore transforms pothole reporting into a **public accountability engine**.

Instead of just filing complaints, the system:

✅ Detects potholes using AI  
✅ Assigns responsibility automatically  
✅ Creates public deadlines  
✅ Tracks repair progress  
✅ Calculates politician reputation scores  
✅ Shows voters performance before elections  

---

# ⚡ Key Features

## 🧠 AI Auto Detection
- YOLOv8 detects potholes from images and videos
- Severity scored from 0–100
- GPS tagged automatically

## 📍 Automatic Politician Assignment
- GPS ward mapping identifies the responsible MLA or ward official
- No manual assignment required

## ⏱️ Smart Deadlines

| Severity | Deadline |
|---|---|
| Critical | 7 days |
| High | 14 days |
| Medium | 30 days |
| Low | 60 days |

## ⭐ RepuScore Engine
Politicians receive live reputation scores based on:
- On-time repairs
- Severity handled
- Citizen verification

## 🔒 Immutable Audit Logs
Every action is stored in append-only Firestore logs.

## 🛡️ Anti-Fake AI Shield
Prevents fake submissions using:
- GPS verification
- Metadata analysis
- Multi-pass camera validation

## 🗳️ Election Intelligence
Voters can check real infrastructure performance before elections.

---

# 🔄 Workflow

    Citizen Photo / Camera Feed
                ↓
          YOLOv8 Detection
                ↓
         Severity Classification
                ↓
         GPS + Fake Verification
                ↓
       Ward & Politician Mapping
                ↓
     Deadline + Public Dashboard
                ↓
        RepuScore Calculation

Entire pipeline is fully automated. No government approval required.

---

# 📊 RepuScore Algorithm

    RepuScore =
    (On-time Repairs × 0.50)
    + (Severity Weighted × 0.30)
    + (Citizen Verified × 0.20)

## Score Factors

| Metric | Weight |
|---|---|
| On-time Repairs | 50% |
| Severity Handling | 30% |
| Citizen Verification | 20% |

Critical potholes carry higher impact on score.

---

# 🤖 AI Performance

The AI system was tested using real Bengaluru road footage.

## Results
- 📷 1,134 road frames processed
- 🕳️ 72 potholes detected
- ⏱️ 26 seconds total processing time
- 🤖 100% AI-driven pipeline

## Severity Levels

| Level | Score | Deadline |
|---|---|---|
| Critical | 86–100 | 7 days |
| High | 61–85 | 14 days |
| Medium | 31–60 | 30 days |
| Low | 0–30 | 60 days |

---

# 🏗️ Tech Stack

## AI & Computer Vision
- YOLOv8
- OpenCV
- Python 3.11
- HuggingFace

## Backend
- Firebase Firestore
- Firebase Admin SDK
- GPS Mapping Engine

## Frontend
- React.js
- Tailwind CSS
- Leaflet.js

## Deployment
- Vercel

## AI Safety
- Metadata validation
- GPS verification
- Immutable audit system

---

# 🌍 Real-World Impact

RepuScore converts every smartphone user into a road inspector.

## Benefits
- Safer roads
- Faster pothole repairs
- Transparent governance
- Data-driven elections
- Public accountability at scale

## Future Expansion
- 📱 Mobile app
- 🚗 Dashcam integration
- 🏙️ Bengaluru-wide deployment
- 🔗 Smart City APIs

---

# 🏆 Why RepuScore Is Unique

Unlike complaint apps or government portals, RepuScore combines:

✅ AI detection  
✅ Auto assignment  
✅ Smart deadlines  
✅ Public scoring  
✅ Fraud prevention  
✅ Immutable records  
✅ Election-ready insights  

All in one platform.



# 🧠 AI Model Workflow

The system performs:

1. Pothole Detection using YOLOv8  
2. Severity Classification  
3. GPS Verification  
4. Politician Assignment  
5. Deadline Tracking  
6. RepuScore Calculation  

---

# 🗂️ Project Structure

    RepuScore/
    │
    ├── backend/
    │   ├── app.py
    │   ├── detection/
    │   ├── scoring/
    │   ├── firebase/
    │   └── config.py
    │
    ├── frontend/
    │   ├── src/
    │   ├── public/
    │   └── components/
    │
    ├── models/
    ├── datasets/
    ├── requirements.txt
    └── README.md

---

# 📊 Future Improvements

- Mobile Application
- Live Dashcam Integration
- Smart City APIs
- AI Repair Prediction
- Election Analytics Dashboard

---

# 🤝 Contributors

- Roopa K M
- Team innovatex

---



# 🌟 Support

If you like this project, give it a ⭐ on GitHub.

---

# 📌 Vision

RepuScore aims to make infrastructure accountability measurable, transparent, and impossible to ignore.

Built in Bengaluru, designed for every Indian citizen who deserves safer roads. 🚧🇮🇳
