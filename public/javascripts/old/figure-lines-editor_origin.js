/* global
functions, makeRequest, getUnix,
objects, constants, moment, ChartCandles, IndicatorVolume
*/

/* Constants */

const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';

const AVAILABLE_PERIODS = new Map([
  ['5m', '5m'],
  ['1h', '1h'],
]);

/* Variables */

const windowHeight = window.innerHeight;

let choosenInstrumentId;
let choosenPeriod = AVAILABLE_PERIODS.get('1h');

let figureLines = [];
let instrumentsDocs = [];

const settings = {
  [AVAILABLE_PERIODS.get('5m')]: {
    padding: 20,
    numberTouches: 0,
    allowedPercent: 0.2,
    subtractTimeFromNow: 7 * 24 * 60 * 60, // 7 days
  },

  [AVAILABLE_PERIODS.get('1h')]: {
    padding: 20,
    numberTouches: 0,
    allowedPercent: 0.2,
    subtractTimeFromNow: 3 * 31 * 24 * 60 * 60, // 3 months
  },
};

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

/* JQuery */
const $report = $('.report');
const $chartsContainer = $('.charts-container');

const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');

const $settings = $('.settings');

$(document).ready(async () => {
  // start settings

  $instrumentsContainer
    .css({ maxHeight: windowHeight });

  // loading data

  const resultGetInstruments = await makeRequest({
    method: 'GET',
    url: URL_GET_ACTIVE_INSTRUMENTS,
    query: { isOnlyFutures: true },
  });

  if (!resultGetInstruments || !resultGetInstruments.status) {
    alert(resultGetInstruments.message || 'Cant makeRequest URL_GET_ACTIVE_INSTRUMENTS');
    return true;
  }

  instrumentsDocs = resultGetInstruments.result;

  // main logic
  renderListInstruments(instrumentsDocs);

  $('.search input')
    .on('keyup', function () {
      const value = $(this).val().toLowerCase();

      let targetDocs = instrumentsDocs;

      if (value) {
        targetDocs = targetDocs.filter(doc => doc.name
          .toLowerCase()
          .includes(value),
        );
      }

      renderListInstruments(targetDocs);
    });

  $instrumentsList
    .on('click', '.instrument', async function (elem) {
      const $instrument = elem.type ? $(this) : $(elem);
      const instrumentId = $instrument.data('instrumentid');

      if (choosenInstrumentId === instrumentId) {
        return true;
      }

      $instrumentsList
        .find('.instrument')
        .removeClass('is_active');

      $instrument.addClass('is_active');

      choosenInstrumentId = instrumentId;

      await loadCharts({ instrumentId });
      figureLines = calculateFigureLines({ instrumentId });
    });

  $settings
    .find('input[type="text"]')
    .on('change', function () {
      const className = $(this).attr('class');
      const newValue = parseFloat($(this).val());

      if (!newValue || Number.isNaN(newValue)) {
        return true;
      }

      switch (className) {
        default: break;
      }

      if (choosenInstrumentId) {
        const instrumentId = choosenInstrumentId;

        // priceJumps = calculatePriceJumps({ instrumentId });
        // drawMarkersForPriceJumps({ instrumentId }, priceJumps);
        //
        // const calculatedProfit = calculateProfit({ instrumentId }, priceJumps);
        // makeReport({ instrumentId }, calculatedProfit);
      }
    });

  if (params.symbol) {
    const instrumentDoc = instrumentsDocs.find(doc => doc.name === params.symbol);

    if (!instrumentDoc) {
      alert('No doc with this symbol');
    } else {
      await $._data($($instrumentsList)
        .get(0), 'events').click[0]
        .handler(`#instrument-${instrumentDoc._id}`);
    }
  }
});

const renderListInstruments = (instrumentsDocs) => {
  let appendInstrumentsStr = '';

  instrumentsDocs = instrumentsDocs.filter(doc => doc.is_futures);

  instrumentsDocs
    .forEach(doc => {
      appendInstrumentsStr += `<div
        id="instrument-${doc._id}"
        class="instrument"
        data-instrumentid=${doc._id}>
        <span class="instrument-name">${doc.name}</span>
      </div>`;
    });

  $instrumentsList
    .empty()
    .append(appendInstrumentsStr);
};

