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

app.use(cors());
app.use(express.json());

// Helper function to extract playlist ID from Spotify URL or return as-is if already an ID
function extractSpotifyPlaylistId(input) {
    if (!input) return null;
    
    // If it's a URL, extract the ID
    const urlMatch = input.match(/playlist\/([a-zA-Z0-9]+)/);
    if (urlMatch) {
        return urlMatch[1];
    }
    
    // If it's already an ID (alphanumeric string), return as-is
    if (/^[a-zA-Z0-9]+$/.test(input)) {
        return input;
    }
    
    return null;
}

// Helper function to extract playlist ID from YouTube URL or return as-is if already an ID
function extractYouTubePlaylistId(input) {
    if (!input) return null;
    
    // If it's a URL, extract the ID
    const urlMatch = input.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (urlMatch) {
        return urlMatch[1];
    }
    
    // If it's already an ID, return as-is
    if (/^[a-zA-Z0-9_-]+$/.test(input)) {
        return input;
    }
    
    return null;
}

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
        res.redirect(`${frontendUri}?spotify_access_token=${access_token}`);
    } catch (error) {
        console.error('Spotify callback error:', error.response?.data || error.message);
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
        res.redirect(`${frontendUri}?youtube_access_token=${access_token}`);
    } catch (error) {
        console.error('YouTube callback error:', error.response?.data || error.message);
        res.redirect(`${frontendUri}?error=auth_error`);
    }
});

// --- QUOTA MONITORING ---
app.get('/youtube/quota-usage', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        // Make a simple API call to check if quota is available
        const testResponse = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
            params: { 
                part: 'snippet',
                mine: 'true',
                maxResults: 1
            },
            headers: { 'Authorization': `Bearer ${token}` }
        });

        res.json({ 
            status: 'API quota available',
            message: 'You can make YouTube API requests',
            quotaCost: 'This test request cost 1 quota unit'
        });
    } catch (error) {
        if (error.response?.status === 403) {
            const errorMessage = error.response.data?.error?.message || '';
            if (errorMessage.includes('quota')) {
                res.status(403).json({
                    status: 'Quota exceeded',
                    message: 'YouTube API quota has been exceeded',
                    error: errorMessage,
                    suggestion: 'Wait until quota resets (midnight Pacific Time) or request quota increase'
                });
            } else {
                res.status(403).json({
                    status: 'API access denied',
                    message: 'Check your API permissions',
                    error: errorMessage
                });
            }
        } else {
            res.status(error.response?.status || 500).json({
                status: 'API error',
                error: error.response?.data || error.message
            });
        }
    }
});

// --- API ROUTES ---
app.get('/spotify/playlists', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const response = await axios.get('https://api.spotify.com/v1/me/playlists', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Spotify playlists error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ error: 'Failed to fetch playlists' });
    }
});

app.get('/youtube/playlists', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/playlists', {
            params: { part: 'snippet', mine: 'true', maxResults: 50 },
            headers: { 'Authorization': `Bearer ${token}` }
        });
        res.json(response.data);
    } catch (error) {
        console.error('YouTube playlists error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ error: 'Failed to fetch playlists' });
    }
});

