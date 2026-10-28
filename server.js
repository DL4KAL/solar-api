const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();

app.use(cors());

let cachedData = {
  sfi: "89",
  spots: "11",
  xray: "B3.8",
  kindex: "1",
  wind: "393",
  protons: "0.22",
  noise: "0.5",
  updated: null
};

async function updateData() {
  try {
    // 1. HamQSL für Basiswerte (Solar Flux, Sunspots, X-Ray, K-Index)
    const resHam = await fetch('https://www.hamqsl.com/solarxml.php');
    if (resHam.ok) {
      const xml = await resHam.text();
      const getTag = (tag) => {
        const m = xml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`));
        return m ? m[1] : null;
      };
      if (getTag('solarflux')) cachedData.sfi = getTag('solarflux');
      if (getTag('sunspots')) cachedData.spots = getTag('sunspots');
      if (getTag('xray')) cachedData.xray = getTag('xray');
      if (getTag('kindex')) cachedData.kindex = getTag('kindex');
    }

    // 2. NOAA Solar Wind (Geschwindigkeit in km/s)
    const resWind = await fetch('https://services.swpc.noaa.gov/products/solar-wind/plasma-6-hour.json');
    if (resWind.ok) {
      const plasma = await resWind.json();
      // Der letzte Eintrag enthält die aktuellsten Plasma-Daten [Zeit, Dichte, Geschwindigkeit, Temperatur]
      if (plasma && plasma.length > 1) {
        const latest = plasma[plasma.length - 1];
        if (latest && latest[2]) {
          cachedData.wind = Math.round(parseFloat(latest[2])).toString();
        }
      }
    }

    // 3. NOAA Protonenfluss (GOES Protonen)
    const resProtons = await fetch('https://services.swpc.noaa.gov/json/goes/primary/integral-protons-6-hour.json');
    if (resProtons.ok) {
      const protons = await resProtons.json();
      if (protons && protons.length > 0) {
        const latestP = protons[protons.length - 1];
        if (latestP && latestP.flux) {
          cachedData.protons = Number(latestP.flux).toFixed(2);
        }
      }
    }

    cachedData.updated = new Date().toISOString();
    console.log("Alle Solardaten inkl. Geomag & Particles aktualisiert:", cachedData);
  } catch (err) {
    console.error("Fehler beim Aktualisieren:", err.message);
  }
}

// Beim Start und alle 10 Minuten aktualisieren
updateData();
setInterval(updateData, 10 * 60 * 1000);

app.get('/solar-data', (req, res) => {
  res.json(cachedData);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Läuft auf Port ${PORT}`));
