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
    // Wir nutzen den extrem stabilen HamQSL-XML-Feed für Node, 
    // der alle Werte gebündelt liefert und nie enttäuscht.
    const response = await fetch('https://www.hamqsl.com/solarxml.php');
    if (!response.ok) throw new Error('HamQSL nicht erreichbar');
    const xmlText = await response.text();

    // Einfaches Extrahieren der XML-Werte per RegEx (ganz ohne schwere Parser)
    const getTag = (tag) => {
      const match = xmlText.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`));
      return match ? match[1] : "--";
    };

    cachedData.sfi = getTag('solarflux');
    cachedData.spots = getTag('sunspots');
    cachedData.xray = getTag('xray');
    cachedData.kindex = getTag('kindex');
    cachedData.updated = new Date().toISOString();

    console.log("Solardaten erfolgreich aktualisiert:", cachedData);
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
