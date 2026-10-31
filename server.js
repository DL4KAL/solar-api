const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());

let cachedData = {
  sfi: "89",
  spots: "11",
  xray: "B3.8",
  aindex: "4",
  kindex: "0.33",
  wind: "393",
  protons: "0.21",
  noise: "0.5",
  updated: null
};

let lastFetchTime = 0;
const CACHE_DURATION = 2 * 60 * 1000; // Auf 2 Minuten verkürzt für schnellere Aktualisierung

async function updateData() {
  console.log("Hole exakte Rohdaten von HamQSL und NOAA...");
  const cacheBuster = `?_t=${Date.now()}`;

  // 1. HamQSL für Basiswerte (SFI, Sunspots, X-Ray)
  try {
    const resHam = await fetch(`https://www.hamqsl.com/solarxml.php${cacheBuster}`);
    if (resHam.ok) {
      const xml = await resHam.text();
      const getTag = (tag) => {
        const m = xml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`));
        return m ? m[1] : null;
      };
      if (getTag('solarflux')) cachedData.sfi = getTag('solarflux');
      if (getTag('sunspots')) cachedData.spots = getTag('sunspots');
      if (getTag('xray')) cachedData.xray = getTag('xray');
    }
  } catch (err) {
    console.error("Fehler bei HamQSL:", err.message);
  }

  // 2. NOAA Planetary K-Index & A-Index
  try {
    const resKp = await fetch(`https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json${cacheBuster}`);
    if (resKp.ok) {
      const kpData = await resKp.json();
      if (Array.isArray(kpData) && kpData.length > 1) {
        for (let i = kpData.length - 1; i > 0; i--) {
          if (kpData[i][1] !== null && kpData[i][1] !== undefined) {
            cachedData.kindex = parseFloat(kpData[i][1]).toFixed(2);
            if (kpData[i][2] !== null && kpData[i][2] !== undefined) {
              cachedData.aindex = Math.round(parseFloat(kpData[i][2])).toString();
            }
            break;
          }
        }
      }
    }
  } catch (err) {
    console.error("Fehler bei NOAA K-Index:", err.message);
  }

  // 3. NOAA Solar Wind
  try {
    const resWind = await fetch(`https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json${cacheBuster}`);
    if (resWind.ok) {
      const plasma = await resWind.json();
      if (Array.isArray(plasma) && plasma.length > 1) {
        for (let i = plasma.length - 1; i > 0; i--) {
          if (plasma[i][2] !== null && plasma[i][2] !== undefined) {
            const speed = parseFloat(plasma[i][2]);
            if (!isNaN(speed) && speed > 0) {
              cachedData.wind = Math.round(speed).toString();
              break;
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Fehler bei NOAA Wind:", err.message);
  }

  // 4. NOAA Protonenfluss
  try {
    const resProtons = await fetch(`https://services.swpc.noaa.gov/json/goes/primary/integral-protons-6-hour.json${cacheBuster}`);
    if (resProtons.ok) {
      const protons = await resProtons.json();
      if (Array.isArray(protons) && protons.length > 0) {
        const validProtons = [...protons].reverse();
        const validProton = validProtons.find(p => p.flux !== null && p.flux !== undefined);
        if (validProton) {
          cachedData.protons = Number(validProton.flux).toFixed(2);
        }
      }
    }
  } catch (err) {
    console.error("Fehler bei NOAA Protonen:", err.message);
  }

  cachedData.updated = new Date().toISOString();
  lastFetchTime = Date.now();
  console.log("Rohdaten erfolgreich aktualisiert:", cachedData);
}

app.get('/solar-data', async (req, res) => {
  // Wenn ?refresh=true in der URL steht, wird ein Update erzwungen
  const forceRefresh = req.query.refresh === 'true';

  if (forceRefresh || Date.now() - lastFetchTime > CACHE_DURATION || !cachedData.updated) {
    await updateData();
  }
  res.json(cachedData);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Läuft auf Port ${PORT}`));
