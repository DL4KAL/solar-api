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
    // 1. HamQSL für Solar Flux, Sunspots, X-Ray, K-Index
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

    // 2. NOAA Solar Wind (direkter JSON-Abruf für die Geschwindigkeit)
    const resWind = await fetch('https://services.swpc.noaa.gov/products/solar-wind/plasma-6-hour.json');
    if (resWind.ok) {
      const plasma = await resWind.json();
      if (Array.isArray(plasma) && plasma.length > 1) {
        // Wir suchen den letzten gültigen Geschwindigkeitswert (Spalte 2)
        for (let i = plasma.length - 1; i > 0; i--) {
          if (plasma[i][2] !== null && plasma[i][2] !== undefined) {
            cachedData.wind = Math.round(parseFloat(plasma[i][2])).toString();
            break;
          }
        }
      }
    }

    // 3. NOAA Protonenfluss (GOES Protonen 5-Minuten-Feed)
    const resProtons = await fetch('https://services.swpc.noaa.gov/json/goes/primary/integral-protons-6-hour.json');
    if (resProtons.ok) {
      const protons = await resProtons.json();
      if (Array.isArray(protons) && protons.length > 0) {
        // Den neuesten Eintrag mit einer gültigen Flux-Zahl finden
        const validProton = protons.reverse().find(p => p.flux !== null && p.flux !== undefined);
        if (validProton) {
          cachedData.protons = Number(validProton.flux).toFixed(2);
        }
      }
    }

    cachedData.updated = new Date().toISOString();
    console.log("Daten erfolgreich aktualisiert:", cachedData);
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
