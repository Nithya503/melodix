export interface Track {
  trackId: string;
  trackName: string;
  artistName: string;
  artworkUrl: string;
  previewUrl: string;
  collectionName?: string;
  primaryGenreName?: string;
}

export interface Interest extends Track {
  id: number;
  createdAt: string;
}