app.post('/convert/spotify-to-youtube', async (req, res) => {
    const { spotifyToken, youtubeToken, spotifyPlaylistId, newYoutubePlaylistName, batchSize = 10, optimizeQuota = true } = req.body;

    // Validate required fields
    if (!spotifyToken || !youtubeToken || !spotifyPlaylistId || !newYoutubePlaylistName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Extract and validate playlist ID
    const cleanSpotifyPlaylistId = extractSpotifyPlaylistId(spotifyPlaylistId);
    if (!cleanSpotifyPlaylistId) {
        return res.status(400).json({ error: 'Invalid Spotify playlist ID or URL' });
    }

    try {
        console.log(`Fetching Spotify playlist: ${cleanSpotifyPlaylistId}`);
        
        // Fetch Spotify playlist tracks
        const spotifyTracksResponse = await axios.get(
            `https://api.spotify.com/v1/playlists/${cleanSpotifyPlaylistId}/tracks`,
            { headers: { Authorization: `Bearer ${spotifyToken}` } }
        );

        const spotifyTracks = spotifyTracksResponse.data.items;
        console.log(`Found ${spotifyTracks.length} tracks in Spotify playlist`);

        // Limit to batchSize to avoid quota issues
        const tracksToProcess = spotifyTracks.slice(0, Math.min(batchSize, spotifyTracks.length));
        console.log(`Processing ${tracksToProcess.length} tracks (batch size: ${batchSize})`);

        // Create new YouTube playlist
        const newYoutubePlaylistResponse = await axios.post(
            'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status',
            {
                snippet: {
                    title: newYoutubePlaylistName,
                    description: `Converted from Spotify (${tracksToProcess.length}/${spotifyTracks.length} tracks)`
                },
                status: { privacyStatus: 'private' }
            },
            { headers: { Authorization: `Bearer ${youtubeToken}` } }
        );

        const newYoutubePlaylistId = newYoutubePlaylistResponse.data.id;
        console.log(`Created YouTube playlist: ${newYoutubePlaylistId}`);

        let addedCount = 0;
        let skippedCount = 0;
        let quotaUsed = 50; // Creating playlist costs 50 units

        // Group tracks by artist to potentially batch searches
        const tracksByArtist = {};
        if (optimizeQuota) {
            tracksToProcess.forEach((item, index) => {
                const track = item.track;
                if (track && track.artists && track.artists[0]) {
                    const artist = track.artists[0].name.toLowerCase();
                    if (!tracksByArtist[artist]) tracksByArtist[artist] = [];
                    tracksByArtist[artist].push({ track, originalIndex: index });
                }
            });
        }

        // Convert each track with quota optimization
        for (let i = 0; i < tracksToProcess.length; i++) {
            const item = tracksToProcess[i];
            const track = item.track;
            
            if (!track || !track.name || !track.artists || track.artists.length === 0) {
                skippedCount++;
                continue;
            }

            // Optimize search query to be more specific and likely to find results
            let query;
            if (optimizeQuota) {
                // More targeted search queries that are more likely to succeed
                const artistName = track.artists[0].name;
                const trackName = track.name;
                
                // Remove common words that might confuse search
                const cleanTrackName = trackName
                    .replace(/\(feat\.|featuring|ft\.|with\)/gi, '')
                    .replace(/\[.*?\]/g, '')
                    .replace(/\(.*?remix.*?\)/gi, '')
                    .trim();
                
                const cleanArtistName = artistName
                    .replace(/\s*&\s*.*/, '') // Take only first artist if multiple
                    .trim();

                // Try most specific query first
                query = `"${cleanTrackName}" "${cleanArtistName}"`;
            } else {
                query = `${track.name} ${track.artists[0].name} official audio`;
            }

            console.log(`Processing ${i + 1}/${tracksToProcess.length}: ${query}`);
            
            try {
                const youtubeSearchResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                    params: {
                        part: 'snippet',
                        type: 'video',
                        maxResults: optimizeQuota ? 3 : 1, // Get more results to increase success chance
                        q: query,
                        videoCategoryId: '10', // Music category
                        order: 'relevance'
                    },
                    headers: { 'Authorization': `Bearer ${youtubeToken}` }
                });

                quotaUsed += 100; // Search costs 100 units

                let videoId = null;
                const searchResults = youtubeSearchResponse.data.items;

                if (optimizeQuota && searchResults.length > 0) {
                    // Smart selection: prefer official channels, audio versions, etc.
                    const preferredVideo = searchResults.find(video => {
                        const title = video.snippet.title.toLowerCase();
                        const channelTitle = video.snippet.channelTitle.toLowerCase();
                        const artistName = track.artists[0].name.toLowerCase();
                        
                        return (
                            channelTitle.includes(artistName) || // Artist's channel
                            channelTitle.includes('records') ||  // Record label
                            channelTitle.includes('music') ||    // Music channel
                            title.includes('official') ||       // Official video
                            title.includes('audio')             // Audio version
                        );
                    });
                    
                    videoId = (preferredVideo || searchResults[0]).id.videoId;
                } else {
                    videoId = searchResults[0]?.id.videoId;
                }

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
                    
                    quotaUsed += 50; // Adding to playlist costs 50 units
                    addedCount++;
                    console.log(`✓ Added: ${track.name} by ${track.artists[0].name} (${quotaUsed} quota used)`);
                } else {
                    skippedCount++;
                    console.log(`✗ No video found for: ${query}`);
                }
            } catch (searchError) {
                if (searchError.response?.status === 403) {
                    console.log(`⚠️ YouTube API quota exceeded after ${quotaUsed} units. Stopping conversion.`);
                    break;
                }
                skippedCount++;
                console.log(`✗ Could not find or add track: ${query}`, searchError.response?.data?.error?.message || searchError.message);
            }

            // Dynamic delay based on quota usage
            const delay = optimizeQuota ? 500 : 1000; // Shorter delay when optimizing
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Stop if we're approaching quota limit (leave some buffer)
            if (optimizeQuota && quotaUsed > 9500) {
                console.log('⚠️ Approaching quota limit, stopping conversion to avoid exceeding.');
                break;
            }
        }

        const estimatedMaxSongs = Math.floor((10000 - quotaUsed) / 150) + addedCount;

        res.status(200).json({ 
            message: addedCount > 0 ? 'Playlist converted successfully!' : 'Conversion completed but no tracks were added due to quota limits or search failures.',
            stats: {
                total: spotifyTracks.length,
                processed: tracksToProcess.length,
                added: addedCount,
                skipped: skippedCount,
                quotaUsed: quotaUsed,
                estimatedMaxSongsPerDay: estimatedMaxSongs
            },
            optimization: optimizeQuota ? 'Quota optimization enabled' : 'Standard mode',
            warning: addedCount === 0 ? 'YouTube API quota may have been exceeded. Try again later or reduce playlist size.' : null,
            playlistId: newYoutubePlaylistId
        });
    } catch (error) {
        console.error('Full conversion error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to convert playlist.',
            details: error.response?.data?.error?.message || error.message
        });
    }
});

