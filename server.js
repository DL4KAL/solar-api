import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());

// Hilfsfunktion: Ionosonde abfragen mit direkter Fallback-Garantie
async function fetchIonosondeData() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch('https://prop.kc2g.com/api/muf.json', {
      signal: controller.signal,
      headers: { 'User-Agent': 'DL4KAL-SpaceWeather/1.0' }
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      if (data && data.stations) {
        const jr = data.stations['JR055'] || data.stations['PQ052'];
        if (jr && jr.fof2 && jr.mufd) {
          const foF2 = parseFloat(jr.fof2).toFixed(1);
          const muf3000 = parseFloat(jr.mufd).toFixed(1);

          let nvisBand = "80m / 60m";
          if (parseFloat(foF2) > 7.0) nvisBand = "40m";
          else if (parseFloat(foF2) < 3.5) nvisBand = "160m / 80m";

          return {
            station: jr.name || "Juliusruh (JR055)",
            foF2: foF2,
            muf3000: muf3000,
            nvisBand: nvisBand,
            updated: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
          };
        }
      }
    }
  } catch (err) {
    console.error("Ionosonden-API Ausfall:", err.message);
  }

  // Modellierter Fallback für Mitteleuropa
  const nowUtcHour = new Date().getUTCHours();
  const isDay = nowUtcHour >= 6 && nowUtcHour <= 17;

  return {
    station: "Mitteleuropa (Modell)",
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
