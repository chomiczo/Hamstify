import sqlite3
from passlib.context import CryptContext
from pydantic import BaseModel

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
DB_NAME = "hamstify.db"

# Modele Pydantic (żeby main.py ich używał)
class CreatePlaylistModel(BaseModel):
    user_id: int
    name: str

class AddToPlaylistModel(BaseModel):
    playlist_id: int
    video_id: str
    title: str
    artist: str
    thumbnail: str

class RecordHistoryModel(BaseModel):
    user_id: int
    video_id: str
    title: str
    artist: str
    artist_id: str = None

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    # Tabela Users - teraz z email i weryfikacją
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        verification_token TEXT,
        is_verified INTEGER DEFAULT 0
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS playlist_songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER,
        video_id TEXT,
        title TEXT,
        artist TEXT,
        thumbnail TEXT,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        video_id TEXT,
        artist_id TEXT,
        artist_name TEXT,
        title TEXT,
        played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    conn.commit()
    conn.close()

def create_user(username, password, email, token):
    conn = get_db_connection()
    try:
        hashed = pwd_context.hash(password)
        conn.execute("INSERT INTO users (username, password_hash, email, verification_token) VALUES (?, ?, ?, ?)", 
                     (username, hashed, email, token))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def verify_user(username, password):
    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    if user and pwd_context.verify(password, user['password_hash']):
        return dict(user) # Zwracamy słownik, żeby mieć dostęp do is_verified
    return None

def activate_user(token):
    conn = get_db_connection()
    cursor = conn.execute("UPDATE users SET is_verified = 1, verification_token = NULL WHERE verification_token = ?", (token,))
    conn.commit()
    success = cursor.rowcount > 0
    conn.close()
    return success

# Helpery do playlist (dla czystości main.py)
def add_playlist(user_id, name):
    conn = get_db_connection()
    conn.execute("INSERT INTO playlists (user_id, name) VALUES (?, ?)", (user_id, name))
    conn.commit()
    conn.close()

def add_song_to_playlist(data):
    conn = get_db_connection()
    conn.execute("INSERT INTO playlist_songs (playlist_id, video_id, title, artist, thumbnail) VALUES (?, ?, ?, ?, ?)",
                 (data.playlist_id, data.video_id, data.title, data.artist, data.thumbnail))
    conn.commit()
    conn.close()

def add_history_entry(data):
    conn = get_db_connection()
    conn.execute("INSERT INTO history (user_id, video_id, artist_id, artist_name, title) VALUES (?, ?, ?, ?, ?)",
                 (data.user_id, data.video_id, data.artist_id, data.artist, data.title))
    conn.commit()
    conn.close()

init_db()