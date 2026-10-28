const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();

app.use(cors());

let cachedData = {
  sfi: "--",
  spots: "--",
  xray: "--",
  kindex: "--",
  updated: null
};

async function updateData() {
  try {
    const resSummary = await fetch('https://services.swpc.noaa.gov/products/summary/solar-flux.json').then(r => r.json());
    const resKp = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json').then(r => r.json());
    const resXray = await fetch('https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json').then(r => r.json());

    cachedData.sfi = resSummary.flux || "--";
    
    if (resKp && resKp.length > 1) {
      cachedData.kindex = resKp[resKp.length - 1][1] || "--";
    }

    const latestX = resXray.filter(item => item.energy === '0.1-0.8nm').pop();
    if (latestX && latestX.flux) {
      let f = latestX.flux;
      let c = "A", v = f;
      if (f >= 1e-4) { c = "X"; v = (f / 1e-4).toFixed(1); }
      else if (f >= 1e-5) { c = "M"; v = (f / 1e-5).toFixed(1); }
      else if (f >= 1e-6) { c = "C"; v = (f / 1e-6).toFixed(1); }
      else if (f >= 1e-7) { c = "B"; v = (f / 1e-7).toFixed(1); }
      else { v = (f / 1e-8).toFixed(1); }
      cachedData.xray = c + v;
    }

    cachedData.updated = new Date().toISOString();
    console.log("Solardaten aktualisiert.");
  } catch (err) {
    console.error("Fehler beim Aktualisieren:", err);
  }
}

updateData();
setInterval(updateData, 15 * 60 * 1000);

app.get('/solar-data', (req, res) => {
  res.json(cachedData);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Läuft auf Port ${PORT}`));
