/* global
functions, makeRequest, getUnix,
objects, LightweightCharts
*/

/* Constants */

const URL_GET_FILE = '/api/files/by-name';

/* Variables */

const fileExtension = 'csv';
const fileName = 'aggTrades/daily/ADAUSDTPERP/ADAUSDT-aggTrades-2021-12-21';

/* JQuery */
const $container = $('.container');

$(document).ready(async () => {
  const resultGetFile = await makeRequest({
    method: 'GET',
    url: URL_GET_FILE,

    query: {
      fileName,
      fileExtension,
    },
  });

  if (!resultGetFile || !resultGetFile.status) {
    alert(resultGetFile.message || 'Cant makeRequest URL_GET_CONSTANTS');
    return true;
  }

  const drawData = drawChart();
  const fileData = resultGetFile.result.result;

  const splitByMinutes = [];
  let newSplit = [fileData[0]];

  let minute = new Date(parseInt(fileData[0][5], 10)).getUTCMinutes();

  for (let i = 1; i < fileData.length; i += 1) {
    const minuteOfTrade = new Date(parseInt(fileData[i][5], 10)).getUTCMinutes();

    if (minuteOfTrade !== minute) {
      minute = minuteOfTrade;

      splitByMinutes.push(newSplit);

      newSplit = [fileData[i]];
      continue;
    }

    newSplit.push(fileData[i]);
  }

  const candles = [];

  splitByMinutes.forEach(split => {
    let open = 0;
    let close = 0;
    let minLow = 999;
    let maxHigh = 0;
    let time;

    const lSplit = split.length;

    split.forEach((tradeData, index) => {
      const [
        tradeId,
        price,
        quantity,
        firstTradeId,
        lastTradeId,
        timestamp,
        direction,
      ] = tradeData;

      const validPrice = parseFloat(price);

      if (index === 0) {
        open = validPrice;
        time = parseInt(parseInt(timestamp, 10) / 1000, 10);
      }

      if (index === lSplit - 1) {
        close = validPrice;
      }

      if (validPrice < minLow) {
        minLow = validPrice;
      }

      if (validPrice > maxHigh) {
        maxHigh = validPrice;
      }
    });

    candles.push({
      close,
      open,
      time,
      low: minLow,
      high: maxHigh,
    });
  });

  console.log(candles[0].time);

  drawData(candles);
});

/* Functions */

const drawChart = function () {
  const chartCandles = LightweightCharts.createChart(document.getElementById('chart'), {
    width: window.innerWidth - 15,
    height: window.innerHeight - 100,
  });

  chartCandles.applyOptions({
    layout: {
      backgroundColor: 'white',
    },

    crosshair: {
      mode: 0,
    },

    timeScale: {
      rightOffset: 12,
      timeVisible: true,
      secondsVisible: false,
    },
  });

  const mainSeries = chartCandles.addCandlestickSeries({
    upColor: '#000FFF',
    downColor: 'rgba(0, 0, 0, 0)',
    borderDownColor: '#000FFF',
    wickColor: '#000000',
  });

  return function drawData(data) {
    mainSeries.setData(data);
  };
};
