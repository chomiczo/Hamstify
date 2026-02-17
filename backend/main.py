from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import secrets
import database
import services
import socket

# --- KONFIGURACJA GMAIL (Pobrana z Twojego kodu C#) ---
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
# Nadawca (musi być ten sam, dla którego wygenerowano hasło aplikacji)
SMTP_EMAIL = "xxx@gmail.com" 
# Twoje hasło aplikacji z C#
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

app = FastAPI()

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# --- MODELE ---
class UserRegister(BaseModel):
    username: str
    password: str
    email: str

class UserLogin(BaseModel):
    username: str
    password: str

# --- FUNKCJA WYSYŁANIA MAILA (Wzorowana na C#) ---
def send_verification_email(to_email, token, ip_address):
    # Link weryfikacyjny - używamy IP, żeby działało na telefonie
    verify_link = f"http://{ip_address}:8022/verify?token={token}"
    
    msg = MIMEMultipart()
    msg['From'] = SMTP_EMAIL
    msg['To'] = to_email
    msg['Subject'] = "Potwierdzenie konta Hamstify"

    # Treść maila HTML
    body = f"""
    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f3f4f6;">
        <div style="max-w-md: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px;">
            <h2 style="color: #4f46e5;">Witaj w Hamstify! 🐹</h2>
            <p>Kliknij poniższy przycisk, aby aktywować konto:</p>
            <a href="{verify_link}" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">AKTYWUJ KONTO</a>
            <p style="margin-top: 20px; color: #666; font-size: 12px;">Jeśli przycisk nie działa, wklej ten link do przeglądarki:<br>{verify_link}</p>
        </div>
    </div>
    """
    msg.attach(MIMEText(body, 'html'))

    try:
        # Logika identyczna jak w C# SmtpClient
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.ehlo()       # Przywitanie z serwerem
        server.starttls()   # Odpowiednik EnableSsl = true
        server.ehlo()
        server.login(SMTP_EMAIL, SMTP_PASSWORD) # Logowanie
        server.send_message(msg)
        server.quit()
        
        print(f"✅ SUKCES: Wysłano email do {to_email}")
        return True
    except Exception as e:
        print(f"❌ BŁĄD SMTP: {e}")
        return False

# --- ENDPOINTY ---

@app.post("/api/register")
async def register(user: UserRegister):
    # 1. Generujemy token
    token = secrets.token_urlsafe(16)
    
    # 2. Tworzymy usera w bazie (domyślnie is_verified = 0)
    success = database.create_user(user.username, user.password, user.email, token)
    if not success:
        raise HTTPException(400, "Nazwa użytkownika lub email jest już zajęty.")
    
    # 3. Pobieramy IP komputera (dla linku w mailu)
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        local_ip = s.getsockname()[0]
    except Exception:
        local_ip = '127.0.0.1'
    finally:
        s.close()
    
    # 4. Wysyłamy maila
    print(f"Próba wysłania maila na: {user.email}...")
    email_sent = send_verification_email(user.email, token, local_ip)
    
    if not email_sent:
        # Jeśli mail nie pójdzie, informujemy o tym w konsoli, ale konto w bazie już jest
        return {"message": "Konto utworzone. Sprawdź konsolę serwera, jeśli mail nie dotarł."}
        
    return {"message": "Link wysłany! Sprawdź email."}

@app.post("/api/login")
async def login(user: UserLogin):
    user_data = database.verify_user(user.username, user.password)
    if not user_data:
        raise HTTPException(401, "Błędny login lub hasło")
    
    # Sprawdzamy czy konto potwierdzone
    if user_data['is_verified'] == 0:
        raise HTTPException(403, "Konto nie jest aktywne! Sprawdź email.")
        
    return {"user_id": user_data['id'], "username": user.username}

@app.get("/verify")
async def verify_account(token: str):
    success = database.activate_user(token)
    if success:
        return HTMLResponse("""
            <html>
            <body style="background-color: #111827; color: white; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh;">
                <h1 style="color: #4ade80;">Konto aktywowane! ✅</h1>
                <p>Możesz zamknąć to okno i zalogować się w aplikacji.</p>
            </body>
            </html>
        """)
    return HTMLResponse("<h1 style='color:red'>Link nieaktywny lub wygasł.</h1>")

# --- RESZTA FUNKCJI (BEZ ZMIAN) ---
@app.get("/api/search")
async def search(q: str): return services.search_youtube(q)

@app.get("/api/stream")
async def stream(id: str): return {"url": services.get_stream_url(id)}

@app.get("/api/home")
async def home(user_id: int): return services.get_home_content(user_id)

@app.get("/api/download")
async def download(id: str):
    info = services.get_download_info(id)
    if not info:
        raise HTTPException(404, "Nie znaleziono")
    # Przekierowujemy bezpośrednio do pliku audio - przeglądarka zajmie się pobieraniem
    return RedirectResponse(url=info['url'])

@app.get("/api/suggestions")
async def suggestions(q: str):
    return services.get_suggestions(q)

@app.get("/api/playlists")
async def get_playlists(user_id: int): 
    # Pobieranie playlist z DB (logika przeniesiona tutaj dla uproszczenia importów)
    conn = database.get_db_connection()
    playlists = conn.execute("SELECT * FROM playlists WHERE user_id = ?", (user_id,)).fetchall()
    result = []
    for pl in playlists:
        songs = conn.execute("SELECT * FROM playlist_songs WHERE playlist_id = ?", (pl['id'],)).fetchall()
        result.append({
            "id": pl['id'], "name": pl['name'], "songs": [dict(s) for s in songs], "count": len(songs)
        })
    conn.close()
    return result

@app.post("/api/playlists")
async def create_playlist(data: database.CreatePlaylistModel):
    database.add_playlist(data.user_id, data.name)
    return {"message": "OK"}

@app.post("/api/playlists/add")
async def add_to_playlist_endpoint(data: database.AddToPlaylistModel):
    database.add_song_to_playlist(data)
    return {"message": "OK"}

@app.post("/api/history")
async def add_history_endpoint(data: database.RecordHistoryModel):
    database.add_history_entry(data)
    return {"message": "OK"}

app.mount("/static", StaticFiles(directory="../frontend/static"), name="static")

@app.get("/")
async def index(): return FileResponse('../frontend/index.html')

if __name__ == "__main__":
    import uvicorn
    # Pobieranie IP (żebyś wiedział jaki adres wpisać w telefonie)
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try: s.connect(('10.255.255.255', 1)); IP = s.getsockname()[0]
    except: IP = '127.0.0.1'
    finally: s.close()
    
    print(f"🚀 Hamstify PRO działa na: http://{IP}:8022")
    uvicorn.run(app, host="0.0.0.0", port=8022)