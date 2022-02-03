/* global
functions, makeRequest,
objects, moment, constants, ChartCandles, IndicatorVolume, IndicatorMovingAverage, Statistics
*/

/* Constants */

const URL_GET_INSTRUMENTS_BY_ID = '/api/instruments/by-id';
const URL_GET_INSTRUMENTS_BY_NAME = '/api/instruments/by-name';

const AVAILABLE_PERIODS = new Map([
  ['1m', '1m'],
  ['5m', '5m'],
]);

/* Variables */

let btcDoc;
let instrumentDoc;

const triggerQuantity = 10;
const candlesForCalculateAverageValue = 4;

let choosenPeriod = AVAILABLE_PERIODS.get('1m');

const windowHeight = window.innerHeight;

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

if (params.interval && AVAILABLE_PERIODS.get(params.interval)) {
  choosenPeriod = params.interval;
}

/* JQuery */
const $chartsContainer = $('.charts-container');

$(document).ready(async () => {
  if (!params.instrumentName) {
    alert('No instrumentName');
    return true;
  }

  // loading data

  const resultGetInstrumentsByName = await makeRequest({
    method: 'POST',
    url: URL_GET_INSTRUMENTS_BY_NAME,
    body: { arrOfNames: [params.instrumentName, 'BTCUSDTPERP'] },
  });

  if (!resultGetInstrumentsByName || !resultGetInstrumentsByName.status) {
    alert(resultGetInstrumentsByName.message || 'Cant makeRequest URL_GET_INSTRUMENTS_BY_NAME');
    return true;
  }

  if (!resultGetInstrumentsByName.result || !resultGetInstrumentsByName.result.length) {
    alert('No instrument with this name');
    return true;
  }

  const resultGetInstrumentsById = await makeRequest({
    method: 'POST',
    url: URL_GET_INSTRUMENTS_BY_ID,
    body: { instrumentsIds: resultGetInstrumentsByName.result.map(r => r._id) },
  });

  if (!resultGetInstrumentsById || !resultGetInstrumentsById.status) {
    alert(resultGetInstrumentsById.message || 'Cant makeRequest URL_GET_INSTRUMENTS_BY_ID');
    return true;
  }

  btcDoc = resultGetInstrumentsById.result.find(d => d.name === 'BTCUSDTPERP');
  instrumentDoc = resultGetInstrumentsById.result.find(d => d.name === params.instrumentName);

  const btcTrades = await loadTrades({ instrumentName: btcDoc.name });
  const instrumentTrades = await loadTrades({ instrumentName: instrumentDoc.name });

  btcDoc.trades = btcTrades;
  instrumentDoc.trades = instrumentTrades;

  await loadCharts();

  calculateCandlesForBtc();
  calculateCandlesForInstrument();

  // findVolume();
});

/* Functions */

