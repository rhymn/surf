import * as ics from 'ics';


const isWithinWindSpeedRange = (windSpeed, spot) => {
    const WIND_SPEED_MIN = 5;
    const WIND_SPEED_MAX = 9;

    const minWindSpeed = spot.minWindSpeed || WIND_SPEED_MIN;
    const maxWindSpeed = spot.maxWindSpeed || WIND_SPEED_MAX;

    return windSpeed >= minWindSpeed && windSpeed <= maxWindSpeed;
}

export const surfable = (windSpeed, windDirection, spot) => {
    if (spot.windDirection && (windDirection < spot.windDirection[0] || windDirection > spot.windDirection[1])) {
        return false;
    }
    
    return isWithinWindSpeedRange(windSpeed, spot)
}

const getSunData = async (lon, lat) => {
    const url = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0`

    const response = await fetch(url);
    const data = await response.json();

    return {
        sunrise: data.results.sunrise,
        sunset: data.results.sunset
    };
}

const getWindData = async (lon, lat) => {
    const url = `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${lon}/lat/${lat}/data.json`
    // console.log(url)

    const response = await fetch(url);
    const data = await response.json();
    // console.log(data)
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

const itsTooDark = (time, sunrise, sunset) => {
    const minuteOfDay = (new Date(time)).getHours() * 60 + (new Date(time)).getMinutes();

    const timeOfSunriseAsMinuteOfDay = (new Date(sunrise)).getHours() * 60 + (new Date(sunrise)).getMinutes() - 60;
    const timeOfSunsetAsMinuteOfDay = (new Date(sunset)).getHours() * 60 + (new Date(sunset)).getMinutes() + 60;

    
    const isBeforeSunrise = minuteOfDay < timeOfSunriseAsMinuteOfDay;
    const isAfterSunset = minuteOfDay > timeOfSunsetAsMinuteOfDay;
    // console.log(minuteOfDay, timeOfSunriseAsMinuteOfDay, timeOfSunsetAsMinuteOfDay, isBeforeSunrise, isAfterSunset);

    return isBeforeSunrise || isAfterSunset;
}

const parsedWindData = function(windData, spot, sunrise, sunset) {
    const timeSeries = windData.timeSeries;
    const parsedData = [];

    timeSeries.forEach((time) => {
        const windSpeed = time.parameters.find(param => param.name === "ws").values[0];
        const windDirection = time.parameters.find(param => param.name === "wd").values[0];

        if (!surfable(windSpeed, windDirection, spot)) {
            return;
        }

        if(itsTooDark(time.validTime, sunrise, sunset)) {
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
            startInputType: 'utc',
            duration: { hours: duration },
            location: spot.name,
            description: 'Based in Sweden. Future metric: Kilos of plastic recovered.',
            geo: {
                lat: spot.lat,
                lon: spot.lon,
            },
            productId: `Surfkalender för ${spot.name} - Based in Sweden`
         });
    });

    return parsedData;
}

const wantedSpot = 0;

export const run = async function() {
    const spot = spots[wantedSpot];

    const wind = await getWindData(spot.lon, spot.lat);
    const {sunrise, sunset} = await getSunData(spot.lon, spot.lat);
    
    const parsed = parsedWindData(wind, spot, sunrise, sunset);

    console.log(parsed);
    const icsFile = icsFromArray(parsed);

    return icsFile
}

const icsFromArray = (dataArray) => {
    const {error, value} = ics.createEvents(dataArray);

    return value;
}