const loadCharts = async ({
  instrumentId,
}) => {
  $chartsContainer.empty();

  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  if (!futuresDoc.original_data || !futuresDoc.original_data.length) {
    const { subtractTimeFromNow } = settings[choosenPeriod];

    const startDate = moment().startOf('day')
      .add(-subtractTimeFromNow, 'seconds');

    futuresDoc.original_data = await getCandlesData({
      period: choosenPeriod,
      instrumentId: futuresDoc._id,

      startTime: startDate.toISOString(),
    });
  }

  const chartKeys = ['futures'];

  let appendStr = '';

  chartKeys.forEach(chartKey => {
    appendStr += `<div class="chart-container ${chartKey}">
      <div class="charts-nav">
        <div class="legend">
          <p class="values">ОТКР<span class="open">0</span>МАКС<span class="high">0</span>МИН<span class="low">0</span>ЗАКР<span class="close">0</span><span class="percent">0%</span></p>
        </div>
        <div class="row">
          <div class="chart-periods">
            <div class="5m is_worked  ${choosenPeriod === AVAILABLE_PERIODS.get('5m') ? 'is_active' : ''}" data-period="5m"><span>5M</span></div>
            <div class="1h is_worked  ${choosenPeriod === AVAILABLE_PERIODS.get('1h') ? 'is_active' : ''}" data-period="1h"><span>1H</span></div>
          </div>
        </div>
        <div class="actions-menu"></div>
      </div>
      <span class="ruler">0%</span>
      <div class="charts" style="height: ${windowHeight}px"></div>
    </div>`;
  });

  $chartsContainer.append(appendStr);

  const listCharts = [];

  chartKeys.forEach(chartKey => {
    const $chartContainer = $chartsContainer.find(`.chart-container.${chartKey}`);
    const $rootContainer = $chartContainer.find('.charts');

    let chartKeyDoc;

    switch (chartKey) {
      case 'futures': { chartKeyDoc = futuresDoc; break; }

      case 'btc': {
        const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');
        chartKeyDoc = btcDoc;
        break;
      }

      default: break;
    }

    const chartCandles = new ChartCandles($rootContainer, choosenPeriod, chartKeyDoc);
    const indicatorVolume = new IndicatorVolume($rootContainer);

    chartCandles.chartKey = chartKey;
    chartCandles.setOriginalData(chartKeyDoc.original_data, false);
    chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

    indicatorVolume.drawSeries(indicatorVolume.mainSeries, chartCandles.originalData.map(e => ({
      value: e.volume,
      time: e.time,
    })));

    chartKeyDoc.chart_candles = chartCandles;
    chartKeyDoc.indicator_volume = indicatorVolume;

    const $ruler = $chartContainer.find('span.ruler');
    const $legend = $chartContainer.find('.legend');
    const $low = $legend.find('span.low');
    const $high = $legend.find('span.high');
    const $open = $legend.find('span.open');
    const $close = $legend.find('span.close');
    const $percent = $legend.find('span.percent');

    if (chartKey === 'futures') {
      chartCandles.chart.subscribeClick((param) => {
        if (param.time && figureLines.length) {
          const existedSeries = chartCandles.extraSeries.find(
            series => series.id === param.time,
          );

          if (existedSeries) {
            chartCandles.removeSeries(existedSeries, false);
            figureLines = figureLines.filter(level => param.time !== level.startOfLevelUnix);
          }
        }
      });
    }

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

const calculateFigureLines = ({ instrumentId }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const chartCandles = instrumentDoc.chart_candles;
  const candlesData = chartCandles.originalData;
  const lCandles = candlesData.length;

  if (!lCandles) {
    return true;
  }

  figureLines = [];
  const lowestCandles = [];
  const highestCandles = [];

  const intervalSettings = settings[choosenPeriod];

  for (let i = 0; i < lCandles - intervalSettings.padding; i += 1) {
    const candle = candlesData[i];
    const startIndex = i - intervalSettings.padding;

    const targetCandlesArr = candlesData.slice(
      startIndex < 0 ? 0 : startIndex,
      i + intervalSettings.padding,
    );

    let isCandleLowLowest = true;
    let isCandleHighHighest = true;

    targetCandlesArr.forEach(tCandle => {
      if (!isCandleHighHighest) {
        return true;
      }

      if (tCandle.high > candle.high) {
        isCandleHighHighest = false;
      }
    });

    targetCandlesArr.forEach(tCandle => {
      if (!isCandleLowLowest) {
        return true;
      }

      if (tCandle.low < candle.low) {
        isCandleLowLowest = false;
      }
    });

    if (isCandleHighHighest) {
      highestCandles.push(candle);
    }

    if (isCandleLowLowest) {
      lowestCandles.push(candle);
    }
  }

  for (let i = 0; i < highestCandles.length; i += 1) {
    const candle = highestCandles[i];

    if (!highestCandles[i + 1]) {
      break;
    }

    const indexOfFirstCandle = candlesData.findIndex(
      tCandle => tCandle.originalTimeUnix === candle.originalTimeUnix,
    );

    const newFigureLines = [];

    for (let j = i + 1; j < highestCandles.length; j += 1) {
      const nextCandle = highestCandles[j];

      const indexOfSecondCandle = candlesData.findIndex(
        tCandle => tCandle.originalTimeUnix === nextCandle.originalTimeUnix,
      );

      const numberCandles = indexOfSecondCandle - indexOfFirstCandle;

      if (candle.high < nextCandle.high || numberCandles < 2) {
        continue;
      }

      let indexOfEndCandle;

      const differenceBetweenHighs = candle.high - nextCandle.high;
      const numberReduceForPrice = differenceBetweenHighs / numberCandles;

      let originalTimeUnixForEndCandle;

      let isExit = false;
      let isActive = false;
      let currentPrice = candle.high;

      for (let j = indexOfFirstCandle + 1; j < lCandles; j += 1) {
        currentPrice -= numberReduceForPrice;

        const price = candlesData[j].isLong ? candlesData[j].close : candlesData[j].open;
        const limitPrice = currentPrice + (currentPrice * (intervalSettings.allowedPercent / 100));
        const limitPriceForHigh = currentPrice + (currentPrice * ((intervalSettings.allowedPercent * 2) / 100));

        if (price > limitPrice || candlesData[j].high > limitPriceForHigh) {
          if (j < indexOfSecondCandle) {
            isExit = true;
          } else {
            indexOfEndCandle = j;
            originalTimeUnixForEndCandle = candlesData[j].originalTimeUnix;
          }

          break;
        }
      }

      if (isExit) {
        continue;
      }

      if (!originalTimeUnixForEndCandle) {
        isActive = true;
        indexOfEndCandle = lCandles - 1;
        originalTimeUnixForEndCandle = candlesData[indexOfEndCandle].originalTimeUnix;
      }

      const touches = [];
      let numberTouches = 0;
      currentPrice = candle.high;

      for (let j = indexOfFirstCandle; j < indexOfEndCandle; j += 1) {
        currentPrice -= numberReduceForPrice;

        if (j === indexOfFirstCandle
          || j === indexOfSecondCandle
          || j === indexOfEndCandle) {
          continue;
        }

        const nextCandle = candlesData[j];

        if (nextCandle.high >= currentPrice) {
          numberTouches += 1;
          touches.push(nextCandle);
          j += 2;
        }
      }

      if (numberTouches < intervalSettings.numberTouches) {
        continue;
      }

      touches.forEach(touch => {
        const doesExistMarkerWithThisTime = chartCandles.markers.some(
          marker => marker.time === touch.originalTimeUnix,
        );

        if (doesExistMarkerWithThisTime) {
          return true;
        }

        chartCandles.addMarker({
          shape: 'arrowDown',
          color: constants.YELLOW_COLOR,
          time: touch.originalTimeUnix,
        });
      });

      newFigureLines.push([candle, nextCandle, {
        high: currentPrice,
        originalTimeUnix: originalTimeUnixForEndCandle,
      }, {
        isActive,
        isLong: false,
      }]);
    }

    if (newFigureLines.length) {
      const lastFigureLine = newFigureLines[newFigureLines.length - 1];
      figureLines.push(lastFigureLine);

      /*
      const lastFigureLine = newFigureLines[newFigureLines.length - 1];

      const differenceBetweenDates = getUnix() - lastFigureLine[0].originalTimeUnix;

      if (differenceBetweenDates < intervalSettings.subtractTimeFromNow) {
        figureLines.push(lastFigureLine);
      }
      */
    }
  }

  for (let i = 0; i < lowestCandles.length; i += 1) {
    const candle = lowestCandles[i];

    if (!lowestCandles[i + 1]) {
      break;
    }

    const indexOfFirstCandle = candlesData.findIndex(
      tCandle => tCandle.originalTimeUnix === candle.originalTimeUnix,
    );

    const newFigureLines = [];

    for (let j = i + 1; j < lowestCandles.length; j += 1) {
      const nextCandle = lowestCandles[j];

      const indexOfSecondCandle = candlesData.findIndex(
        tCandle => tCandle.originalTimeUnix === nextCandle.originalTimeUnix,
      );

      const numberCandles = indexOfSecondCandle - indexOfFirstCandle;

      if (candle.low > nextCandle.low || numberCandles < 2) {
        continue;
      }

      let indexOfEndCandle;

      const differenceBetweenLows = nextCandle.low - candle.low;
      const numberReduceForPrice = differenceBetweenLows / numberCandles;

      let originalTimeUnixForEndCandle;

      let isExit = false;
      let isActive = false;
      let currentPrice = candle.low;

      for (let j = indexOfFirstCandle + 1; j < lCandles; j += 1) {
        currentPrice += numberReduceForPrice;

        const price = candlesData[j].isLong ? candlesData[j].open : candlesData[j].close;
        const limitPrice = currentPrice - (currentPrice * (intervalSettings.allowedPercent / 100));
        const limitPriceForHigh = currentPrice - (currentPrice * ((intervalSettings.allowedPercent * 2) / 100));

        if (price < limitPrice || candlesData[j].low < limitPriceForHigh) {
          if (j < indexOfSecondCandle) {
            isExit = true;
          } else {
            indexOfEndCandle = j;
            originalTimeUnixForEndCandle = candlesData[j].originalTimeUnix;
          }

          break;
        }
      }

      if (isExit) {
        continue;
      }

      if (!originalTimeUnixForEndCandle) {
        isActive = true;
        indexOfEndCandle = lCandles - 1;
        originalTimeUnixForEndCandle = candlesData[indexOfEndCandle].originalTimeUnix;
      }

      const touches = [];
      let numberTouches = 0;
      currentPrice = candle.low;

      for (let j = indexOfFirstCandle; j < indexOfEndCandle; j += 1) {
        currentPrice += numberReduceForPrice;

        if (j === indexOfFirstCandle
          || j === indexOfSecondCandle
          || j === indexOfEndCandle) {
          continue;
        }

        const nextCandle = candlesData[j];

        if (nextCandle.low <= currentPrice) {
          numberTouches += 1;
          touches.push(nextCandle);
          j += 2;
        }
      }

      if (numberTouches < intervalSettings.numberTouches) {
        continue;
      }

      touches.forEach(touch => {
        const doesExistMarkerWithThisTime = chartCandles.markers.some(
          marker => marker.time === touch.originalTimeUnix,
        );

        if (doesExistMarkerWithThisTime) {
          return true;
        }

        chartCandles.addMarker({
          shape: 'arrowUp',
          color: constants.YELLOW_COLOR,
          time: touch.originalTimeUnix,
        });
      });

      newFigureLines.push([candle, nextCandle, {
        low: currentPrice,
        originalTimeUnix: originalTimeUnixForEndCandle,
      }, {
        isActive,
        isLong: true,
        angle: numberReduceForPrice,
      }]);
    }

    if (newFigureLines.length) {
      const lastFigureLine = newFigureLines[newFigureLines.length - 1];
      figureLines.push(lastFigureLine);

      /*
      const lastFigureLine = newFigureLines[newFigureLines.length - 1];

      const differenceBetweenDates = getUnix() - lastFigureLine[0].originalTimeUnix;

      if (differenceBetweenDates < intervalSettings.subtractTimeFromNow) {
        figureLines.push(lastFigureLine);
      }
      */
    }
  }

  figureLines.forEach(([start, middle, end, {
    isLong,
    isActive,
  }]) => {
    if (!isActive) {
      return true;
    }

    const key = isLong ? 'low' : 'high';
    const lineStyle = isActive ? 0 : 2;
    // const color = isLong ? constants.GREEN_COLOR : constants.RED_COLOR;

    const newExtraSeries = chartCandles.addExtraSeries({
      // color,
      lineStyle,
      lastValueVisible: false,
    }, {
      id: start.originalTimeUnix,
    });

    chartCandles.drawSeries(
      newExtraSeries,
      [start, end].map(candle => ({
        value: candle[key],
        time: candle.originalTimeUnix,
      })),
    );
  });

  return figureLines;
};

const getCandlesData = async ({
  instrumentId,
  period,
  startTime,
  endTime,
}) => {
  console.log('start loading');

  const query = {
    instrumentId,
    isFirstCall: false,
  };

  if (startTime) {
    query.startTime = startTime;
  }

  if (endTime) {
    query.endTime = endTime;
  }

  const resultGetCandles = await makeRequest({
    method: 'GET',
    url: `${URL_GET_CANDLES}/${period}`,
    query,
  });

  if (!resultGetCandles || !resultGetCandles.status) {
    alert(resultGetCandles.message || `Cant makeRequest ${URL_GET_CANDLES}`);
    return [];
  }

  console.log('end loading');

  return resultGetCandles.result;
};
