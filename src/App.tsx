/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Search, 
  Heart, 
  Play, 
  Pause, 
  Sparkles, 
  Music, 
  Trash2, 
  Plus, 
  Volume2,
  ChevronRight,
  Loader2,
  X,
  Youtube,
  Maximize2,
  Minimize2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
// @ts-ignore
import ReactPlayerImport from "react-player";
const ReactPlayer = ReactPlayerImport as any;

// Types
interface Track {
  trackId: string;
  trackName: string;
  artistName: string;
  artworkUrl: string;
  previewUrl: string;
  collectionName?: string;
  primaryGenreName?: string;
  youtubeId?: string;
}

interface Interest extends Track {
  id: number;
  createdAt: string;
}

// Utility for Tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Gemini Service
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export default function App() {
  const [activeTab, setActiveTab] = useState<"search" | "interests" | "ai">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullMode, setIsFullMode] = useState(false);
  const [isLoadingFull, setIsLoadingFull] = useState(false);
  const [recommendations, setRecommendations] = useState<Track[]>([]);
  const [isRecommending, setIsRecommending] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch interests on mount
  useEffect(() => {
    fetchInterests();
  }, []);

  const fetchInterests = async () => {
    try {
      const response = await axios.get("/api/interests");
      setInterests(response.data);
    } catch (error) {
      console.error("Failed to fetch interests", error);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&entity=song&limit=20`);
      const tracks = response.data.results.map((item: any) => ({
        trackId: item.trackId.toString(),
        trackName: item.trackName,
        artistName: item.artistName,
        artworkUrl: item.artworkUrl100.replace("100x100", "400x400"),
        previewUrl: item.previewUrl,
        collectionName: item.collectionName,
        primaryGenreName: item.primaryGenreName
      }));
      setSearchResults(tracks);
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleInterest = async (track: Track) => {
    const isInterested = interests.some(i => i.trackId === track.trackId);
    if (isInterested) {
      try {
        await axios.delete(`/api/interests/${track.trackId}`);
        setInterests(prev => prev.filter(i => i.trackId !== track.trackId));
      } catch (error) {
        console.error("Failed to remove interest", error);
      }
    } else {
      try {
        await axios.post("/api/interests", track);
        fetchInterests();
      } catch (error) {
        console.error("Failed to add interest", error);
      }
    }
  };

  const getYouTubeId = async (track: Track) => {
    try {
      const prompt = `Find the official YouTube video ID for the song "${track.trackName}" by "${track.artistName}". Return ONLY the 11-character video ID string. No other text.`;
      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      return response.text?.trim();
    } catch (error) {
      console.error("Failed to get YouTube ID", error);
      return null;
    }
  };

  const playTrack = async (track: Track, full: boolean = false) => {
    if (full) {
      setIsLoadingFull(true);
      const ytId = track.youtubeId || await getYouTubeId(track);
      setIsLoadingFull(false);
      
      if (ytId) {
        const updatedTrack = { ...track, youtubeId: ytId };
        setCurrentTrack(updatedTrack);
        setIsFullMode(true);
        setIsPlaying(true);
        audioRef.current?.pause();
      } else {
        alert("Could not find full version on YouTube.");
      }
      return;
    }

    if (currentTrack?.trackId === track.trackId) {
      if (isPlaying) {
        setIsPlaying(false);
        if (!isFullMode) audioRef.current?.pause();
      } else {
        setIsPlaying(true);
        if (!isFullMode) audioRef.current?.play();
      }
    } else {
      setIsFullMode(false);
      setCurrentTrack(track);
      setIsPlaying(true);
      if (audioRef.current) {
        audioRef.current.src = track.previewUrl;
        audioRef.current.play();
      }
    }
  };

  const getAIRecommendations = async () => {
    if (interests.length === 0) {
      alert("Add some songs to your interests first!");
      return;
    }

    setIsRecommending(true);
    setActiveTab("ai");
    try {
      const interestList = interests.map(i => `${i.trackName} by ${i.artistName}`).join(", ");
      const prompt = `Based on these songs I like: ${interestList}, suggest 5 other songs I might enjoy. Return the result as a JSON array of objects with "trackName" and "artistName" properties. Only return the JSON.`;
      
      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const suggestedSongs = JSON.parse(response.text || "[]");
      
      const detailedRecs: Track[] = [];
      for (const song of suggestedSongs) {
        const searchRes = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(`${song.trackName} ${song.artistName}`)}&entity=song&limit=1`);
        if (searchRes.data.results.length > 0) {
          const item = searchRes.data.results[0];
          detailedRecs.push({
            trackId: item.trackId.toString(),
            trackName: item.trackName,
            artistName: item.artistName,
            artworkUrl: item.artworkUrl100.replace("100x100", "400x400"),
            previewUrl: item.previewUrl,
            collectionName: item.collectionName,
            primaryGenreName: item.primaryGenreName
          });
        }
      }
      setRecommendations(detailedRecs);
    } catch (error) {
      console.error("AI Recommendation failed", error);
    } finally {
      setIsRecommending(false);
    }
  };

  return (
    <div className="relative h-screen w-full flex overflow-hidden bg-black">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 atmosphere z-0 pointer-events-none" />

      {/* Sidebar */}
      <aside className="w-64 glass z-10 flex flex-col border-r border-white/10">
        <div className="p-8">
          <h1 className="text-2xl font-serif italic tracking-wider text-white flex items-center gap-2">
            <Music className="w-6 h-6 text-orange-500" />
            Melodix
          </h1>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <SidebarItem 
            icon={<Search size={20} />} 
            label="Search" 
            active={activeTab === "search"} 
            onClick={() => setActiveTab("search")} 
          />
          <SidebarItem 
            icon={<Heart size={20} />} 
            label="My Interests" 
            active={activeTab === "interests"} 
            onClick={() => setActiveTab("interests")} 
          />
          <SidebarItem 
            icon={<Sparkles size={20} />} 
            label="AI For You" 
            active={activeTab === "ai"} 
            onClick={getAIRecommendations} 
          />
        </nav>

        <div className="p-6">
          <div className="glass rounded-2xl p-4 border border-white/5">
            <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Now Playing</p>
            {currentTrack ? (
              <div className="flex items-center gap-3">
                <img 
                  src={currentTrack.artworkUrl} 
                  alt={currentTrack.trackName} 
                  className="w-10 h-10 rounded-lg object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{currentTrack.trackName}</p>
                  <p className="text-[10px] text-white/50 truncate">{currentTrack.artistName}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-white/30 italic">No track selected</p>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 z-10 flex flex-col overflow-hidden">
        {/* Header / Search Bar */}
        <header className="p-8 flex items-center justify-between">
          <div className="flex-1 max-w-xl">
            {activeTab === "search" && (
              <form onSubmit={handleSearch} className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-orange-500 transition-colors" size={18} />
                <input 
                  type="text" 
                  placeholder="Search for artists, songs, or albums..." 
                  className="w-full bg-white/5 border border-white/10 rounded-full py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-orange-500/50 focus:bg-white/10 transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </form>
            )}
            {activeTab === "interests" && (
              <h2 className="text-3xl font-serif italic">Your Interests</h2>
            )}
            {activeTab === "ai" && (
              <h2 className="text-3xl font-serif italic">AI Recommendations</h2>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {isLoadingFull && (
              <div className="flex items-center gap-2 text-xs text-orange-500 animate-pulse">
                <Loader2 size={14} className="animate-spin" />
                Finding full version...
              </div>
            )}
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-500 to-red-500 flex items-center justify-center text-xs font-bold">
              RN
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-8 pb-32 custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === "search" && (
              <motion.div 
                key="search"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              >
                {isSearching ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                    <p className="text-white/50 font-serif italic">Searching the universe...</p>
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((track) => (
                    <TrackCard 
                      key={track.trackId} 
                      track={track} 
                      onPlay={() => playTrack(track)}
                      onPlayFull={() => playTrack(track, true)}
                      onToggleInterest={() => toggleInterest(track)}
                      isInterested={interests.some(i => i.trackId === track.trackId)}
                      isPlaying={currentTrack?.trackId === track.trackId && isPlaying && !isFullMode}
                    />
                  ))
                ) : (
                  <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
                    <Music className="w-16 h-16 text-white/10 mb-4" />
                    <p className="text-white/40 max-w-xs">Search for your favorite music to start building your collection.</p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "interests" && (
              <motion.div 
                key="interests"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              >
                {interests.length > 0 ? (
                  interests.map((track) => (
                    <TrackCard 
                      key={track.trackId} 
                      track={track} 
                      onPlay={() => playTrack(track)}
                      onPlayFull={() => playTrack(track, true)}
                      onToggleInterest={() => toggleInterest(track)}
                      isInterested={true}
                      isPlaying={currentTrack?.trackId === track.trackId && isPlaying && !isFullMode}
                    />
                  ))
                ) : (
                  <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
                    <Heart className="w-16 h-16 text-white/10 mb-4" />
                    <p className="text-white/40 max-w-xs">You haven't added any interests yet. Search for songs and click the heart icon!</p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "ai" && (
              <motion.div 
                key="ai"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              >
                {isRecommending ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-20 gap-4">
                    <Sparkles className="w-8 h-8 text-orange-500 animate-pulse" />
                    <p className="text-white/50 font-serif italic">Gemini is curating your perfect playlist...</p>
                  </div>
                ) : recommendations.length > 0 ? (
                  recommendations.map((track) => (
                    <TrackCard 
                      key={track.trackId} 
                      track={track} 
                      onPlay={() => playTrack(track)}
                      onPlayFull={() => playTrack(track, true)}
                      onToggleInterest={() => toggleInterest(track)}
                      isInterested={interests.some(i => i.trackId === track.trackId)}
                      isPlaying={currentTrack?.trackId === track.trackId && isPlaying && !isFullMode}
                    />
                  ))
                ) : (
                  <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
                    <Sparkles className="w-16 h-16 text-white/10 mb-4" />
                    <p className="text-white/40 max-w-xs">AI recommendations will appear here based on your interests.</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Full Mode Player Overlay */}
      <AnimatePresence>
        {isFullMode && currentTrack?.youtubeId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center p-8"
          >
            <button 
              onClick={() => setIsFullMode(false)}
              className="absolute top-8 right-8 w-12 h-12 rounded-full glass flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <Minimize2 size={24} />
            </button>
            
            <div className="w-full max-w-4xl aspect-video rounded-3xl overflow-hidden shadow-2xl border border-white/10">
              <ReactPlayer 
                url={`https://www.youtube.com/watch?v=${currentTrack.youtubeId}`}
                playing={isPlaying}
                controls
                width="100%"
                height="100%"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            </div>

            <div className="mt-8 text-center">
              <h2 className="text-3xl font-serif italic mb-2">{currentTrack.trackName}</h2>
              <p className="text-white/50">{currentTrack.artistName}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Audio Player Bar */}
      <AnimatePresence>
        {currentTrack && !isFullMode && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-0 left-0 right-0 h-24 glass z-50 border-t border-white/10 px-8 flex items-center justify-between"
          >
            <div className="flex items-center gap-4 w-1/3">
              <img 
                src={currentTrack.artworkUrl} 
                alt={currentTrack.trackName} 
                className="w-14 h-14 rounded-xl object-cover shadow-2xl"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0">
                <h4 className="text-sm font-semibold truncate">{currentTrack.trackName}</h4>
                <p className="text-xs text-white/50 truncate">{currentTrack.artistName}</p>
              </div>
              <button 
                onClick={() => toggleInterest(currentTrack)}
                className={cn(
                  "ml-2 transition-colors",
                  interests.some(i => i.trackId === currentTrack.trackId) ? "text-orange-500" : "text-white/30 hover:text-white"
                )}
              >
                <Heart size={18} fill={interests.some(i => i.trackId === currentTrack.trackId) ? "currentColor" : "none"} />
              </button>
            </div>

            <div className="flex flex-col items-center gap-2 w-1/3">
              <div className="flex items-center gap-6">
                <button className="text-white/40 hover:text-white transition-colors"><ChevronRight className="rotate-180" size={20} /></button>
                <button 
                  onClick={() => playTrack(currentTrack)}
                  className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
                >
                  {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                </button>
                <button className="text-white/40 hover:text-white transition-colors"><ChevronRight size={20} /></button>
              </div>
              <div className="w-full max-w-md h-1 bg-white/10 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-orange-500"
                  animate={{ width: isPlaying ? "100%" : "0%" }}
                  transition={{ duration: 30, ease: "linear" }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-4 w-1/3">
              <button 
                onClick={() => playTrack(currentTrack, true)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/10 text-orange-500 text-xs font-bold border border-orange-500/20 hover:bg-orange-500 hover:text-white transition-all"
              >
                <Youtube size={14} />
                Full Version
              </button>
              <Volume2 size={18} className="text-white/40 ml-4" />
              <div className="w-24 h-1 bg-white/10 rounded-full">
                <div className="w-2/3 h-full bg-white/40 rounded-full" />
              </div>
              <button 
                onClick={() => setCurrentTrack(null)}
                className="text-white/20 hover:text-white transition-colors ml-4"
              >
                <X size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <audio 
        ref={audioRef} 
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
        active 
          ? "bg-orange-500/10 text-orange-500 border border-orange-500/20" 
          : "text-white/50 hover:text-white hover:bg-white/5"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function TrackCard({ track, onPlay, onPlayFull, onToggleInterest, isInterested, isPlaying }: { 
  track: Track, 
  onPlay: () => void, 
  onPlayFull: () => void,
  onToggleInterest: () => void,
  isInterested: boolean,
  isPlaying: boolean
}) {
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="group relative glass rounded-2xl p-4 border border-white/5 hover:border-white/20 transition-all duration-300"
    >
      <div className="relative aspect-square mb-4 overflow-hidden rounded-xl">
        <img 
          src={track.artworkUrl} 
          alt={track.trackName} 
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
          <button 
            onClick={onPlay}
            title="Play Preview"
            className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 shadow-xl"
          >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
          </button>
          <button 
            onClick={onPlayFull}
            title="Play Full Version"
            className="w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 delay-75 shadow-xl"
          >
            <Youtube size={20} />
          </button>
        </div>
        {isPlaying && (
          <div className="absolute bottom-2 right-2 flex gap-0.5 items-end h-4">
            {[1, 2, 3, 4].map(i => (
              <motion.div 
                key={i}
                className="w-1 bg-orange-500 rounded-full"
                animate={{ height: ["20%", "100%", "40%", "80%", "20%"] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold truncate group-hover:text-orange-500 transition-colors">{track.trackName}</h3>
          <p className="text-xs text-white/50 truncate">{track.artistName}</p>
        </div>
        <button 
          onClick={onToggleInterest}
          className={cn(
            "p-2 rounded-full transition-all",
            isInterested ? "text-orange-500 bg-orange-500/10" : "text-white/20 hover:text-white hover:bg-white/5"
          )}
        >
          <Heart size={16} fill={isInterested ? "currentColor" : "none"} />
        </button>
      </div>
    </motion.div>
  );
}