const calculateCandlesForBtc = () => {
  if (!btcDoc.trades || !btcDoc.trades.length) {
    return null;
  }

  const chartCandles = btcDoc.chart_candles;
  const indicatorVolume = btcDoc.indicator_volume;

  chartCandles.originalData = [];

  // tmp
  const { trades } = btcDoc;

  const splitByMinutes = [];
  let newSplit = [trades[0]];

  let minute = new Date(trades[0].originalTimeUnix * 1000).getUTCMinutes();

  for (let i = 1; i < trades.length; i += 1) {
    const minuteOfTrade = new Date(trades[i].originalTimeUnix * 1000).getUTCMinutes();

    if (minuteOfTrade !== minute) {
      minute = minuteOfTrade;

      splitByMinutes.push(newSplit);
      newSplit = [trades[i]];
      continue;
    }

    newSplit.push(trades[i]);
  }

  let periods = splitByMinutes;

  if (choosenPeriod === AVAILABLE_PERIODS.get('5m')) {
    const coeff = 5 * 60 * 1000;
    let timeUnixOfFirstCandle = periods[0][0].originalTimeUnix;

    const divider = timeUnixOfFirstCandle % 60;

    if (divider !== 0) {
      let incr = 1;
      const next5mInterval = (Math.ceil((timeUnixOfFirstCandle * 1000) / coeff) * coeff) / 1000;

      periods.shift();

      alert('Started while loop');

      while (1) {
        const firstCandleTimeOfPeriod = periods[incr][0].originalTimeUnix;

        if (firstCandleTimeOfPeriod === next5mInterval) {
          timeUnixOfFirstCandle = firstCandleTimeOfPeriod;
          break;
        }

        incr += 1;
        periods.shift();
      }
    }

    let newPeriod = [];
    const newPeriods = [];

    let current5mInterval = timeUnixOfFirstCandle;
    let next5mInterval = current5mInterval + 300;

    periods.forEach(period => {
      const timeUnixOfFirstCandleInPeriod = period[0].originalTimeUnix;

      if (timeUnixOfFirstCandleInPeriod < next5mInterval) {
        newPeriod.push(...period);
        return true;
      }

      newPeriods.push(newPeriod);

      newPeriod = [...period];
      current5mInterval = next5mInterval;
      next5mInterval += 300;
    });

    periods = newPeriods;
  }

  const lines = [];
  const lPeriods = periods.length;

  for (let i = 0; i < lPeriods; i += 1) {
    const period = periods[i];
    const lTrades = period.length;

    const open = period[0].price;
    const time = period[0].originalTimeUnix;

    let sumBuys = 0;
    let sumSells = 0;

    if (i > candlesForCalculateAverageValue) {
      const targetCandles = chartCandles.originalData.slice(
        i - candlesForCalculateAverageValue,
        chartCandles.originalData.length,
      );

      sumBuys = targetCandles
        .reduce((currentValue, e) => e.buys + currentValue, 0);

      sumSells = targetCandles
        .reduce((currentValue, e) => e.sells + currentValue, 0);
    }

    const newCandle = {
      time,
      originalTime: new Date(time * 1000),
      originalTimeUnix: time,

      open,
      close: open,

      sells: 0,
      buys: 0,

      low: open,
      high: open,
      volume: 0,

      trades: period,
    };

    chartCandles.originalData.push(newCandle);

    for (let j = 0; j < lTrades; j += 1) {
      const { price, quantity, isLong } = period[j];

      if (price < newCandle.low) {
        newCandle.low = price;
      }

      if (price > newCandle.high) {
        newCandle.high = price;
      }

      newCandle.close = price;
      newCandle.volume += quantity;

      if (isLong) {
        newCandle.buys += quantity;
      } else {
        newCandle.sells += quantity;
      }

      if (newCandle.close > newCandle.open
        && sumBuys && newCandle.buys > sumSells) {
        const doesExistLineWithThisTime = lines.some(
          line => line.originalTimeUnix === time,
        );

        if (!doesExistLineWithThisTime) {
          newCandle.isTrade = true;
          newCandle.timeTrade = period[j].originalTimeMs;

          lines.push({
            price,
            originalTimeUnix: time,
          });

          chartCandles.addMarker({
            shape: 'arrowDown',
            color: constants.YELLOW_COLOR,
            time,
          });
        }
      }

      /*
      const prevCandle = chartCandles.originalData[chartCandles.originalData.length - 1];

      if (prevCandle) {
        if (buys > (sells * 4) && buys > prevCandle.volume && close > open) {
          const doesExistLineWithThisTime = lines.some(
            line => line.originalTimeUnix === time,
          );

          if (!doesExistLineWithThisTime) {
            lines.push({
              price,
              originalTimeUnix: time,
            });
          }
        }
      }
      // */
    }

    // averageBuys.push(buys);
  }

  chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

  indicatorVolume.drawSeries(indicatorVolume.mainSeries, chartCandles.originalData.map(e => ({
    value: e.volume,
    time: e.time,
  })));

  if (lines.length) {
    let timePadding;

    if (choosenPeriod === AVAILABLE_PERIODS.get('1m')) {
      timePadding = 60;
    } else if (choosenPeriod === AVAILABLE_PERIODS.get('5m')) {
      timePadding = 300;
    }

    chartCandles.drawMarkers();

    lines.forEach(newLine => {
      const newCandleExtraSeries = chartCandles.addExtraSeries({
        color: constants.YELLOW_COLOR,
        lastValueVisible: false,
      });

      chartCandles.drawSeries(newCandleExtraSeries, [{
        value: newLine.price,
        time: newLine.originalTimeUnix - timePadding,
      }, {
        value: newLine.price,
        time: newLine.originalTimeUnix + timePadding,
      }]);
    });
  }
};

