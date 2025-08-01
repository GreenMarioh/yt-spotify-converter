import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const backendUri = 'http://localhost:8888';

  const [spotifyToken, setSpotifyToken] = useState('');
  const [youtubeToken, setYoutubeToken] = useState('');
  const [youtubeRefreshToken, setYoutubeRefreshToken] = useState('');

  const [spotifyPlaylists, setSpotifyPlaylists] = useState([]);
  const [youtubePlaylists, setYoutubePlaylists] = useState([]);

  useEffect(() => {
    const storedSpotifyToken = localStorage.getItem('spotify_token');
    if (storedSpotifyToken) setSpotifyToken(storedSpotifyToken);

    const storedYoutubeToken = localStorage.getItem('youtube_token');
    if (storedYoutubeToken) setYoutubeToken(storedYoutubeToken);

    const storedYoutubeRefreshToken = localStorage.getItem('youtube_refresh_token');
    if (storedYoutubeRefreshToken) setYoutubeRefreshToken(storedYoutubeRefreshToken);

    const params = new URLSearchParams(window.location.search);
    const spotify_token = params.get('spotify_access_token');
    const youtube_token = params.get('youtube_access_token');
    const youtube_refresh_token = params.get('youtube_refresh_token');

    if (spotify_token) {
      localStorage.setItem('spotify_token', spotify_token);
      setSpotifyToken(spotify_token);
      window.history.pushState({}, null, "/");
    }
    if (youtube_token) {
      localStorage.setItem('youtube_token', youtube_token);
      setYoutubeToken(youtube_token);

      if (youtube_refresh_token) {
        localStorage.setItem('youtube_refresh_token', youtube_refresh_token);
        setYoutubeRefreshToken(youtube_refresh_token);
      }
      window.history.pushState({}, null, "/");
    }
  }, []);

  const logout = () => {
    setSpotifyToken('');
    setYoutubeToken('');
    setYoutubeRefreshToken('');
    setSpotifyPlaylists([]);
    setYoutubePlaylists([]);
    localStorage.removeItem('spotify_token');
    localStorage.removeItem('youtube_token');
    localStorage.removeItem('youtube_refresh_token');
  };

  const fetchSpotifyPlaylists = async () => {
    if (!spotifyToken) return;
    try {
      const { data } = await axios.get(`${backendUri}/spotify/playlists`, {
        headers: { 'Authorization': `Bearer ${spotifyToken}` }
      });
      setSpotifyPlaylists(data.items);
    } catch (error) {
      console.error('Error fetching Spotify playlists:', error);
      alert('Could not fetch Spotify playlists. Your token might have expired. Please connect again.');
      // NOTE: We would add Spotify refresh logic here, similar to YouTube's.
      logout();
    }
  };

  const fetchYoutubePlaylists = async () => {
    if (!youtubeToken) return;
    try {
      const { data } = await axios.get(`${backendUri}/youtube/playlists`, {
        headers: { 'Authorization': `Bearer ${youtubeToken}` }
      });
      setYoutubePlaylists(data.items);
    } catch (error) {
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        console.log('YouTube token expired, attempting to refresh...');
        try {
          const { data } = await axios.post(`${backendUri}/refresh/youtube`, {
            refresh_token: youtubeRefreshToken
          });

          const newAccessToken = data.access_token;
          setYoutubeToken(newAccessToken);
          localStorage.setItem('youtube_token', newAccessToken);

          const refreshedResponse = await axios.get(`${backendUri}/youtube/playlists`, {
            headers: { 'Authorization': `Bearer ${newAccessToken}` }
          });
          setYoutubePlaylists(refreshedResponse.data.items);

        } catch (refreshError) {
          alert('Could not refresh your YouTube session. Please connect again.');
          logout();
        }
      } else {
        console.error('Error fetching YouTube playlists:', error);
        alert('An error occurred while fetching YouTube playlists.');
        logout();
      }
    }
  };

  const convertPlaylist = async (playlist) => {
    if (!youtubeToken) {
      alert('Please connect to YouTube first!');
      return;
    }
    const newPlaylistName = `${playlist.name} (from Spotify)`;
    alert(`Starting conversion for "${playlist.name}". This may take a moment...`);
    try {
      await axios.post(`${backendUri}/convert/spotify-to-youtube`, {
        spotifyToken: spotifyToken,
        youtubeToken: youtubeToken,
        spotifyPlaylistId: playlist.id,
        newYoutubePlaylistName: newPlaylistName,
      });
      alert(`Successfully converted "${playlist.name}"! Check your YouTube account.`);
    } catch (error) {
      console.error('Conversion failed:', error);
      alert('An error occurred during conversion.');
    }
  };

  const convertYoutubePlaylist = async (playlist) => {
    if (!spotifyToken) {
      alert('Please connect to Spotify first!');
      return;
    }
    const newPlaylistName = `${playlist.snippet.title} (from YouTube)`;
    alert(`Starting conversion for "${playlist.snippet.title}". This may take a moment...`);
    try {
      await axios.post(`${backendUri}/convert/youtube-to-spotify`, {
        youtubeToken: youtubeToken,
        spotifyToken: spotifyToken,
        youtubePlaylistId: playlist.id,
        newSpotifyPlaylistName: newPlaylistName,
      });
      alert(`Successfully converted "${playlist.snippet.title}"! Check your Spotify account.`);
    } catch (error) {
      console.error('Conversion failed:', error);
      alert('An error occurred during conversion.');
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Playlist Converter</h1>
        {(spotifyToken || youtubeToken) && (
          <button className="logout-button" onClick={logout}>
            Logout / Reset
          </button>
        )}
        <div className="connections">
          <div className="connection-box">
            <h2>Spotify</h2>
            {!spotifyToken ? (
              <a className="login-button spotify" href={`${backendUri}/login/spotify`}>
                Connect with Spotify
              </a>
            ) : (
              <div>
                <p className="connected-text">✅ Connected</p>
                <button className="fetch-button" onClick={fetchSpotifyPlaylists}>
                  Fetch Playlists
                </button>
              </div>
            )}
          </div>

          <div className="connection-box">
            <h2>YouTube</h2>
            {!youtubeToken ? (
              <a className="login-button youtube" href={`${backendUri}/login/youtube`}>
                Connect with YouTube
              </a>
            ) : (
              <div>
                <p className="connected-text">✅ Connected</p>
                <button className="fetch-button" onClick={fetchYoutubePlaylists}>
                  Fetch Playlists
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="playlists-container">
          <div className="playlist-column">
            <h3>Your Spotify Playlists</h3>
            <ul>
              {spotifyPlaylists.map(playlist => (
                <li key={playlist.id} className="playlist-item">
                  <span>{playlist.name}</span>
                  <button
                    className="convert-button"
                    onClick={() => convertPlaylist(playlist)}
                    disabled={!youtubeToken}
                  >
                    Convert
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="playlist-column">
            <h3>Your YouTube Playlists</h3>
            <ul>
              {youtubePlaylists.map(playlist => (
                <li key={playlist.id} className="playlist-item">
                  <span>{playlist.snippet.title}</span>
                  <button
                    className="convert-button"
                    onClick={() => convertYoutubePlaylist(playlist)}
                    disabled={!spotifyToken}
                  >
                    Convert
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </header>
    </div>
  );
}

export default App;