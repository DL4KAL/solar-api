import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());

// Hilfsfunktion: Einzelne Ionosonde abfragen und parsen
async function fetchSingleIonosonde(stationCode, stationName) {
  const url = `https://lgdc.uml.edu/api/getData?charName=foF2,M3000F2&stationName=${stationCode}&from=latest-1h`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const text = await response.text();
    
    // Ausfiltern von Kommentaren und leeren Zeilen
    const lines = text.split('\n').filter(l => !l.startsWith('#') && l.trim().length > 0);
    if (lines.length === 0) return null;

    // Neuesten Eintrag auslesen
    const lastLine = lines[lines.length - 1].trim().split(/\s+/);
    const foF2 = parseFloat(lastLine[lastLine.length - 2]);
    const m3000 = parseFloat(lastLine[lastLine.length - 1]);

    if (isNaN(foF2) || isNaN(m3000)) return null;

    const muf3000 = parseFloat((foF2 * m3000).toFixed(1));

    let nvisBand = "80m / 60m";
    if (foF2 > 7.0) nvisBand = "40m";
    else if (foF2 < 3.5) nvisBand = "160m / 80m";

    return {
      station: stationName,
      foF2: foF2.toFixed(1),
      muf3000: muf3000.toFixed(1),
      nvisBand: nvisBand,
      updated: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
    };
  } catch (err) {
    console.error(`Fehler bei Ionosonde ${stationCode}:`, err.message);
    return null;
  }
}

// 1. Hilfsfunktion mit Fallback: Juliusruh (JR055) ➔ Průhonice/Prag (PQ052)
async function fetchIonosondeData() {
  // Versuch 1: Juliusruh
  let ionoData = await fetchSingleIonosonde('JR055', 'Juliusruh (JR055)');
  if (ionoData) return ionoData;

  // Versuch 2: Průhonice / Prag (Tschechien) als Fallback
  console.log('Juliusruh offline/ohne Daten. Wechsele auf Průhonice (PQ052)...');
  ionoData = await fetchSingleIonosonde('PQ052', 'Průhonice (PQ052)');
  if (ionoData) return ionoData;

  // Beide offline
  return { station: "Ionosonden Offline", foF2: "--", muf3000: "--", nvisBand: "--", updated: "--" };
}

// 2. Hilfsfunktion: Solardaten & Geomagnetik (HamQSL XML)
async function fetchSolarData() {
  try {
    const response = await fetch('https://www.hamqsl.com/solarxml.php');
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const xmlText = await response.text();

    const getTagValue = (tag) => {
      const match = xmlText.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 'i'));
      return match ? match[1].trim() : '--';
    };

    return {
      sfi: getTagValue('solarflux'),
      spots: getTagValue('sunspots'),
      xray: getTagValue('xray'),
      aindex: getTagValue('aindex'),
      kindex: getTagValue('kindex'),
      bz: getTagValue('geomagfield').includes('NO') ? '+0.0' : getTagValue('kindexnt'),
      wind: getTagValue('solarwind'),
      noise: getTagValue('signalnoise'),
      protons: getTagValue('protonflux')
    };
  } catch (err) {
    console.error('Fehler beim Abruf der Solardaten:', err.message);
    return {};
  }
}

// Haupt-Endpoint /solar-data (passend zur URL im Blogger-Frontend)
app.get('/solar-data', async (req, res) => {
  try {
    const [solar, iono] = await Promise.all([
      fetchSolarData(),
      fetchIonosondeData()
    ]);

    res.json({
      sfi: solar.sfi || "--",
      spots: solar.spots || "--",
      xray: solar.xray || "--",
      aindex: solar.aindex || "--",
      kindex: solar.kindex || "--",
      bz: solar.bz || "--",
      wind: solar.wind || "--",
      noise: solar.noise || "--",
      protons: solar.protons || "--",
      updated: new Date().toISOString(),
      iono: iono
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Fehler beim Verarbeiten der Weltraumwetter-Daten' });
  }
});

app.listen(PORT, () => {
  console.log(`Solar-API läuft erfolgreich auf Port ${PORT}`);
});