app.post('/convert/youtube-to-spotify', async (req, res) => {
    const { youtubeToken, spotifyToken, youtubePlaylistId, newSpotifyPlaylistName } = req.body;

    // Validate required fields
    if (!youtubeToken || !spotifyToken || !youtubePlaylistId || !newSpotifyPlaylistName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Extract and validate playlist ID
    const cleanYouTubePlaylistId = extractYouTubePlaylistId(youtubePlaylistId);
    if (!cleanYouTubePlaylistId) {
        return res.status(400).json({ error: 'Invalid YouTube playlist ID or URL' });
    }

    try {
        console.log(`Fetching YouTube playlist: ${cleanYouTubePlaylistId}`);

        // Fetch YouTube playlist items
        const playlistItemsResponse = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
            params: {
                part: 'snippet',
                playlistId: cleanYouTubePlaylistId,
                maxResults: 50,
            },
            headers: { 'Authorization': `Bearer ${youtubeToken}` }
        });

        const youtubeVideos = playlistItemsResponse.data.items;
        console.log(`Found ${youtubeVideos.length} videos in YouTube playlist`);

        // Get Spotify user ID
        const meResponse = await axios.get('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${spotifyToken}` }
        });
        const spotifyUserId = meResponse.data.id;

        // Create new Spotify playlist
        const newSpotifyPlaylistResponse = await axios.post(
            `https://api.spotify.com/v1/users/${spotifyUserId}/playlists`,
            {
                name: newSpotifyPlaylistName,
                description: 'Converted from YouTube',
                public: false
            },
            {
                headers: { Authorization: `Bearer ${spotifyToken}` }
            }
        );

        const newSpotifyPlaylistId = newSpotifyPlaylistResponse.data.id;
        console.log(`Created Spotify playlist: ${newSpotifyPlaylistId}`);

        const spotifyTrackUris = [];
        let foundCount = 0;
        let skippedCount = 0;

        // Convert each video
        for (const item of youtubeVideos) {
            const videoTitle = item.snippet.title;
            const cleanQuery = videoTitle
                .replace(/official music video/i, '')
                .replace(/lyric video/i, '')
                .replace(/lyrics/i, '')
                .replace(/\[.*?\]/g, '')
                .replace(/\(.*?\)/g, '')
                .trim();

            try {
                const searchResponse = await axios.get('https://api.spotify.com/v1/search', {
                    params: {
                        q: cleanQuery,
                        type: 'track',
                        limit: 1
                    },
                    headers: { Authorization: `Bearer ${spotifyToken}` }
                });

                const trackUri = searchResponse.data.tracks.items[0]?.uri;
                if (trackUri) {
                    spotifyTrackUris.push(trackUri);
                    foundCount++;
                    console.log(`Found: ${searchResponse.data.tracks.items[0].name} by ${searchResponse.data.tracks.items[0].artists[0].name}`);
                } else {
                    skippedCount++;
                    console.log(`No Spotify track found for: ${cleanQuery}`);
                }
            } catch (searchError) {
                skippedCount++;
                console.log(`Could not find Spotify track for: ${cleanQuery}`, searchError.response?.data || searchError.message);
            }

            // Add small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Add tracks to playlist in batches (Spotify allows max 100 tracks per request)
        if (spotifyTrackUris.length > 0) {
            const batchSize = 100;
            for (let i = 0; i < spotifyTrackUris.length; i += batchSize) {
                const batch = spotifyTrackUris.slice(i, i + batchSize);
                await axios.post(
                    `https://api.spotify.com/v1/playlists/${newSpotifyPlaylistId}/tracks`,
                    { uris: batch },
                    { headers: { Authorization: `Bearer ${spotifyToken}` } }
                );
            }
            console.log(`Added ${spotifyTrackUris.length} tracks to Spotify playlist`);
        }

        res.status(200).json({ 
            message: 'Playlist converted successfully!',
            stats: {
                total: youtubeVideos.length,
                found: foundCount,
                skipped: skippedCount
            }
        });
    } catch (error) {
        console.error('Full conversion error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to convert playlist.',
            details: error.response?.data?.error?.message || error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server listening on http://127.0.0.1:${PORT}`);
});