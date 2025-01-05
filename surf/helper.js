import * as ics from 'ics';

export const surfable = (windSpeed, windDirection, spot) => {
    if (windSpeed < 5 || windSpeed > 9) {
        return false;
    }
    // speed is ok

    if(!spot.windDirection) {
        return true;
    }
    
    if (windDirection < spot.windDirection[0] || windDirection > spot.windDirection[1]) {
        return false;
    }
    // direction is ok

    
    return true
}

const spotToLonLat = (spot) => {
    return [spot.lon, spot.lat];
}

const getSunData = async (lon, lat) => {
    const url = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0`

    const response = await fetch(url);
    const data = await response.json();
    return data;
}

const getWindData = async (lon, lat) => {
    const url = `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${lon}/lat/${lat}/data.json`

    const response = await fetch(url);
    const data = await response.json();
    return data;
}

const spots = [
    {
        name: "Rågelund",
        lat: 57.329542,
        lon: 12.155943,
        windDirection: [180, 320],
    },
    {
        name: "Läjet",
        lat: 57.116667,
        lon: 12.25,
    }
]

const parsedWindData = function(windData, spot, sunrise, sunset) {
    const timeSeries = windData.timeSeries;
    const parsedData = [];

    timeSeries.forEach((time) => {
        const windSpeed = time.parameters.find(param => param.name === "ws").values[0];
        const windDirection = time.parameters.find(param => param.name === "wd").values[0];

        if (!surfable(windSpeed, windDirection, spot)) {
            return;
        }

        const minuteOfDay = (new Date(time.validTime)).getHours() * 60 + (new Date(time.validTime)).getMinutes();

        const sunriseAsMinuteOfDay = (new Date(sunrise)).getHours() * 60 + (new Date(sunrise)).getMinutes() - 60;
        const sunsetAsMinuteOfDay = (new Date(sunset)).getHours() * 60 + (new Date(sunset)).getMinutes() + 60;
        
        const beforeSunrise = minuteOfDay < sunriseAsMinuteOfDay;
        const afterSunset = minuteOfDay > sunsetAsMinuteOfDay;
        const itsTooDark = beforeSunrise || afterSunset;

        if (itsTooDark) {
            return;
        }

        const validTime = time.validTime;
        const year = parseInt(validTime.slice(0, 4));
        const month = parseInt(validTime.slice(5, 7));
        const day = parseInt(validTime.slice(8, 10));
        const hour = parseInt(validTime.slice(11, 13));
        const minute = parseInt(validTime.slice(14, 16));

        const duration = 1;

        parsedData.push({ 
            title: `${windSpeed} m/s, ${windDirection}°`,
            start: [year, month, day, hour, minute],
            duration: { hours: duration },
            location: spot.name,
            geo: {
                lat: spot.lat,
                lon: spot.lon,
            },
            productId: "Davids surfkalender"
         });

    });

    return parsedData;
}

export const run = async function() {
    const spot = spots[0];
    const lonLat = spotToLonLat(spot);
    const wind = await getWindData(lonLat[0], lonLat[1]);
    const sun = await getSunData(lonLat[0], lonLat[1]);
    const sunrise = sun.results.sunrise;
    const sunset = sun.results.sunset;
    const parsed = parsedWindData(wind, spot, sunrise, sunset);

    const icsFile = icsFromArray(parsed);

    return icsFile
}


const icsFromArray = (dataArray) => {
    const {error, value} = ics.createEvents(dataArray);

    return value;
}