const calculateCandlesForInstrument = () => {
  if (!instrumentDoc.trades || !instrumentDoc.trades.length) {
    return null;
  }

  const chartCandles = instrumentDoc.chart_candles;
  const indicatorVolume = instrumentDoc.indicator_volume;

  chartCandles.originalData = [];

  // tmp
  const { trades } = instrumentDoc;

  const splitByMinutes = [];
  let newSplit = [trades[0]];

  let minute = new Date(trades[0].originalTimeUnix * 1000).getUTCMinutes();

  for (let i = 1; i < trades.length; i += 1) {
    const minuteOfTrade = new Date(trades[i].originalTimeUnix * 1000).getUTCMinutes();

    if (minuteOfTrade !== minute) {
      minute = minuteOfTrade;

      splitByMinutes.push(newSplit);
      newSplit = [trades[i]];
      continue;
    }

    newSplit.push(trades[i]);
  }

  let periods = splitByMinutes;

  if (choosenPeriod === AVAILABLE_PERIODS.get('5m')) {
    const coeff = 5 * 60 * 1000;
    let timeUnixOfFirstCandle = periods[0][0].originalTimeUnix;

    const divider = timeUnixOfFirstCandle % 60;

    if (divider !== 0) {
      let incr = 1;
      const next5mInterval = (Math.ceil((timeUnixOfFirstCandle * 1000) / coeff) * coeff) / 1000;

      periods.shift();

      alert('Started while loop');

      while (1) {
        const firstCandleTimeOfPeriod = periods[incr][0].originalTimeUnix;

        if (firstCandleTimeOfPeriod === next5mInterval) {
          timeUnixOfFirstCandle = firstCandleTimeOfPeriod;
          break;
        }

        incr += 1;
        periods.shift();
      }
    }

    let newPeriod = [];
    const newPeriods = [];

    let current5mInterval = timeUnixOfFirstCandle;
    let next5mInterval = current5mInterval + 300;

    periods.forEach(period => {
      const timeUnixOfFirstCandleInPeriod = period[0].originalTimeUnix;

      if (timeUnixOfFirstCandleInPeriod < next5mInterval) {
        newPeriod.push(...period);
        return true;
      }

      newPeriods.push(newPeriod);

      newPeriod = [...period];
      current5mInterval = next5mInterval;
      next5mInterval += 300;
    });

    periods = newPeriods;
  }

  const lines = [];
  const lPeriods = periods.length;

  for (let i = 0; i < lPeriods; i += 1) {
    const period = periods[i];
    const lTrades = period.length;

    const open = period[0].price;
    const time = period[0].originalTimeUnix;

    const newCandle = {
      time,
      originalTime: new Date(time * 1000),
      originalTimeUnix: time,

      open,
      close: open,

      sells: 0,
      buys: 0,

      low: open,
      high: open,
      volume: 0,

      trades: period,
    };

    chartCandles.originalData.push(newCandle);

    const btcCandle = btcDoc.chart_candles.originalData[i];

    for (let j = 0; j < lTrades; j += 1) {
      const { price, quantity, isLong } = period[j];

      if (price < newCandle.low) {
        newCandle.low = price;
      }

      if (price > newCandle.high) {
        newCandle.high = price;
      }

      newCandle.close = price;
      newCandle.volume += quantity;

      if (isLong) {
        newCandle.buys += quantity;
      } else {
        newCandle.sells += quantity;
      }

      if (btcCandle.isTrade
        && btcCandle.timeTrade < period[j].originalTimeMs
        && newCandle.close > newCandle.open
        && newCandle.buys > (newCandle.sells * 2)) {
      // if (prevCandle && close > open && buys > (prevCandle.sells + sells)) {
        const doesExistLineWithThisTime = lines.some(
          line => line.originalTimeUnix === time,
        );

        if (!doesExistLineWithThisTime) {
          console.log('btc', new Date(btcCandle.timeTrade).toISOString());
          console.log('instrument', new Date(period[j].originalTimeMs).toISOString());
          console.log('=========');

          lines.push({
            price,
            originalTimeUnix: time,
          });

          chartCandles.addMarker({
            shape: 'arrowDown',
            color: constants.YELLOW_COLOR,
            time,
          });
        }
      }

      /*
      const prevCandle = chartCandles.originalData[chartCandles.originalData.length - 1];

      if (prevCandle) {
        if (buys > (sells * 4) && buys > prevCandle.volume && close > open) {
          const doesExistLineWithThisTime = lines.some(
            line => line.originalTimeUnix === time,
          );

          if (!doesExistLineWithThisTime) {
            lines.push({
              price,
              originalTimeUnix: time,
            });
          }
        }
      }
      // */
    }

    // averageBuys.push(buys);
  }

  chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

  indicatorVolume.drawSeries(indicatorVolume.mainSeries, chartCandles.originalData.map(e => ({
    value: e.volume,
    time: e.time,
  })));

  if (lines.length) {
    let timePadding;

    if (choosenPeriod === AVAILABLE_PERIODS.get('1m')) {
      timePadding = 60;
    } else if (choosenPeriod === AVAILABLE_PERIODS.get('5m')) {
      timePadding = 300;
    }

    chartCandles.drawMarkers();

    lines.forEach(newLine => {
      const newCandleExtraSeries = chartCandles.addExtraSeries({
        color: constants.YELLOW_COLOR,
        lastValueVisible: false,
      });

      chartCandles.drawSeries(newCandleExtraSeries, [{
        value: newLine.price,
        time: newLine.originalTimeUnix - timePadding,
      }, {
        value: newLine.price,
        time: newLine.originalTimeUnix + timePadding,
      }]);
    });
  }
};

