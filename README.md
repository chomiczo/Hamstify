# Hamstify - Audio Streaming Application 🐹

> **DISCLAIMER: EDUCATIONAL PROJECT ONLY**
>
> This project is a **Proof of Concept (PoC)** created solely for educational purposes to demonstrate skills in Python (FastAPI), JavaScript (Vanilla), and SQLite database management.
>
> The application acts as a custom interface for media playback. The author **does not host, distribute, or store any copyrighted audio files**. This software is intended for personal learning and private use on a local network. The developer assumes no liability for how this software is used by third parties. Users are responsible for complying with local copyright laws and Terms of Service of any third-party providers.

## 📋 Project Overview

Hamstify is a lightweight, full-stack web application designed to provide a unified audio playback interface across devices (Mobile/Desktop). It features a responsive PWA (Progressive Web App) frontend and a robust Python backend.

### Key Features

* **Custom Audio Player:** HTML5-based audio player with volume control, seeking, and queue management.
* **Progressive Web App (PWA):** Installable on iOS and Android devices for a native-like experience.
* **User System:** Secure authentication system with email verification (SMTP) and hashed passwords (Bcrypt).
* **Personal Library:** Playlist creation and management using SQLite relationship mapping.
* **Smart Queue:** Context-aware playback queue (seamlessly switches between search results and user playlists).
* **Search & Autocomplete:** Asynchronous search functionality with instant suggestions.

## 🛠️ Tech Stack

**Backend:**
* **Python 3.10+**
* **FastAPI:** High-performance web framework for building APIs.
* **SQLite:** Relational database for storing users, playlists, and history.
* **Pydantic:** Data validation and settings management.
* **AsyncIO:** For handling concurrent requests efficiently.

**Frontend:**
* **HTML5 / CSS3 (Tailwind CSS):** For responsive and modern UI.
* **JavaScript (ES6+):** Vanilla JS for DOM manipulation, AJAX requests, and state management.

## 🚀 Installation & Setup

This project is designed to run locally.

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/your-username/hamstify.git](https://github.com/your-username/hamstify.git)
    cd hamstify/backend
    ```

2.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

3.  **Configuration:**
    * Set up your SMTP credentials in `main.py` or environment variables for email verification to work.

4.  **Run the server:**
    ```bash
    python main.py
    ```

5.  **Access the app:**
    * Localhost: `http://localhost:8022`
    * Local Network (Mobile): `http://YOUR_LOCAL_IP:8022`

## 📱 Mobile Usage

To use as a PWA:
1.  Navigate to the app URL in Safari (iOS) or Chrome (Android).
2.  Select "Add to Home Screen".
3.  Launch from the home screen for a full-screen experience.

---
*Created by [chomiczo].*
