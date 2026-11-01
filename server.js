// 3. NOAA Real-Time Solar Wind (Minutengenaue DSCOVR/ACE Rohdaten)
  try {
    const resWind = await fetch(`https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json${cacheBuster}`);
    if (resWind.ok) {
      const plasma = await resWind.json();
      if (Array.isArray(plasma) && plasma.length > 0) {
        // Wir suchen den letzten gültigen Eintrag mit einer echten Windgeschwindigkeit (speed)
        const validPlasma = [...plasma].reverse();
        const currentWind = validPlasma.find(p => p.speed !== null && p.speed !== undefined);
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