const loadCharts = async () => {
  $chartsContainer.empty();

  const chartKeys = ['btc', 'instrument'];

  let appendStr = '';

  chartKeys.forEach(chartKey => {
    appendStr += `<div class="chart-container ${chartKey}">
      <div class="charts-nav">
        <div class="legend">
          <p class="values">ОТКР<span class="open">0</span>МАКС<span class="high">0</span>МИН<span class="low">0</span>ЗАКР<span class="close">0</span><span class="percent">0%</span></p>
        </div>
        <div class="row">
          <div class="chart-periods">
            <div class="1m is_worked  ${choosenPeriod === AVAILABLE_PERIODS.get('1m') ? 'is_active' : ''}" data-period="1m"><span>1M</span></div>
            <div class="5m is_worked  ${choosenPeriod === AVAILABLE_PERIODS.get('5m') ? 'is_active' : ''}" data-period="5m"><span>5M</span></div>
          </div>
        </div>
      </div>
      <span class="ruler">0%</span>
      <div class="charts" style="height: ${windowHeight / 2}px"></div>
    </div>`;
  });

  $chartsContainer.append(appendStr);

  const listCharts = [];

  chartKeys.forEach(chartKey => {
    const $chartContainer = $chartsContainer.find(`.chart-container.${chartKey}`);
    const $rootContainer = $chartContainer.find('.charts');

    let chartKeyDoc;

    switch (chartKey) {
      case 'btc': { chartKeyDoc = btcDoc; break; }
      case 'instrument': { chartKeyDoc = instrumentDoc; break; }
      default: break;
    }

    const chartCandles = new ChartCandles($rootContainer, choosenPeriod, chartKeyDoc);
    const indicatorVolume = new IndicatorVolume($rootContainer);

    chartCandles.chartKey = chartKey;
    chartKeyDoc.chart_candles = chartCandles;
    chartKeyDoc.indicator_volume = indicatorVolume;

    const $ruler = $chartContainer.find('span.ruler');
    const $legend = $chartContainer.find('.legend');
    const $low = $legend.find('span.low');
    const $high = $legend.find('span.high');
    const $open = $legend.find('span.open');
    const $close = $legend.find('span.close');
    const $percent = $legend.find('span.percent');

    /*
    chartCandles.chart.subscribeClick(async (param) => {
      if (param.time) {
        const targetCandle = chartCandles.originalData.find(
          candle => candle.originalTimeUnix === param.time,
        );

        console.clear();

        const sortedTrades = targetCandle.trades
          .sort((a, b) => a.quantity > b.quantity ? -1 : 1);

        sortedTrades.forEach(trade => {
          const targetTrades = instrumentDoc.trades.filter(dTrade => dTrade.quantity === trade.quantity);

          if (targetTrades.length >= 10) {
            console.log(trade.quantity, targetTrades.length);
          }
        });

        /*
        const counterLong = new Map();
        const counterShort = new Map();

        const sortedLong = targetCandle.trades
          .filter(trade => trade.isLong && trade.quantity >= triggerQuantity)
          .sort((a, b) => a.quantity > b.quantity ? -1 : 1);

        const sortedShort = targetCandle.trades
          .filter(trade => !trade.isLong && trade.quantity >= triggerQuantity)
          .sort((a, b) => a.quantity > b.quantity ? -1 : 1);

        sortedLong.forEach(trade => {
          let counter = counterLong.get(trade.quantity);

          if (!counter) {
            counter = 0;
          }

          counter += 1;
          counterLong.set(trade.quantity, counter);
        });

        sortedShort.forEach(trade => {
          let counter = counterShort.get(trade.quantity);

          if (!counter) {
            counter = 0;
          }

          counter += 1;
          counterShort.set(trade.quantity, counter);
        });

        sortedLong.forEach(trade => {
          console.log(trade.quantity, trade.price, counterLong.get(trade.quantity));
        });

        console.log('==================');

        sortedShort.forEach(trade => {
          console.log(trade.quantity, trade.price, counterShort.get(trade.quantity));
        });
      }
    });
    */

    chartCandles.chart.subscribeCrosshairMove((param) => {
      if (param.point) {
        const coordinateToPrice = chartCandles.mainSeries.coordinateToPrice(param.point.y);
        const differenceBetweenInstrumentAndCoordinatePrices = Math.abs(chartKeyDoc.price - coordinateToPrice);
        const percentPerPrice = 100 / (chartKeyDoc.price / differenceBetweenInstrumentAndCoordinatePrices);

        $ruler
          .text(`${percentPerPrice.toFixed(1)}%`)
          .css({
            top: param.point.y - 25,
            left: param.point.x + 15,
          });
      }

      if (param.time) {
        const price = param.seriesPrices.get(chartCandles.mainSeries);

        if (price) {
          const differenceBetweenHighAndLow = price.high - price.low;
          const percentPerPrice = 100 / (price.low / differenceBetweenHighAndLow);

          $open.text(price.open);
          $close.text(price.close);
          $low.text(price.low);
          $high.text(price.high);
          $percent.text(`${percentPerPrice.toFixed(1)}%`);
        }
      }
    });

    listCharts.push(chartCandles, indicatorVolume);
  });

  let isCrossHairMoving = false;

  listCharts.forEach(elem => {
    const otherCharts = listCharts.filter(chart => chart.chartKey !== elem.chartKey);

    elem.chart.subscribeCrosshairMove(param => {
      if (!param.point || !param.time || isCrossHairMoving) {
        return true;
      }

      isCrossHairMoving = true;

      otherCharts.forEach(innerElem => {
        innerElem.chart.moveCrosshair(param.point);
      });

      isCrossHairMoving = false;

      elem.chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        otherCharts.forEach(innerElem => {
          innerElem.chart.timeScale().setVisibleLogicalRange(range);
        });
      });
    });
  });

  listCharts.forEach(chartWrapper => {
    chartWrapper.chart.applyOptions({
      timeScale: {
        timeVisible: true,
      },
    });
  });
};

