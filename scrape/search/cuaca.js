import axios from 'axios';
import * as cheerio from 'cheerio';

const URL = 'https://www.bmkg.go.id/cuaca/prakiraan-cuaca/35.10';

async function scrapeWeather() {
  try {
    const { data } = await axios.get(URL);
    const $ = cheerio.load(data);
    const results = [];

    $('table tr').each((index, element) => {
      const row = $(element);
      const kecamatan = row.find('td').eq(0).text().trim();
      
      if (!kecamatan || kecamatan.includes('Kecamatan')) return;

      const weatherData = [];
      
      row.find('td').slice(1).each((i, cell) => {
        const cellText = $(cell).text().trim();
        const match = cellText.match(/([A-Za-z\/\s]+)\s+(\d+[–-]\d+)\s*°C\s+(\d+[–-]\d+)%/);
        
        if (match) {
          weatherData.push({
            condition: match[1].trim(),
            temperature: match[2].replace('–', '-'),
            humidity: match[3].replace('–', '-')
          });
        }
      });

      if (weatherData.length > 0) {
        results.push({
          kecamatan: kecamatan,
          forecasts: weatherData
        });
      }
    });

    console.log(JSON.stringify(results, null, 2));
    
    return results;

  } catch (error) {
    console.error('Error scraping:', error.message);
  }
}

scrapeWeather();
