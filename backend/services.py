import yt_dlp
from ytmusicapi import YTMusic
import database
import random

ytmusic = YTMusic()

def search_youtube(query: str):
    try:
        results = ytmusic.search(query, filter='songs')
        clean_results = []
        for r in results:
            if r.get('videoId'):
                thumbnails = r.get('thumbnails', [])
                thumb = thumbnails[-1]['url'] if thumbnails else ''
                artist_id = r['artists'][0]['id'] if r.get('artists') and r['artists'][0].get('id') else None
                
                clean_results.append({
                    "id": r['videoId'],
                    "title": r['title'],
                    "artist": r['artists'][0]['name'] if r.get('artists') else "Nieznany",
                    "artist_id": artist_id,
                    "thumbnail": thumb
                })
        return clean_results
    except Exception as e:
        print(f"Search error: {e}")
        return []

def get_suggestions(query: str):
    try:
        return ytmusic.get_search_suggestions(query)
    except:
        return []

def get_home_content(user_id):
    conn = database.get_db_connection()
    
    # 1. Sprawdź historię użytkownika
    last_played = conn.execute("""
        SELECT artist_name, artist_id FROM history 
        WHERE user_id = ? ORDER BY played_at DESC LIMIT 1
    """, (user_id,)).fetchone()
    
    recommendations = []
    section_title = ""
    
    # Próba rekomendacji na podstawie historii
    if last_played and last_played['artist_id']:
        try:
            radio = ytmusic.get_artist(last_played['artist_id'])
            # Próbujemy pobrać 'songs' z profilu artysty
            if 'songs' in radio and 'results' in radio['songs']:
                 results = radio['songs']['results']
            # Jeśli nie ma songs, szukamy 'singles'
            elif 'singles' in radio and 'results' in radio['singles']:
                 results = radio['singles']['results']
            else:
                 results = []

            for song in results[:8]:
                if song.get('videoId'):
                    recommendations.append({
                        "id": song['videoId'],
                        "title": song['title'],
                        "artist": song['artists'][0]['name'] if song.get('artists') else last_played['artist_name'],
                        "thumbnail": song['thumbnails'][-1]['url'] if song.get('thumbnails') else ''
                    })
            if recommendations:
                section_title = f"Ponieważ słuchasz {last_played['artist_name']}"
        except Exception as e:
            print(f"Artist recs error: {e}")
            pass
            
    # Jeśli brak rekomendacji (lub błąd), pobieramy HITY POLSKA metodą wyszukiwania (PEWNIEJSZE)
    if not recommendations:
        try:
            # Zamiast get_charts, które często zwraca puste wyniki, szukamy playlisty/piosenek
            search_hits = ytmusic.search("Hity Polska Rap Pop", filter='songs', limit=20)
            for song in search_hits:
                if song.get('videoId'):
                    recommendations.append({
                        "id": song['videoId'],
                        "title": song['title'],
                        "artist": song['artists'][0]['name'] if song.get('artists') else "Różni wykonawcy",
                        "thumbnail": song['thumbnails'][-1]['url'] if song.get('thumbnails') else ''
                    })
            section_title = "🔥 Hity na czasie w Polsce"
        except Exception as e:
            print(f"Hits error: {e}")
            section_title = "Nie udało się pobrać hitów"

    conn.close()
    return {"title": section_title, "tracks": recommendations}

def get_stream_url(video_id: str):
    ydl_opts = {
        'format': 'bestaudio/best', 
        'quiet': True, 
        'noplaylist': True, 
        'geo_bypass': True
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_id, download=False)
            return info['url']
    except:
        return None

def get_download_info(video_id: str):
    # Funkcja pomocnicza do pobierania
    ydl_opts = {'format': 'bestaudio/best', 'quiet': True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_id, download=False)
            return {"url": info['url'], "title": info['title']}
    except:
        return None