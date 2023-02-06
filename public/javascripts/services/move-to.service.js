// /* eslint-disable */

const moveTo = {
  async moveToNextFigureLevel() {
    if (activePeriod === AVAILABLE_PERIODS.get('1d')) {
      return true;
    }

    const figureLevels = getFigureLevelsFromLocalStorage({ instrumentId: choosenInstrumentId });

    if (!figureLevels.length) {
      return true;
    }

    const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
    const chartCandles = instrumentDoc[`chart_candles_${activePeriod}`];

    document.previousTitle = document.title;
    document.title = `${instrumentDoc.name} ...`;

    const lastCandle = instrumentDoc[`candles_data_${activePeriod}`][0];
    let lastCandleTimeUnix = getUnix(lastCandle.time);

    let incrementValue = 300;
    if (activePeriod === AVAILABLE_PERIODS.get('1h')) {
      incrementValue = 3600;
    } else if (activePeriod === AVAILABLE_PERIODS.get('1d')) {
      incrementValue = 86400;
    }

    let isSuccess = false;

    let candles1h = await getCandlesData({
      instrumentId: instrumentDoc._id,
      period: AVAILABLE_PERIODS.get('1h'),

      endTime: moment.unix(lastCandleTimeUnix),
    });

    candles1h = chartCandles.prepareNewData(candles1h, false);
    const startFinishDatePointUnix = finishDatePointUnix;

    await (async () => {
      while (1) {
        const incrementTime = lastCandleTimeUnix + (incrementValue * 500);

        const getCandlesOptions = {
          period: activePeriod,
          instrumentId: instrumentDoc._id,

          startTime: moment.unix(lastCandleTimeUnix),
          endTime: moment.unix(incrementTime),
        };

        let candles = await getCandlesData(getCandlesOptions);
        if (!candles.length) break;

        lastCandleTimeUnix = getUnix(candles[0].time);
        candles = candles.reverse();

        for await (const candle of candles) {
          const price = candle.data[1];
          const candleTimeUnix = getUnix(candle.time);

          if (candleTimeUnix % 86400 === 0) {
            const newCandles1h = await getCandlesData({
              instrumentId: instrumentDoc._id,
              period: AVAILABLE_PERIODS.get('1h'),

              endTime: moment.unix(candleTimeUnix),
              startTime: moment.unix(candles1h[candles1h.length - 1].originalTimeUnix),
            });

            candles1h.push(...chartCandles.prepareNewData(newCandles1h));

            const calculatedFigureLevels = calculateNewFigureLevels(candles1h);
            const newFigureLevels = calculatedFigureLevels
              .filter(cL => !figureLevels.some(fL => fL.value === cL.levelPrice))
              .map(fL => ({
                instrumentId: instrumentDoc._id,
                timeframe: AVAILABLE_PERIODS.get('1h'),
                seriesId: (ChartCandles.getNewSeriesId() - fL.levelPrice).toString().replace('.', ''),

                isLong: fL.isLong,
                value: fL.levelPrice,
                time: fL.startOfLevelUnix,
              }));

            if (newFigureLevels.length) {
              figureLevels.push(...newFigureLevels);
              saveFigureLevelsToLocalStorage(newFigureLevels);
              drawFigureLevels({ instrumentId: instrumentDoc._id }, newFigureLevels);
            }
          }

          const result = figureLevels.every(figureLevel => {
            const difference = Math.abs(price - figureLevel.value);
            const percentPerPrice = 100 / (price / difference);

            if (percentPerPrice <= settings.figureLevels.percentForMovingToNearestFigureLevel) {
              isSuccess = true;
              finishDatePointUnix = getUnix(candle.time) + incrementValue;
              return false;
            }

            return true;
          });

          if (!result) {
            break;
          }
        }

        if (isSuccess) {
          break;
        }
      }
    })();

    document.title = document.previousTitle;

    if (isSuccess) {
      const difference = finishDatePointUnix - startFinishDatePointUnix;

      const days = parseInt(difference / 86400, 10);
      const hours = parseInt((difference % 86400) / 3600, 10);
      alert(`d: ${days}; h: ${hours}`);

      await reloadCharts(choosenInstrumentId);
    }
  },

  async moveToNextPriceJump() {
    const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);

    document.previousTitle = document.title;
    document.title = `${instrumentDoc.name} ...`;

    const lastCandle = instrumentDoc[`candles_data_${activePeriod}`][0];
    let lastCandleTimeUnix = getUnix(lastCandle.time);

    let incrementValue = 300;
    if (activePeriod === AVAILABLE_PERIODS.get('1h')) {
      incrementValue = 3600;
    } else if (activePeriod === AVAILABLE_PERIODS.get('1d')) {
      incrementValue = 86400;
    }

    let isSuccess = false;
    const startFinishDatePointUnix = finishDatePointUnix;

    await (async () => {
      while (1) {
        const incrementTime = lastCandleTimeUnix + (incrementValue * 500);

        const getCandlesOptions = {
          period: activePeriod,
          instrumentId: instrumentDoc._id,

          startTime: moment.unix(lastCandleTimeUnix),
          endTime: moment.unix(incrementTime),
        };

        let candles = await getCandlesData(getCandlesOptions);
        if (!candles.length) break;

        lastCandleTimeUnix = getUnix(candles[0].time);
        candles = candles.reverse();

        candles.every(candle => {
          const [open, close] = candle.data;
          const isLong = close > open;
          const difference = Math.abs(open - close);
          const percentPerPrice = 100 / (open / difference);

          if (percentPerPrice >= 3 && isLong) {
            isSuccess = true;
            finishDatePointUnix = getUnix(candle.time) + incrementValue;
            return false;
          }

          return true;
        });

        if (isSuccess) {
          break;
        }
      }
    })();

    document.title = document.previousTitle;

    if (isSuccess) {
      const difference = finishDatePointUnix - startFinishDatePointUnix;

      const days = parseInt(difference / 86400, 10);
      const hours = parseInt((difference % 86400) / 3600, 10);
      alert(`d: ${days}; h: ${hours}`);

      await reloadCharts(choosenInstrumentId);
    }
  },

  async moveToNextAbsorption() {
    const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);

    document.previousTitle = document.title;
    document.title = `${instrumentDoc.name} ...`;

    const lastCandle = instrumentDoc[`candles_data_${activePeriod}`][0];
    let lastCandleTimeUnix = getUnix(lastCandle.time);

    let incrementValue = 300;
    if (activePeriod === AVAILABLE_PERIODS.get('1h')) {
      incrementValue = 3600;
    } else if (activePeriod === AVAILABLE_PERIODS.get('1d')) {
      incrementValue = 86400;
    }

    let isSuccess = false;
    const startFinishDatePointUnix = finishDatePointUnix;

    await (async () => {
      while (1) {
        const incrementTime = lastCandleTimeUnix + (incrementValue * 500);

        const getCandlesOptions = {
          period: activePeriod,
          instrumentId: instrumentDoc._id,

          startTime: moment.unix(lastCandleTimeUnix),
          endTime: moment.unix(incrementTime),
        };

        let candles = await getCandlesData(getCandlesOptions);
        if (!candles.length) break;

        lastCandleTimeUnix = getUnix(candles[0].time);
        candles = candles.reverse();

        candles.every((candle, index) => {
          const prevCandle = candles[index - 1];

          if (!prevCandle) {
            return true;
          }

          let [open, close] = prevCandle.data;
          const isLongPrevCandle = close > open;
          let difference = Math.abs(open - close);
          const percentPerPricePrevCandle = 100 / (open / difference);

          if (percentPerPricePrevCandle >= 3) {
            [open, close] = candle.data;
            const isLong = close > open;

            if (isLongPrevCandle !== isLong) {
              difference = Math.abs(open - close);
              const percentPerPrice = 100 / (open / difference);

              if (percentPerPrice >= percentPerPricePrevCandle) {
                isSuccess = true;
                finishDatePointUnix = getUnix(candle.time) + incrementValue;
                return false;
              }
            }
          }

          return true;
        });

        if (isSuccess) {
          break;
        }
      }
    })();

    document.title = document.previousTitle;

    if (isSuccess) {
      const difference = finishDatePointUnix - startFinishDatePointUnix;

      const days = parseInt(difference / 86400, 10);
      const hours = parseInt((difference % 86400) / 3600, 10);
      alert(`d: ${days}; h: ${hours}`);

      await reloadCharts(choosenInstrumentId);
    }
  },

  async moveToNextIncreasedVolume() {
    const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);

    const chartCandles = instrumentDoc[`chart_candles_${activePeriod}`];
    const indicatorVolumeAverage = instrumentDoc[`indicator_volume_average_${activePeriod}`];

    document.previousTitle = document.title;
    document.title = `${instrumentDoc.name} ...`;

    const lastCandle = instrumentDoc[`candles_data_${activePeriod}`][0];
    let lastCandleTimeUnix = getUnix(lastCandle.time);

    let incrementValue = 300;
    if (activePeriod === AVAILABLE_PERIODS.get('1h')) {
      incrementValue = 3600;
    } else if (activePeriod === AVAILABLE_PERIODS.get('1d')) {
      incrementValue = 86400;
    }

    let isSuccess = false;
    const startFinishDatePointUnix = finishDatePointUnix;

    const originalData = JSON.parse(JSON.stringify(chartCandles.originalData));
    let lCandles = originalData.length;

    await (async () => {
      while (1) {
        const incrementTime = lastCandleTimeUnix + (incrementValue * 500);

        const getCandlesOptions = {
          period: activePeriod,
          instrumentId: instrumentDoc._id,

          startTime: moment.unix(lastCandleTimeUnix),
          endTime: moment.unix(incrementTime),
        };

        let candles = await getCandlesData(getCandlesOptions);
        if (!candles.length) break;

        lastCandleTimeUnix = getUnix(candles[0].time);
        candles = candles.reverse();

        candles.every(candle => {
          const preparedData = chartCandles.prepareNewData([candle], false);
          originalData.push(preparedData[0]);
          lCandles += 1;

          const targetCandlesPeriod = originalData.slice(
            lCandles - (settings.periodForLongMA * 2), lCandles,
          );

          const calculatedData = indicatorVolumeAverage.calculateData(targetCandlesPeriod);
          const lastValue = calculatedData[calculatedData.length - 1].value;

          if ((candle.volume / lastValue) >= 5) {
            isSuccess = true;
            finishDatePointUnix = getUnix(candle.time) + incrementValue;
            return false;
          }

          return true;
        });

        if (isSuccess) {
          break;
        }
      }
    })();

    document.title = document.previousTitle;

    if (isSuccess) {
      const difference = finishDatePointUnix - startFinishDatePointUnix;

      const days = parseInt(difference / 86400, 10);
      const hours = parseInt((difference % 86400) / 3600, 10);
      alert(`d: ${days}; h: ${hours}`);

      await reloadCharts(choosenInstrumentId);
    }
  },

  async moveToNextLifetimeMovingAverage() {
    const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);

    const chartCandles = instrumentDoc[`chart_candles_${activePeriod}`];
    const indicatorMovingAverageShort = instrumentDoc[`indicator_moving_average_short_${activePeriod}`];
    const indicatorMovingAverageMedium = instrumentDoc[`indicator_moving_average_medium_${activePeriod}`];
    const indicatorMovingAverageLong = instrumentDoc[`indicator_moving_average_long_${activePeriod}`];

    document.previousTitle = document.title;
    document.title = `${instrumentDoc.name} ...`;

    const lastCandle = instrumentDoc[`candles_data_${activePeriod}`][0];
    let lastCandleTimeUnix = getUnix(lastCandle.time);

    let incrementValue = 300;
    if (activePeriod === AVAILABLE_PERIODS.get('1h')) {
      incrementValue = 3600;
    } else if (activePeriod === AVAILABLE_PERIODS.get('1d')) {
      incrementValue = 86400;
    }

    let isSuccess = false;
    const startFinishDatePointUnix = finishDatePointUnix;

    const originalData = JSON.parse(JSON.stringify(chartCandles.originalData));
    let lCandles = originalData.length;

    let counter = 0;
    let isLong = true;

    const limits = {
      [AVAILABLE_PERIODS.get('5m')]: 144, // half of a day
      [AVAILABLE_PERIODS.get('1h')]: 96, // 4 days
      [AVAILABLE_PERIODS.get('1d')]: 5, // 5 days
    };

    await (async () => {
      while (1) {
        const incrementTime = lastCandleTimeUnix + (incrementValue * 500);

        const getCandlesOptions = {
          period: activePeriod,
          instrumentId: instrumentDoc._id,

          startTime: moment.unix(lastCandleTimeUnix),
          endTime: moment.unix(incrementTime),
        };

        let candles = await getCandlesData(getCandlesOptions);
        if (!candles.length) break;

        lastCandleTimeUnix = getUnix(candles[0].time);
        candles = candles.reverse();

        candles.every(candle => {
          const preparedData = chartCandles.prepareNewData([candle], false);
          originalData.push(preparedData[0]);
          lCandles += 1;

          const targetCandlesPeriod = originalData.slice(
            lCandles - (settings.periodForLongMA * 2), lCandles,
          );

          let calculatedData = indicatorMovingAverageShort.calculateData(targetCandlesPeriod);
          const lastValueShortMovingAverage = calculatedData[calculatedData.length - 1].value;

          calculatedData = indicatorMovingAverageMedium.calculateData(targetCandlesPeriod);
          const lastValueMediumMovingAverage = calculatedData[calculatedData.length - 1].value;

          calculatedData = indicatorMovingAverageLong.calculateData(targetCandlesPeriod);
          const lastValueLongMovingAverage = calculatedData[calculatedData.length - 1].value;

          const isLongCurrentRound = (lastValueShortMovingAverage && lastValueMediumMovingAverage)
            > lastValueLongMovingAverage;

          const isShortCurrentRound = (lastValueShortMovingAverage && lastValueMediumMovingAverage)
            < lastValueLongMovingAverage;

          if (isLongCurrentRound || isShortCurrentRound) {
            if (isLongCurrentRound && !isLong) {
              counter = 0;
              isLong = true;
            } else if (isShortCurrentRound && isLong) {
              counter = 0;
              isLong = false;
            } else {
              counter += 1;
            }
          }

          if (counter >= limits[activePeriod]) {
            isSuccess = true;
            finishDatePointUnix = getUnix(candle.time) + incrementValue;
            return false;
          }

          return true;
        });

        if (isSuccess) {
          break;
        }
      }
    })();

    document.title = document.previousTitle;

    if (isSuccess) {
      const difference = finishDatePointUnix - startFinishDatePointUnix;

      const days = parseInt(difference / 86400, 10);
      const hours = parseInt((difference % 86400) / 3600, 10);
      alert(`d: ${days}; h: ${hours}`);

      await reloadCharts(choosenInstrumentId);
    }
  },

  async moveToNextMovingAveragesCrossed() {
    const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);

    const chartCandles = instrumentDoc[`chart_candles_${activePeriod}`];
    const indicatorMovingAverageShort = instrumentDoc[`indicator_moving_average_short_${activePeriod}`];
    const indicatorMovingAverageMedium = instrumentDoc[`indicator_moving_average_medium_${activePeriod}`];
    const indicatorMovingAverageLong = instrumentDoc[`indicator_moving_average_long_${activePeriod}`];

    document.previousTitle = document.title;
    document.title = `${instrumentDoc.name} ...`;

    const lastCandle = instrumentDoc[`candles_data_${activePeriod}`][0];
    let lastCandleTimeUnix = getUnix(lastCandle.time);

    let incrementValue = 300;
    if (activePeriod === AVAILABLE_PERIODS.get('1h')) {
      incrementValue = 3600;
    } else if (activePeriod === AVAILABLE_PERIODS.get('1d')) {
      incrementValue = 86400;
    }

    let isSuccess = false;
    const startFinishDatePointUnix = finishDatePointUnix;

    const originalData = JSON.parse(JSON.stringify(chartCandles.originalData));
    let lCandles = originalData.length;

    let lastPositionType = null;

    await (async () => {
      while (1) {
        const incrementTime = lastCandleTimeUnix + (incrementValue * 500);

        const getCandlesOptions = {
          period: activePeriod,
          instrumentId: instrumentDoc._id,

          startTime: moment.unix(lastCandleTimeUnix),
          endTime: moment.unix(incrementTime),
        };

        let candles = await getCandlesData(getCandlesOptions);
        if (!candles.length) break;

        lastCandleTimeUnix = getUnix(candles[0].time);
        candles = candles.reverse();

        candles.every(candle => {
          const preparedData = chartCandles.prepareNewData([candle], false);
          originalData.push(preparedData[0]);
          lCandles += 1;

          const targetCandlesPeriod = originalData.slice(
            lCandles - (settings.periodForLongMA * 2), lCandles,
          );

          let calculatedData = indicatorMovingAverageShort.calculateData(targetCandlesPeriod);
          const lastValueShortMovingAverage = calculatedData[calculatedData.length - 1].value;

          calculatedData = indicatorMovingAverageMedium.calculateData(targetCandlesPeriod);
          const lastValueMediumMovingAverage = calculatedData[calculatedData.length - 1].value;

          calculatedData = indicatorMovingAverageLong.calculateData(targetCandlesPeriod);
          const lastValueLongMovingAverage = calculatedData[calculatedData.length - 1].value;

          const currentPositionType = lastValueMediumMovingAverage > lastValueLongMovingAverage;

          if (lastPositionType === null) {
            lastPositionType = currentPositionType;
            return true;
          }

          if (lastPositionType !== currentPositionType) {
            isSuccess = true;
            finishDatePointUnix = getUnix(candle.time) + incrementValue;
            return false;
          }

          return true;
        });

        if (isSuccess) {
          break;
        }
      }
    })();

    document.title = document.previousTitle;

    if (isSuccess) {
      const difference = finishDatePointUnix - startFinishDatePointUnix;

      const days = parseInt(difference / 86400, 10);
      const hours = parseInt((difference % 86400) / 3600, 10);
      alert(`d: ${days}; h: ${hours}`);

      await reloadCharts(choosenInstrumentId);
    }
  },

  async moveToFinishTrade(activeTrade) {
    if (!activeTrade) {
      return true;
    }

    const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
    const chartCandles = instrumentDoc[`chart_candles_${activePeriod}`];

    document.previousTitle = document.title;
    document.title = `${instrumentDoc.name} ...`;

    const lastCandle = instrumentDoc[`candles_data_${activePeriod}`][0];
    let lastCandleTimeUnix = getUnix(lastCandle.time);

    let incrementValue = 300;
    if (activePeriod === AVAILABLE_PERIODS.get('1h')) {
      incrementValue = 3600;
    } else if (activePeriod === AVAILABLE_PERIODS.get('1d')) {
      incrementValue = 86400;
    }

    let isSuccess = false;
    const startFinishDatePointUnix = finishDatePointUnix;
    const originalData = JSON.parse(JSON.stringify(chartCandles.originalData));

    await (async () => {
      while (1) {
        const incrementTime = lastCandleTimeUnix + (incrementValue * 500);

        const getCandlesOptions = {
          period: activePeriod,
          instrumentId: instrumentDoc._id,

          startTime: moment.unix(lastCandleTimeUnix),
          endTime: moment.unix(incrementTime),
        };

        let candles = await getCandlesData(getCandlesOptions);
        if (!candles.length) break;

        lastCandleTimeUnix = getUnix(candles[0].time);
        candles = candles.reverse();

        candles.every(candle => {
          const preparedData = chartCandles.prepareNewData([candle], false)[0];
          originalData.push(preparedData);

          const isFinished = trading.nextTick(instrumentDoc, preparedData, choosenPeriods, false);

          if (isFinished) {
            isSuccess = true;
            finishDatePointUnix = getUnix(candle.time) + incrementValue;
            return false;
          }

          return true;
        });

        if (isSuccess) {
          break;
        }
      }
    })();

    document.title = document.previousTitle;

    if (isSuccess) {
      const difference = finishDatePointUnix - startFinishDatePointUnix;

      const days = parseInt(difference / 86400, 10);
      const hours = parseInt((difference % 86400) / 3600, 10);
      alert(`d: ${days}; h: ${hours}`);

      await reloadCharts(choosenInstrumentId);

      choosenPeriods.forEach(period => {
        const chartCandles = instrumentDoc[`chart_candles_${period}`];
        const lastCandle = instrumentDoc[`candles_data_${period}`][0];
        const lastCandleTimeUnix = getUnix(lastCandle.time);

        const series = Trading.makeTradeSeries(instrumentDoc, activeTrade, period);

        let startAt = activeTrade.startAt;

        if (period === AVAILABLE_PERIODS.get('1h')) {
          startAt -= startAt % 3600;
        } else if (period === AVAILABLE_PERIODS.get('1d')) {
          startAt -= startAt % 86400;
        }

        series.forEach(s => {
          chartCandles.drawSeries(
            s,
            [{
              value: s.value,
              time: startAt,
            }, {
              value: s.value,
              time: lastCandleTimeUnix,
            }],
          );
        });
      });
    }
  },
};
