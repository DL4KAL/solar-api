const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());

// Rollender Speicher für die Historie (letzte 12 Messpunkte / ca. 1 Stunde)
let dataHistory = [];
const MAX_HISTORY = 12;

// Hilfsfunktion zum Abrufen und Speichern der Live-Daten
async function updateSolarData() {
  try {
    // [Hier laufen Ihre bestehenden Abrufe von HamQSL und NOAA SWPC zusammen]
    // Beispielhaft dargestellt als Objekt mit den aktuellen Werten:
    const currentData = {
      timestamp: new Date().toISOString(),
      sfi: "150",       // Beispiel-Wert aus HamQSL
      spots: "45",
      xray: "C1.2",
      aindex: "12",
      kindex: "2.3",
      bz: "-2.1",
      wind: "410",
      protons: "2.1",
      noise: "S2"
    };

    // Zur Historie hinzufügen, falls sich der Zeitstempel oder Wert geändert hat
    if (dataHistory.length === 0 || dataHistory[dataHistory.length - 1].timestamp !== currentData.timestamp) {
      dataHistory.push({
        timestamp: currentData.timestamp,
        kindex: parseFloat(currentData.kindex),
        bz: parseFloat(currentData.bz),
        wind: parseFloat(currentData.wind)
      });

      if (dataHistory.length > MAX_HISTORY) {
        dataHistory.shift(); // Ältesten Wert entfernen
      }
    }
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Solardaten:", error.message);
  }
}

// Regelmäßiger Abruf alle 5 Minuten im Hintergrund
setInterval(updateSolarData, 5 * 60 * 1000);
updateSolarData(); // Initialer Abruf beim Start

// API-Endpunkt
app.get('/solar-data', (req, res) => {
  // Letzten Datensatz als Hauptwerte nehmen + die komplette Historie mitschicken
  const latest = dataHistory.length > 0 ? dataHistory[dataHistory.length - 1] : {};
  
  res.json({
    sfi: "150",
    spots: "45",
    xray: "C1.2",
    aindex: "12",
    kindex: latest.kindex || 2.0,
    bz: latest.bz || 0.0,
    wind: latest.wind || 400,
    protons: "2.1",
    noise: "S2",
    updated: latest.timestamp || new Date().toISOString(),
    history: dataHistory // <-- Das Array wird an jeden Besucher übergeben!
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Solar-API läuft auf Port ${PORT}`);
});
