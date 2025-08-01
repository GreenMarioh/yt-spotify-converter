# Spotify <---> YouTube Playlist Converter 🎵➡️📺

This project allows you to convert a Spotify playlist into a private YouTube playlist by searching for matching videos (usually official audio) on YouTube and vice versa.

## 🔧 Features

- Login with Spotify and YouTube using OAuth2
- Fetch and display playlists from both platforms
- Convert Spotify playlists to YouTube playlists and vice versa.
- Automatically searches for official audio on YouTube
- Uses YouTube Data API v3 to create and add videos to a new playlist

---

## 🚀 How to Run This Project

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/spotify-youtube-converter.git
cd spotify-youtube-converter
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up your `.env` file

Create a `.env` file in the root directory with the following content:

```
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
```

### 4. Run the backend server

```bash
node index.js
```

This will start the backend on `http://127.0.0.1:8888`.

Make sure your frontend is served on `http://localhost:3000` as it's hardcoded in the redirect URIs.

---

## 🔑 How to Obtain Tokens

### Spotify

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
2. Create an app
3. Set the Redirect URI to: `http://127.0.0.1:8888/callback/spotify`
4. Copy your `Client ID` and `Client Secret` into your `.env`

### YouTube

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project and enable **YouTube Data API v3**
3. Go to **OAuth consent screen** and configure it
4. Create OAuth2.0 credentials with:
   - Application type: Web application
   - Redirect URI: `http://127.0.0.1:8888/callback/youtube`
5. Copy the `Client ID` and `Client Secret` into your `.env`

---

## ⚠️ Disclaimer

- This app uses the YouTube Data API v3.
- The quota for YouTube search + playlist insertions is limited.
- Due to API quota limits, **only ~80–90 songs** can be converted per day on a free quota.
- Make sure to monitor your usage if you're converting large playlists or frequently.

---
