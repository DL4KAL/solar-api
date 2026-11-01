const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());

let cachedData = {
  sfi: "92",
  spots: "31",
  xray: "B2.5",
  aindex: "4",
  kindex: "0.33",
  wind: "393",
  protons: "0.18",
  noise: "0.5",
  bz: "0.0", // Neuer Wert für das interplanetare Magnetfeld (Bz)
  updated: null
};

let lastFetchTime = 0;
const CACHE_DURATION = 2 * 60 * 1000; // 2 Minuten Cache

async function updateData() {
  console.log("Hole minütliche Echtzeit-Rohdaten von HamQSL und NOAA...");
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

  // 2. NOAA Boulder 1-Minuten K-Index (Reagiert deutlich schneller als der 3-Stunden-Kp)
  try {
    const resKp = await fetch(`https://services.swpc.noaa.gov/json/boulder_k_index_1m.json${cacheBuster}`);
    if (resKp.ok) {
      const kpData = await resKp.json();
      if (Array.isArray(kpData) && kpData.length > 0) {
        const validKp = [...kpData].reverse().find(k => k.k_index !== null && k.k_index !== undefined);
        if (validKp) {
          cachedData.kindex = parseFloat(validKp.k_index).toFixed(2);
        }
      }
    }
  } catch (err) {
    console.error("Fehler bei NOAA Boulder K-Index:", err.message);
  }

  // 3. NOAA Real-Time Solar Wind (Minutengenaue RTSW-Rohdaten für Live-Windgeschwindigkeit)
  try {
    const resWind = await fetch(`https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json${cacheBuster}`);
    if (resWind.ok) {
      const plasma = await resWind.json();
      if (Array.isArray(plasma) && plasma.length > 0) {
        const currentWind = [...plasma].reverse().find(p => p.speed !== null && p.speed !== undefined);
        if (currentWind) {
          const speed = parseFloat(currentWind.speed);
          if (!isNaN(speed) && speed > 0) {
            cachedData.wind = Math.round(speed).toString();
          }
        }
      }
    }
  } catch (err) {
    console.error("Fehler bei NOAA RTSW Wind:", err.message);
  }

  // 4. NOAA Real-Time Interplanetary Magnetic Field (IMF - Bz Komponente)
  try {
    const resMag = await fetch(`https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json${cacheBuster}`);
    if (resMag.ok) {
      const magData = await resMag.json();
      if (Array.isArray(magData) && magData.length > 0) {
        const currentMag = [...magData].reverse().find(m => m.bz_gsm !== null && m.bz_gsm !== undefined);
        if (currentMag) {
          const bzVal = parseFloat(currentMag.bz_gsm);
          if (!isNaN(bzVal)) {
            cachedData.bz = bzVal.toFixed(1);
          }
        }
      }
    }
  } catch (err) {
    console.error("Fehler bei NOAA RTSW Mag (Bz):", err.message);
  }

  // 5. NOAA Protonenfluss
  try {
    const resProtons = await fetch(`https://services.swpc.noaa.gov/json/goes/primary/integral-protons-6-hour.json${cacheBuster}`);
    if (resProtons.ok) {
      const protons = await resProtons.json();
      if (Array.isArray(protons) && protons.length > 0) {
        const validProton = [...protons].reverse().find(p => p.flux !== null && p.flux !== undefined);
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
  console.log("Rohdaten erfolgreich optimiert und aktualisiert:", cachedData);
}

app.get('/solar-data', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';

  if (forceRefresh || Date.now() - lastFetchTime > CACHE_DURATION || !cachedData.updated) {
    await updateData();
  }
  res.json(cachedData);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Optimierter Server läuft auf Port ${PORT}`));
