import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("music.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS interests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trackId TEXT UNIQUE,
    trackName TEXT,
    artistName TEXT,
    artworkUrl TEXT,
    previewUrl TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/interests", (req, res) => {
    try {
      const interests = db.prepare("SELECT * FROM interests ORDER BY createdAt DESC").all();
      res.json(interests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch interests" });
    }
  });

  app.post("/api/interests", (req, res) => {
    const { trackId, trackName, artistName, artworkUrl, previewUrl } = req.body;
    try {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO interests (trackId, trackName, artistName, artworkUrl, previewUrl)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(trackId, trackName, artistName, artworkUrl, previewUrl);
      res.status(201).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to save interest" });
    }
  });

  app.delete("/api/interests/:trackId", (req, res) => {
    const { trackId } = req.params;
    try {
      db.prepare("DELETE FROM interests WHERE trackId = ?").run(trackId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete interest" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