const loadTrades = async ({
  instrumentName,
}) => {
  console.log('started loading');

  const linkToFile = `/files/aggTrades/${instrumentName}/${instrumentName}.json`;

  const fileData = await makeRequest({
    method: 'GET',
    url: linkToFile,
  });

  if (!fileData) {
    alert(`Cant makeRequest ${linkToFile}`);
    return false;
  }

  const trades = fileData || [];

  console.log('ended loading');

  if (!trades.length) {
    return false;
  }

  const results = trades.map(trade => {
    const [
      price,
      quantity,
      time,
      isLong,
    ] = trade;

    const originalTimeMs = parseInt(time, 10);

    const originalTimeUnix = parseInt(
      (new Date(originalTimeMs).setSeconds(0)) / 1000, 10,
    );

    return {
      isLong,
      price: parseFloat(price),
      quantity: parseFloat(quantity),
      originalTimeUnix,
      originalTimeMs,
    };
  });

  return results;
};

const findVolume = () => {
  const chartCandles = instrumentDoc.chart_candles;
  const candlesData = chartCandles.originalData;

  if (!candlesData || !candlesData.length) {
    return true;
  }

  const newLines = [];

  candlesData.forEach(candle => {
    candle.trades.forEach(trade => {
      if (trade.quantity >= triggerQuantity) {
        newLines.push({
          quantity: trade.quantity,
          originalTimeUnix: candle.originalTimeUnix,
          price: trade.price,
          isLong: trade.isLong,
        });
      }
    });
  });

  if (newLines.length) {
    let timePadding;

    if (choosenPeriod === AVAILABLE_PERIODS.get('1m')) {
      timePadding = 60;
    } else if (choosenPeriod === AVAILABLE_PERIODS.get('5m')) {
      timePadding = 300;
    }

    newLines.forEach(newLine => {
      /*
      let numberLinesWithThisTime = 0;

      newLines.forEach(line => {
        if (line.originalTimeUnix === newLine.originalTimeUnix) {
          numberLinesWithThisTime += 1;
        }
      });

      if (numberLinesWithThisTime < 3) {
        return true;
      }
      */

      const newCandleExtraSeries = chartCandles.addExtraSeries({
        color: newLine.isLong ? constants.GREEN_COLOR : constants.RED_COLOR,
        lastValueVisible: false,
      });

      chartCandles.drawSeries(newCandleExtraSeries, [{
        value: newLine.price,
        time: newLine.originalTimeUnix - timePadding,
      }, {
        value: newLine.price,
        time: newLine.originalTimeUnix + timePadding,
      }]);
    });
  }
};
