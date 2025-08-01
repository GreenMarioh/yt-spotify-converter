const express = require('express');
const cors = require('cors');
const querystring = require('querystring');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8888;

const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const spotifyRedirectUri = 'http://127.0.0.1:8888/callback/spotify';

const youtubeClientId = process.env.YOUTUBE_CLIENT_ID;
const youtubeClientSecret = process.env.YOUTUBE_CLIENT_SECRET;
const youtubeRedirectUri = 'http://127.0.0.1:8888/callback/youtube';

const frontendUri = 'http://localhost:3000';

// Middlewares
app.use(cors());
app.use(express.json());

// --- AUTHENTICATION ROUTES ---
app.get('/login/spotify', (req, res) => {
    const scope = 'playlist-read-private playlist-modify-public playlist-modify-private';
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: spotifyClientId,
            scope: scope,
            redirect_uri: spotifyRedirectUri,
        }));
});

app.get('/login/youtube', (req, res) => {
    const scope = 'https://www.googleapis.com/auth/youtube.force-ssl';
    res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' +
        querystring.stringify({
            client_id: youtubeClientId,
            redirect_uri: youtubeRedirectUri,
            response_type: 'code',
            scope: scope,
            access_type: 'offline',
            prompt: 'consent'
        }));
});

// --- CALLBACK ROUTES ---
app.get('/callback/spotify', async (req, res) => {
    const code = req.query.code || null;
    try {
        const response = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: querystring.stringify({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: spotifyRedirectUri
            }),
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + (Buffer.from(spotifyClientId + ':' + spotifyClientSecret).toString('base64'))
            }
        });
        const { access_token, refresh_token } = response.data;
        res.redirect(`${frontendUri}?spotify_access_token=${access_token}&spotify_refresh_token=${refresh_token}`);
    } catch (error) {
        res.redirect(`${frontendUri}?error=auth_error`);
    }
});

app.get('/callback/youtube', async (req, res) => {
    const code = req.query.code;
    try {
        const response = await axios({
            method: 'post',
            url: 'https://oauth2.googleapis.com/token',
            data: querystring.stringify({
                code: code,
                client_id: youtubeClientId,
                client_secret: youtubeClientSecret,
                redirect_uri: youtubeRedirectUri,
                grant_type: 'authorization_code'
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const { access_token, refresh_token } = response.data;
        res.redirect(`${frontendUri}?youtube_access_token=${access_token}&youtube_refresh_token=${refresh_token}`);
    } catch (error) {
        res.redirect(`${frontendUri}?error=auth_error`);
    }
});

// --- REFRESH ROUTE ---
app.post('/refresh/youtube', async (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) {
        return res.status(400).json({ error: 'Refresh token is missing.' });
    }
    try {
        const response = await axios({
            method: 'post',
            url: 'https://oauth2.googleapis.com/token',
            data: querystring.stringify({
                client_id: youtubeClientId,
                client_secret: youtubeClientSecret,
                refresh_token: refresh_token,
                grant_type: 'refresh_token'
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        res.json({
            access_token: response.data.access_token,
        });
    } catch (error) {
        console.error('Could not refresh YouTube token:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
});


// --- API ROUTES ---
app.get('/spotify/playlists', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    try {
        const response = await axios.get('https://api.spotify.com/v1/me/playlists', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        res.json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: 'Failed to fetch playlists' });
    }
});

app.get('/youtube/playlists', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    try {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/playlists', {
            params: { part: 'snippet', mine: 'true', maxResults: 50 },
            headers: { 'Authorization': `Bearer ${token}` }
        });
        res.json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: 'Failed to fetch playlists' });
    }
});

// --- CONVERSION ROUTES ---
app.post('/convert/spotify-to-youtube', async (req, res) => {
    const { spotifyToken, youtubeToken, spotifyPlaylistId, newYoutubePlaylistName } = req.body;
    try {
        const spotifyTracksResponse = await axios.get(`https://api.spotify.com/v1/playlists/$$$${spotifyPlaylistId}/tracks`, {
            headers: { 'Authorization': `Bearer ${spotifyToken}` }
        });
        const spotifyTracks = spotifyTracksResponse.data.items;

        const newYoutubePlaylistResponse = await axios.post('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', {
            snippet: {
                title: newYoutubePlaylistName,
                description: 'Converted from Spotify'
            },
            status: { privacyStatus: 'private' }
        }, {
            headers: { 'Authorization': `Bearer ${youtubeToken}` }
        });
        const newYoutubePlaylistId = newYoutubePlaylistResponse.data.id;

        for (const item of spotifyTracks) {
            const track = item.track;
            if (!track || !track.name || !track.artists || track.artists.length === 0) continue;
            const query = `${track.name} ${track.artists[0].name} official audio`;
            try {
                const youtubeSearchResponse = await axios.get('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1', {
                    params: { q: query },
                    headers: { 'Authorization': `Bearer ${youtubeToken}` }
                });
                const videoId = youtubeSearchResponse.data.items[0]?.id.videoId;
                if (videoId) {
                    await axios.post('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
                        snippet: {
                            playlistId: newYoutubePlaylistId,
                            resourceId: {
                                kind: 'youtube#video',
                                videoId: videoId
                            }
                        }
                    }, {
                        headers: { 'Authorization': `Bearer ${youtubeToken}` }
                    });
                }
            } catch (searchError) {
                console.log(`Could not find or add track: ${query}`);
            }
        }
        res.status(200).json({ message: 'Playlist converted successfully!' });
    } catch (error) {
        console.error('Full conversion error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to convert playlist.' });
    }
});

