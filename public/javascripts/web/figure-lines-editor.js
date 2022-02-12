/* global
functions, makeRequest, getUnix,
objects, user, constants, moment, ChartCandles, IndicatorVolume
*/

/* Constants */

const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';
const URL_GET_USER_FIGURE_LINE_BOUNDS = '/api/user-figure-line-bounds';
const URL_CHANGE_USER_FIGURE_LINE_BOUND = '/api/user-figure-line-bounds';

const AVAILABLE_PERIODS = new Map([
  ['5m', '5m'],
  ['1h', '1h'],
]);

/* Variables */

const windowHeight = window.innerHeight;

let instrumentsDocs = [];

let choosedFigureLine = false;
let prevChoosedFigureLine = false;

let choosenInstrumentId;
let choosenPeriod = AVAILABLE_PERIODS.get('1h');

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

const settings = {
  [AVAILABLE_PERIODS.get('5m')]: {
    allowedPercent: 0.2,
    subtractTimeFromNow: 7 * 24 * 60 * 60, // 7 days
  },

  [AVAILABLE_PERIODS.get('1h')]: {
    allowedPercent: 0.2,
    subtractTimeFromNow: 3 * 31 * 24 * 60 * 60, // 3 months
  },
};

/* JQuery */
const $chartsContainer = $('.charts-container');

