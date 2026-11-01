import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());

// Hilfsfunktion: Einzelne Ionosonde mit striktem Timeout & User-Agent abfragen
async function fetchSingleIonosonde(stationCode, stationName) {
  const url = `https://lgdc.uml.edu/api/getData?charName=foF2,M3000F2&stationName=${stationCode}&from=latest-2h`;
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // Max 3s Warten

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DL4KAL-SpaceWeather/1.0',
        'Accept': 'text/plain, */*'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const text = await response.text();
    
    // Textzeilen filtern
    const lines = text.split('\n').filter(l => !l.startsWith('#') && l.trim().length > 0);
    if (lines.length === 0) return null;

    // Neuesten Tabelleneintrag extrahieren
    const lastLine = lines[lines.length - 1].trim().split(/\s+/);
    if (lastLine.length < 4) return null;

    const foF2 = parseFloat(lastLine[lastLine.length - 2]);
    const m3000 = parseFloat(lastLine[lastLine.length - 1]);

    if (isNaN(foF2) || isNaN(m3000) || foF2 <= 0) return null;

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
    console.error(`Ionosonde ${stationCode} nicht erreichbar:`, err.message);
    return null;
  }
}

// Haupt-Abruf mit Kaskade: JR055 ➔ PQ052 ➔ Tageszeit-Modell als Schutz
async function fetchIonosondeData() {
  // 1. Versuch: Juliusruh
  let ionoData = await fetchSingleIonosonde('JR055', 'Juliusruh (JR055)');
  if (ionoData) return ionoData;

  // 2. Versuch: Prag / Průhonice
  ionoData = await fetchSingleIonosonde('PQ052', 'Průhonice (PQ052)');
  if (ionoData) return ionoData;

  // 3. Fallback: Bei Blockade der GIRO-API ein Tageszeitmodell für Mitteleuropa
  const nowUtcHour = new Date().getUTCHours();
  const isDay = nowUtcHour >= 6 && nowUtcHour <= 17;
  
  return { 
    station: "Mitteleuropa (Modell/Estimate)", 
    foF2: isDay ? "6.4" : "3.6", 
    muf3000: isDay ? "19.8" : "11.1", 
    nvisBand: isDay ? "40m / 60m" : "80m / 160m", 
    updated: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
  };
}

// Solardaten (HamQSL XML)
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

// Endpoint für das Blog-Frontend
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
    res.status(500).json({ error: 'Fehler beim Verarbeiten der Daten' });
  }
});

app.listen(PORT, () => {
  console.log(`Solar-API läuft auf Port ${PORT}`);
});
