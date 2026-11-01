import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());

// Hilfsfunktion: Abruf der Ionosonden-Daten aus Juliusruh (JR055) via GIRO / UML API
async function fetchIonosondeData() {
  const url = 'https://lgdc.uml.edu/api/getData?charName=foF2,M3000F2&stationName=JR055&from=latest-1h';
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const text = await response.text();
    
    // Parsen der SAO/GIRO-Textantwort
    const lines = text.split('\n').filter(l => !l.startsWith('#') && l.trim().length > 0);
    if (lines.length === 0) return null;

    // Neuesten Tabelleneintrag auslesen
    const lastLine = lines[lines.length - 1].trim().split(/\s+/);
    
    // SAO Format Spalten: [0] UT-Date, [1] UT-Time, ..., [foF2], [M3000F2]
    const foF2 = parseFloat(lastLine[lastLine.length - 2]);
    const m3000 = parseFloat(lastLine[lastLine.length - 1]);

    if (isNaN(foF2) || isNaN(m3000)) return null;

    const muf3000 = parseFloat((foF2 * m3000).toFixed(1));

    // Bestes NVIS-Band ableiten
    let nvisBand = "80m / 60m";
    if (foF2 > 7.0) nvisBand = "40m";
    else if (foF2 < 3.5) nvisBand = "160m / 80m";

    return {
      station: "Juliusruh (JR055)",
      foF2: foF2.toFixed(1),
      muf3000: muf3000.toFixed(1),
      nvisBand: nvisBand,
      updated: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
    };
  } catch (err) {
    console.error('Fehler beim Abruf der Ionosonden-Daten:', err.message);
    return { station: "Juliusruh (JR055)", foF2: "--", muf3000: "--", nvisBand: "--", updated: "--" };
  }
}

// Haupt-Endpoint für das Blog-Dashboard
app.get('/api/space-weather', async (req, res) => {
  try {
    // 1. Solardaten & Geomagnetik (bestehende NOAA/HamQSL Quellen)
    // Parallelisierung des Ionosonden-Fetches für optimale Latenz
    const ionoPromise = fetchIonosondeData();

    // Beispielhafter Abruf der weiteren Quellen (an deine bestehende Struktur anpassbar)
    const [ionoData] = await Promise.all([
      ionoPromise
    ]);

    // Antworthash für den Client
    res.json({
      timestamp: new Date().toISOString(),
      // Bestehende Solardaten hier einfügen...
      iono: ionoData
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Weltraumwetter-Daten' });
  }
});

app.listen(PORT, () => {
  console.log(`Solar-API läuft auf Port ${PORT}`);
});