const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');

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

  const resultGetLineBounds = await makeRequest({
    method: 'GET',
    url: URL_GET_USER_FIGURE_LINE_BOUNDS,
    query: {
      isActive: true,
      userId: user._id,
    },
  });

  if (!resultGetLineBounds || !resultGetLineBounds.status) {
    alert(resultGetLineBounds.message || 'Cant makeRequest URL_GET_USER_FIGURE_LINE_BOUNDS');
    return true;
  }

  instrumentsDocs.forEach(doc => {
    doc.user_figure_line_bounds = resultGetLineBounds.result.filter(
      bound => bound.instrument_id === doc._id,
    );
  });

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
      drawFigureLines({ instrumentId });
    });

  $(document)
    .on('keyup', async e => {
      if (!choosenInstrumentId) {
        return true;
      }

      // arrow right
      if (e.keyCode === 39) {
        const indexOfInstrumentDoc = instrumentsDocs
          .findIndex(doc => doc._id === choosenInstrumentId);

        const nextIndex = indexOfInstrumentDoc + 1;

        if (!instrumentsDocs[nextIndex]) {
          return true;
        }

        $instrumentsList
          .find('.instrument').eq(nextIndex)
          .click();
      }

      if (choosedFigureLine) {
        if (e.keyCode === 8) {
          // -
          const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
          const chartCandles = instrumentDoc.chart_candles;

          chartCandles.removeSeries(choosedFigureLine.series, false);
          console.log('extraSeries.length', chartCandles.extraSeries.length);
          instrumentDoc.user_figure_line_bounds = instrumentDoc.user_figure_line_bounds.filter(
            bound => bound._id !== choosedFigureLine.bound._id,
          );

          await changeUserFigureLineBound({
            boundId: choosedFigureLine.bound._id,
          }, {
            isActive: false,
            isModerated: true,
          });

          choosedFigureLine = false;
        } else if (e.keyCode === 187) {
          // +
          choosedFigureLine.series.applyOptions({ color: constants.BLUE_COLOR });

          await changeUserFigureLineBound({
            boundId: choosedFigureLine.bound._id,
          }, {
            isModerated: true,
          });

          choosedFigureLine = false;
        } else if (e.keyCode === 48) {
          choosedFigureLine.series.applyOptions({ color: constants.RED_COLOR });
        }
      }

      // -
      if (e.keyCode === 189) {
        if (prevChoosedFigureLine) {
          const resultChange = await changeUserFigureLineBound({
            boundId: prevChoosedFigureLine._id,
          }, {
            isActive: true,
          });

          if (resultChange) {
            prevChoosedFigureLine = false;
          }
        }
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

    chartCandles.chart.subscribeClick(async (param) => {
      if (param.time) {
        let existedSeries = chartCandles.extraSeries.find(
          series => series.originalTimeUnix === param.time,
        );

        if (!existedSeries) {
          let indexOfNearestBoundFromLeft;
          let indexOfNearestBoundFromRight;
          const candles = chartCandles.originalData;
          const lCandles = candles.length;

          const candleIndex = candles.findIndex(
            c => c.originalTimeUnix === param.time,
          );

          for (let i = candleIndex; i >= 0; i -= 1) {
            const candle = candles[i];
            indexOfNearestBoundFromLeft = i;

            const doesExistBoundWithThisIndex = futuresDoc.user_figure_line_bounds.find(
              bound => getUnix(bound.line_start_candle_time) === candle.originalTimeUnix,
            );

            if (doesExistBoundWithThisIndex) {
              break;
            }

            if (i === 1) {
              indexOfNearestBoundFromLeft = false;
            }
          }

          for (let i = candleIndex; i < lCandles; i += 1) {
            const candle = candles[i];
            indexOfNearestBoundFromRight = i;

            const doesExistBoundWithThisIndex = futuresDoc.user_figure_line_bounds.find(
              bound => getUnix(bound.line_start_candle_time) === candle.originalTimeUnix,
            );

            if (doesExistBoundWithThisIndex) {
              break;
            }

            if (i === lCandles - 1) {
              indexOfNearestBoundFromRight = false;
            }
          }

          if (!indexOfNearestBoundFromLeft && !indexOfNearestBoundFromRight) {
            return true;
          }

          let targetCandle;

          if (!indexOfNearestBoundFromLeft) {
            targetCandle = candles[indexOfNearestBoundFromRight];
          } else if (!indexOfNearestBoundFromRight) {
            targetCandle = candles[indexOfNearestBoundFromLeft];
          } else {
            const differeneceBetweenCandleAndBoundFromLeft = candleIndex - indexOfNearestBoundFromLeft;
            const differeneceBetweenCandleAndBoundFromRight = indexOfNearestBoundFromRight - candleIndex;

            if (differeneceBetweenCandleAndBoundFromLeft < differeneceBetweenCandleAndBoundFromRight) {
              targetCandle = candles[indexOfNearestBoundFromLeft];
            } else {
              targetCandle = candles[indexOfNearestBoundFromRight];
            }
          }

          const existedBound = futuresDoc.user_figure_line_bounds.find(
            bound => getUnix(bound.line_start_candle_time) === targetCandle.originalTimeUnix,
          );

          existedSeries = chartCandles.extraSeries.find(
            series => series.boundId === existedBound._id
              && series.originalTimeUnix === getUnix(existedBound.line_start_candle_time),
          );

          if (!existedSeries) {
            alert('No existedSeries');
            return true;
          }

          choosedFigureLine = {
            series: existedSeries,
            bound: existedBound,
          };

          console.log('choosedFigureLine', choosedFigureLine.bound.line_start_candle_time);
        } else {
          choosedFigureLine = {
            series: existedSeries,
            bound: futuresDoc.user_figure_line_bounds.find(
              bound => getUnix(bound.line_start_candle_time) === param.time,
            ),
          };
        }

        prevChoosedFigureLine = JSON.parse(JSON.stringify(choosedFigureLine.bound));
      }
    });

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

const drawFigureLines = ({ instrumentId }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const chartCandles = instrumentDoc.chart_candles;
  const candlesData = chartCandles.originalData;
  const userFigureLinesBounds = instrumentDoc.user_figure_line_bounds;

  const lCandles = candlesData.length;

  if (!lCandles || !userFigureLinesBounds.length) {
    return true;
  }

  const longFigureLines = userFigureLinesBounds.filter(bound => bound.is_long);
  const shortFigureLines = userFigureLinesBounds.filter(bound => !bound.is_long);

  const lLongFigureLines = longFigureLines.length;
  const lShortFigureLines = shortFigureLines.length;

  const figureLines = [];

  for (let i = 0; i < lLongFigureLines; i += 1) {
    const figureLineBound = longFigureLines[i];
    const lineStartCandleTimeUnix = getUnix(figureLineBound.line_start_candle_time);

    const indexOfFirstCandle = candlesData.findIndex(
      tCandle => tCandle.originalTimeUnix === lineStartCandleTimeUnix,
    );

    if (!~indexOfFirstCandle) {
      continue;
    }

    let indexOfEndCandle = false;
    let currentPrice = candlesData[indexOfFirstCandle].low;

    if (!figureLineBound.is_worked) {
      for (let j = indexOfFirstCandle + 1; j < lCandles; j += 1) {
        currentPrice += figureLineBound.price_angle;

        const price = candlesData[j].isLong ? candlesData[j].open : candlesData[j].close;
        const limitPrice = currentPrice - (currentPrice * (settings.ALLOWED_PERCENT / 100));
        const limitPriceForHigh = currentPrice - (currentPrice * ((settings.ALLOWED_PERCENT * 2) / 100));

        if (price < limitPrice || candlesData[j].low < limitPriceForHigh) {
          indexOfEndCandle = j;
          break;
        }
      }
    }

    if (!indexOfEndCandle) {
      indexOfEndCandle = lCandles - 1;
    }

    figureLines.push({
      boundId: figureLineBound._id,
      isLong: figureLineBound.is_long,
      isWorked: figureLineBound.is_worked,
      isModerated: figureLineBound.is_moderated,
      indexOfFirstCandle,
      indexOfEndCandle,
      lineLastPrice: currentPrice,
    });
  }

  for (let i = 0; i < lShortFigureLines; i += 1) {
    const figureLineBound = shortFigureLines[i];
    const lineStartCandleTimeUnix = getUnix(figureLineBound.line_start_candle_time);

    const indexOfFirstCandle = candlesData.findIndex(
      tCandle => tCandle.originalTimeUnix === lineStartCandleTimeUnix,
    );

    if (!~indexOfFirstCandle) {
      continue;
    }

    let indexOfEndCandle = false;
    let currentPrice = candlesData[indexOfFirstCandle].high;

    if (!figureLineBound.is_worked) {
      for (let j = indexOfFirstCandle + 1; j < lCandles; j += 1) {
        currentPrice -= figureLineBound.price_angle;

        const price = candlesData[j].isLong ? candlesData[j].close : candlesData[j].open;
        const limitPrice = currentPrice + (currentPrice * (settings.ALLOWED_PERCENT / 100));
        const limitPriceForHigh = currentPrice + (currentPrice * ((settings.ALLOWED_PERCENT * 2) / 100));

        if (price > limitPrice || candlesData[j].high > limitPriceForHigh) {
          indexOfEndCandle = j;
          break;
        }
      }
    }

    if (!indexOfEndCandle) {
      indexOfEndCandle = lCandles - 1;
    }

    figureLines.push({
      boundId: figureLineBound._id,
      isLong: figureLineBound.is_long,
      isWorked: figureLineBound.is_worked,
      isModerated: figureLineBound.is_moderated,
      indexOfFirstCandle,
      indexOfEndCandle,
      lineLastPrice: currentPrice,
    });
  }

  if (figureLines.length) {
    figureLines.forEach(figureLine => {
      const key = figureLine.isLong ? 'low' : 'high';
      const lineStyle = figureLine.isWorked ? 2 : 0;
      const color = figureLine.isModerated ? constants.BLUE_COLOR : constants.GREEN_COLOR;

      const newExtraSeries = chartCandles.addExtraSeries({
        color,
        lineStyle,
        lastValueVisible: false,
      }, {
        boundId: figureLine.boundId,
        originalTimeUnix: candlesData[figureLine.indexOfFirstCandle].originalTimeUnix,
      });

      chartCandles.drawSeries(
        newExtraSeries,
        [{
          value: candlesData[figureLine.indexOfFirstCandle][key],
          time: candlesData[figureLine.indexOfFirstCandle].originalTimeUnix,
        }, {
          value: figureLine.lineLastPrice,
          time: candlesData[figureLine.indexOfEndCandle].originalTimeUnix,
        }],
      );
    });
  }
};

const changeUserFigureLineBound = async ({ boundId }, changes = {}) => {
  const resultRequest = await makeRequest({
    method: 'PUT',
    url: `${URL_CHANGE_USER_FIGURE_LINE_BOUND}/${boundId}`,
    body: changes,
  });

  if (!resultRequest || !resultRequest.status) {
    alert(resultRequest.message || `Cant makeRequest ${URL_CHANGE_USER_FIGURE_LINE_BOUND}`);
    return false;
  }

  return resultRequest.result;
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