app.post('/convert/youtube-to-spotify', async (req, res) => {
    const { youtubeToken, spotifyToken, youtubePlaylistId, newSpotifyPlaylistName } = req.body;
    try {
        const playlistItemsResponse = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
            params: {
                part: 'snippet',
                playlistId: youtubePlaylistId,
                maxResults: 50,
            },
            headers: { 'Authorization': `Bearer ${youtubeToken}` }
        });
        const youtubeVideos = playlistItemsResponse.data.items;

        const meResponse = await axios.get('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${spotifyToken}` }
        });
        const spotifyUserId = meResponse.data.id;

        const newSpotifyPlaylistResponse = await axios.post(`https://www.google.com/url?sa=E&source=gmail&q=https://api.spotify.com/v1/me/playlists$${spotifyUserId}/playlists`, {
            name: newSpotifyPlaylistName,
            description: 'Converted from YouTube',
            public: false
        }, {
            headers: { 'Authorization': `Bearer ${spotifyToken}` }
        });
        const newSpotifyPlaylistId = newSpotifyPlaylistResponse.data.id;

        const spotifyTrackUris = [];
        for (const item of youtubeVideos) {
            const videoTitle = item.snippet.title;
            const cleanQuery = videoTitle
                .replace(/official music video/i, '')
                .replace(/lyric video/i, '')
                .replace(/lyrics/i, '')
                .replace(/\[.*?\]/g, '')
                .replace(/\(.*?\)/g, '');
            try {
                const searchResponse = await axios.get('https://api.spotify.com/v1/playlists/$$$', {
                    params: {
                        q: cleanQuery,
                        type: 'track',
                        limit: 1
                    },
                    headers: { 'Authorization': `Bearer ${spotifyToken}` }
                });
                const trackUri = searchResponse.data.tracks.items[0]?.uri;
                if (trackUri) {
                    spotifyTrackUris.push(trackUri);
                }
            } catch (searchError) {
                console.log(`Could not find Spotify track for: ${cleanQuery}`);
            }
        }

        if (spotifyTrackUris.length > 0) {
            await axios.post(`https://www.google.com/url?sa=E&source=gmail&q=https://api.spotify.com/v1/me/playlists$${newSpotifyPlaylistId}/tracks`, {
                uris: spotifyTrackUris
            }, {
                headers: { 'Authorization': `Bearer ${spotifyToken}` }
            });
        }
        res.status(200).json({ message: 'Playlist converted successfully!' });
    } catch (error) {
        console.error('Full conversion error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to convert playlist.' });
    }
});


app.listen(PORT, () => {
    console.log(`🚀 Server listening on http://127.0.0.1:${PORT}`);
});