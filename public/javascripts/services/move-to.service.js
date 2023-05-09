/* eslint-disable */

const moveTo = {
  async moveToNextLargeCandle() {
    if (activePeriod !== AVAILABLE_PERIODS.get('5m')) {
      return true;
    }

    const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
    const chartCandles = instrumentDoc[`chart_candles_${activePeriod}`];

    document.previousTitle = document.title;
    document.title = `${instrumentDoc.name} ...`;

    const getAveragePercentFor1hCandles = async (endTimeUnix) => {
      const startOfHourUnix = endTimeUnix - (endTimeUnix % 3600);
      const startTimeUnix = startOfHourUnix - (36 * 3600);

      const getCandlesOptions = {
        period: AVAILABLE_PERIODS.get('1h'),
        instrumentId: instrumentDoc._id,

        startTime: moment.unix(startTimeUnix),
        endTime: moment.unix(startOfHourUnix),
      };

      const rawCandles1h = await getCandlesData(getCandlesOptions);
      const candles = chartCandles.prepareNewData(rawCandles1h);

      let averagePercent = 0;

      candles.forEach(c => {
        const isLong = c.close > c.open;
        const differenceBetweenPrices = isLong ? c.high - c.open : c.open - c.low;
        const percentPerPrice = 100 / (c.open / differenceBetweenPrices);

        averagePercent += percentPerPrice;
      });

      return parseFloat((averagePercent / 36).toFixed(2));
    };

    let isSuccess = false;
    const lastCandle = instrumentDoc[`candles_data_${activePeriod}`][0];
    const lastCandleTimeUnix = getUnix(lastCandle.time);
    const startFinishDatePointUnix = finishDatePointUnix;
    let startOfNextHourUnix = (lastCandleTimeUnix - (lastCandleTimeUnix % 3600) + 3599);

    await (async () => {
      while (1) {
        const averagePercent = await getAveragePercentFor1hCandles(startOfNextHourUnix);

        const getCandlesOptions = {
          period: activePeriod,
          instrumentId: instrumentDoc._id,

          startTime: moment.unix(startOfNextHourUnix),
          endTime: moment.unix(startOfNextHourUnix + 3600),
        };

        startOfNextHourUnix += 3600;

        let candles = await getCandlesData(getCandlesOptions);

        if (!candles.length) {
          alert('No candles');
          startOfNextHourUnix += (3600 * 10);
          continue;;
        }

        candles = candles.reverse();
        const preparedData = chartCandles.prepareNewData(candles, false);
        const majorOpen = preparedData[0].open;

        preparedData.every(candle => {
          const difference = Math.abs(candle.close - majorOpen);
          const percentPerOpen = 100 / (majorOpen / difference);

          if (percentPerOpen >= (averagePercent * 2) && majorOpen > candle.close) {
            isSuccess = true;
            finishDatePointUnix = candle.originalTimeUnix + 300;
            return false;
          }

          return true;
        });

        if (isSuccess) {
          const difference = finishDatePointUnix - startFinishDatePointUnix;
          document.title = document.previousTitle;

          await reloadCharts(choosenInstrumentId);

          if (!isActiveRobotTrading) {
            const days = parseInt(difference / 86400, 10);
            const hours = parseInt((difference % 86400) / 3600, 10);
            alert(`d: ${days}; h: ${hours}`);
          }

          break;
        }
      }
    })();
  },

  async moveToNextLongAverageTouched() {
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

    const limits = {
      [AVAILABLE_PERIODS.get('5m')]: 144, // half of a day
      [AVAILABLE_PERIODS.get('1h')]: 96, // 4 days
      [AVAILABLE_PERIODS.get('1d')]: 5, // 5 days
    };

    let counter = 0;
    let averagePercent = 0;
    let isLong = true;

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
          lCandles += 1;

          averagePercent = 0;
          let targetCandlesPeriod = originalData.slice(lCandles - 36, lCandles);

          targetCandlesPeriod.forEach(c => {
            const isLong = c.close > c.open;

            const differenceBetweenPrices = isLong ? c.high - c.open : c.open - c.low;
            const percentPerPrice = 100 / (c.open / differenceBetweenPrices);

            averagePercent += percentPerPrice;
          });

          averagePercent = parseFloat((averagePercent / 36).toFixed(2));

          targetCandlesPeriod = originalData.slice(
            lCandles - (settings.periodForLongMA * 2), lCandles,
          );

          let calculatedData = indicatorMovingAverageShort.calculateData(targetCandlesPeriod);
          const lastValueShortMovingAverage = calculatedData[calculatedData.length - 1].value;

          calculatedData = indicatorMovingAverageMedium.calculateData(targetCandlesPeriod);
          const lastValueMediumMovingAverage = calculatedData[calculatedData.length - 1].value;

          calculatedData = indicatorMovingAverageLong.calculateData(targetCandlesPeriod);
          const lastValueLongMovingAverage = calculatedData[calculatedData.length - 1].value;

          const isLongCurrentRound = lastValueShortMovingAverage > lastValueLongMovingAverage
            && lastValueMediumMovingAverage > lastValueLongMovingAverage;

          const isShortCurrentRound = lastValueShortMovingAverage < lastValueLongMovingAverage
            && lastValueMediumMovingAverage < lastValueLongMovingAverage;

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
            const difference = Math.abs(lastValueLongMovingAverage - (isLong ? preparedData.low : preparedData.high));
            const percentPerPrice = 100 / (lastValueLongMovingAverage / difference);

            if (percentPerPrice <= (averagePercent * 4)) {
              isSuccess = true;
              finishDatePointUnix = getUnix(candle.time) + incrementValue;
              return false;
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
      if (!isActiveRobotTrading) {
        const difference = finishDatePointUnix - startFinishDatePointUnix;
        const days = parseInt(difference / 86400, 10);
        const hours = parseInt((difference % 86400) / 3600, 10);
        alert(`d: ${days}; h: ${hours}`);
        await reloadCharts(choosenInstrumentId);
      }

      $chartsContainer
        .find(`.period_${activePeriod} .percent-average`)
        .text(`${chartCandles.calculateAveragePercent().toFixed(2)}%`);
    }
  },

  async moveToNextFigureLevel() {
    if (activePeriod === AVAILABLE_PERIODS.get('1d')) {
      return true;
    }

    let figureLevels = [];

    const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
    const chartCandles = instrumentDoc[`chart_candles_${activePeriod}`];

    document.previousTitle = document.title;
    document.title = `${instrumentDoc.name} ...`;

    const lastCandle = instrumentDoc[`candles_data_${activePeriod}`][0];
    let lastCandleTimeUnix = getUnix(lastCandle.time);

    let isSuccess = false;
    const incrementValue = AVAILABLE_PERIODS.get('5m') ? 300 : 3600;

    let candles1h = await getCandlesData({
      instrumentId: instrumentDoc._id,
      period: AVAILABLE_PERIODS.get('1h'),

      endTime: moment.unix(lastCandleTimeUnix),
    });

    candles1h = chartCandles.prepareNewData(candles1h, false);
    const startFinishDatePointUnix = finishDatePointUnix;
    const factor = activePeriod === AVAILABLE_PERIODS.get('1h') ? 6 : 10;

    let averagePercent = 0;
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
            figureLevels = calculatedFigureLevels
              // .filter(cL => !figureLevels.some(fL => fL.value === cL.levelPrice))
              .map(fL => ({
                instrumentId: instrumentDoc._id,
                timeframe: AVAILABLE_PERIODS.get('1h'),
                seriesId: (ChartCandles.getNewSeriesId() - fL.levelPrice).toString().replace('.', ''),

                isLong: fL.isLong,
                value: fL.levelPrice,
                time: fL.startOfLevelUnix,
              }));
          }

          const preparedData = chartCandles.prepareNewData([candle], false)[0];
          originalData.push(preparedData);
          lCandles += 1;

          averagePercent = 0;
          const targetCandlesPeriod = originalData.slice(lCandles - 36, lCandles);

          targetCandlesPeriod.forEach(c => {
            const isLong = c.close > c.open;

            const differenceBetweenPrices = isLong ? c.high - c.open : c.open - c.low;
            const percentPerPrice = 100 / (c.open / differenceBetweenPrices);

            averagePercent += percentPerPrice;
          });

          averagePercent = parseFloat((averagePercent / 36).toFixed(2));

          const result = figureLevels.every(figureLevel => {
            const difference = Math.abs(price - figureLevel.value);
            const percentPerPrice = 100 / (price / difference);

            if (percentPerPrice <= (averagePercent * factor)) {
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

      const shortLevels = figureLevels
        .filter(fL => !fL.isLong)
        .sort((a, b) => a.value < b.value ? 1 : -1)
        .slice(0, 3);

      const longLevels = figureLevels
        .filter(fL => fL.isLong)
        .sort((a, b) => a.value > b.value ? 1 : -1)
        .slice(0, 3);

      const levels = [...shortLevels, ...longLevels];

      localStorage.setItem(`trading-helper:${PAGE_KEY}:figure-levels`, JSON.stringify(levels));
      drawFigureLevels({ instrumentId: instrumentDoc._id }, levels);

      await reloadCharts(choosenInstrumentId);

      $chartsContainer
        .find(`.period_${activePeriod} .percent-average`)
        .text(`${chartCandles.calculateAveragePercent().toFixed(2)}%`);
    }
  },

  async moveToNextPriceJumpPlusFigureLevels() {
    if (activePeriod === AVAILABLE_PERIODS.get('1d')) {
      return true;
    }

    const figureLevels = getFigureLevelsFromLocalStorage({ instrumentId: choosenInstrumentId });

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

    let averagePercent = 0;
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

          const preparedData = chartCandles.prepareNewData([candle], false)[0];
          originalData.push(preparedData);
          lCandles += 1;

          averagePercent = 0;
          const targetCandlesPeriod = originalData.slice(lCandles - 36, lCandles);

          targetCandlesPeriod.forEach(c => {
            const isLong = c.close > c.open;

            const differenceBetweenPrices = isLong ? c.high - c.open : c.open - c.low;
            const percentPerPrice = 100 / (c.open / differenceBetweenPrices);

            averagePercent += percentPerPrice;
          });

          averagePercent = parseFloat((averagePercent / 36).toFixed(2));

          const isLong = preparedData.close > preparedData.open;
          const differenceBetweenPrices = Math.abs(preparedData.open - preparedData.close);
          const percentPerPrice = 100 / (preparedData.open / differenceBetweenPrices);

          if (percentPerPrice > (averagePercent * 5) && isLong) {
            isSuccess = true;
            finishDatePointUnix = getUnix(candle.time) + incrementValue;
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

      $chartsContainer
        .find(`.period_${activePeriod} .percent-average`)
        .text(`${chartCandles.calculateAveragePercent().toFixed(2)}%`);
    }
  },

  async moveToNextPriceJump() {
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
    let lCandles = originalData.length;

    let averagePercent = 0;
    const factor = activePeriod === AVAILABLE_PERIODS.get('1h') ? 3 : 3;

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
          lCandles += 1;

          averagePercent = 0;
          const targetCandlesPeriod = originalData.slice(lCandles - 36, lCandles);

          targetCandlesPeriod.forEach(c => {
            const isLong = c.close > c.open;

            const differenceBetweenPrices = isLong ? c.high - c.open : c.open - c.low;
            const percentPerPrice = 100 / (c.open / differenceBetweenPrices);

            averagePercent += percentPerPrice;
          });

          averagePercent = parseFloat((averagePercent / 36).toFixed(2));

          const isLong = preparedData.close > preparedData.open;
          const differenceBetweenPrices = Math.abs(preparedData.open - preparedData.close);
          const percentPerPrice = 100 / (preparedData.open / differenceBetweenPrices);

          if (percentPerPrice > (averagePercent * factor) && !isLong) {
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
      // alert(`d: ${days}; h: ${hours}`);

      await reloadCharts(choosenInstrumentId);

      $chartsContainer
        .find(`.period_${activePeriod} .percent-average`)
        .text(`${chartCandles.calculateAveragePercent().toFixed(2)}%`);
    }
  },

  async moveToNextAbsorption() {
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
    let averagePercent = 0;
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

        candles.every((candle, index) => {
          const prevCandle = candles[index - 1];

          if (!prevCandle) {
            return true;
          }

          const preparedData = chartCandles.prepareNewData([candle], false)[0];
          originalData.push(preparedData);
          lCandles += 1;

          averagePercent = 0;
          const targetCandlesPeriod = originalData.slice(lCandles - 36, lCandles);

          targetCandlesPeriod.forEach(c => {
            const isLong = c.close > c.open;

            const differenceBetweenPrices = isLong ? c.high - c.open : c.open - c.low;
            const percentPerPrice = 100 / (c.open / differenceBetweenPrices);

            averagePercent += percentPerPrice;
          });

          averagePercent = parseFloat((averagePercent / 36).toFixed(2));

          let [open, close] = prevCandle.data;
          const isLongPrevCandle = close > open;
          const differencePrevCandle = Math.abs(open - close);
          const percentPerPricePrevCandle = 100 / (open / differencePrevCandle);

          [open, close] = candle.data;
          const isLong = close > open;

          if (isLongPrevCandle !== isLong) {
            const difference = Math.abs(open - close);
            const percentPerPrice = 100 / (open / difference);

            if ((percentPerPricePrevCandle >= averagePercent && percentPerPrice >= averagePercent) && difference >= differencePrevCandle && isLong) {
              isSuccess = true;
              finishDatePointUnix = getUnix(candle.time) + incrementValue;
              return false;
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
      if (!isActiveRobotTrading) {
        const difference = finishDatePointUnix - startFinishDatePointUnix;
        const days = parseInt(difference / 86400, 10);
        const hours = parseInt((difference % 86400) / 3600, 10);
        // alert(`d: ${days}; h: ${hours}`);
        await reloadCharts(choosenInstrumentId);
      }
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
    const factor = activePeriod === AVAILABLE_PERIODS.get('1h') ? 3 : 5;

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

          if ((candle.volume / lastValue) >= factor) {
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

  async moveToNextObedientPrice() {
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

        let counterLong = 0;
        let counterShort = 0;

        candles.every(candle => {
          const preparedData = chartCandles.prepareNewData([candle], false)[0];
          originalData.push(preparedData);
          lCandles += 1;

          const isLong = preparedData.close > preparedData.open;
          let targetCandlesPeriod = originalData.slice(lCandles - (settings.periodForLongMA * 2), lCandles);

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

          if (preparedData.close > lastValueShortMovingAverage) {
            counterLong += 1;
          } else {
            counterLong = 0;
          }

          if (preparedData.close < lastValueShortMovingAverage) {
            counterShort += 1;
          } else {
            counterShort = 0;
          }

          /*
          if ((!isLong
            && isLongCurrentRound
            && counterLong >= 30
            && preparedData.close > lastValueShortMovingAverage
            && lastValueShortMovingAverage > lastValueMediumMovingAverage)
            || (isLong
            && isShortCurrentRound
            && counterShort >= 30
            && preparedData.close < lastValueShortMovingAverage
            && lastValueShortMovingAverage < lastValueMediumMovingAverage)) {
          */

          if ((isLong
            && isShortCurrentRound
            && counterShort >= 30
            && preparedData.close < lastValueShortMovingAverage
            && lastValueShortMovingAverage < lastValueMediumMovingAverage)) {
            const difference = Math.abs(lastValueShortMovingAverage - preparedData.close);
            const percentPerPrice = 100 / (lastValueShortMovingAverage / difference);

            if (percentPerPrice <= 0.2) {
              isSuccess = true;
              finishDatePointUnix = getUnix(candle.time) + incrementValue;
              return false;
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

  async moveToNextRepeatedCandles() {
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
    let lCandles = originalData.length;

    averagePercent = 0;

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

        let counterLong = 0;
        let counterShort = 0;

        let counterLongPercent = 0;
        let counterShortPercent = 0;

        candles.every(candle => {
          const preparedData = chartCandles.prepareNewData([candle], false)[0];
          originalData.push(preparedData);
          lCandles += 1;

          const isLong = preparedData.close > preparedData.open;
          let targetCandlesPeriod = originalData.slice(lCandles - 36, lCandles);

          targetCandlesPeriod.forEach(c => {
            const isLong = c.close > c.open;

            const differenceBetweenPrices = isLong ? c.high - c.open : c.open - c.low;
            const percentPerPrice = 100 / (c.open / differenceBetweenPrices);

            averagePercent += percentPerPrice;
          });

          averagePercent = parseFloat((averagePercent / 36).toFixed(2));
          const percentPerPrice = 100 / (preparedData.open / Math.abs(preparedData.open - preparedData.close));

          if (isLong) {
            counterLong += 1;
            counterShort = 0;
          } else {
            counterShort += 1;
            counterLong = 0;
          }

          if (percentPerPrice >= averagePercent) {
            if (isLong) {
              counterLongPercent += 1;
              counterShortPercent = 0;
            } else {
              counterShortPercent += 1;
              counterLongPercent = 0;
            }
          } else {
            counterLongPercent = 0;
            counterShortPercent = 0;
          }

          // if ((counterLongPercent >= 2)) {
          if ((counterShortPercent >= 3)) {
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
      if (!isActiveRobotTrading) {
        const difference = finishDatePointUnix - startFinishDatePointUnix;
        const days = parseInt(difference / 86400, 10);
        const hours = parseInt((difference % 86400) / 3600, 10);
        // alert(`d: ${days}; h: ${hours}`);
      }

      await reloadCharts(choosenInstrumentId);
    }
  },

  async moveToNextSluggishedPrice() {
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

    let counter = 0;
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
          const lastCandle = chartCandles.prepareNewData([candle], false)[0];
          originalData.push(lastCandle);
          lCandles += 1;

          const differenceBetweenLowAndHigh = Math.abs(lastCandle.high - lastCandle.low);
          const differenceBetweenOpenAndClose = Math.abs(lastCandle.open - lastCandle.close);
          const result = differenceBetweenLowAndHigh / differenceBetweenOpenAndClose;

          if (result >= 3) {
            counter += 1;
          } else {
            counter = 0;
          }

          if (counter >= 3) {
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

  async moveToNextMovingAveragesTrend() {
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
      [AVAILABLE_PERIODS.get('5m')]: 50, // half of a day
      [AVAILABLE_PERIODS.get('1h')]: 12, // 4 days
      [AVAILABLE_PERIODS.get('1d')]: 12, // 5 days
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
          const lastCandle = chartCandles.prepareNewData([candle], false)[0];
          originalData.push(lastCandle);
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

          /*
          const isShortCurrentRound = (lastValueShortMovingAverage < lastValueMediumMovingAverage);

          if (isShortCurrentRound) {
            if (lastCandle.close > lastValueMediumMovingAverage) {
              counter = 0;
            } else {
              counter += 1;
            }
          } else {
            counter = 0;
          }
          */

          // /*
          const isLongCurrentRound = (lastValueMediumMovingAverage > lastValueLongMovingAverage && lastValueShortMovingAverage > lastValueMediumMovingAverage);

          const isShortCurrentRound = (lastValueMediumMovingAverage < lastValueLongMovingAverage && lastValueShortMovingAverage < lastValueMediumMovingAverage);

          if (isLongCurrentRound) {
            // /*
            if (!isLong) {
              counter = 0;
              isLong = true;
            }

            if (lastCandle.close < lastValueMediumMovingAverage) {
              counter = 0;
            } else {
              counter += 1;
            }
            // */
          } else if (isShortCurrentRound) {
            counter = 0;
            /*
            if (isLong) {
              counter = 0;
              isLong = false;
            }

            if (lastCandle.close > lastValueMediumMovingAverage) {
              counter = 0;
            } else {
              counter += 1;
            }
            // */
          }
          // */

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

          if (counter >= limits[activePeriod] && !isLong) {
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
            lastPositionType = currentPositionType;

            if (!currentPositionType) {
              isSuccess = true;
              finishDatePointUnix = getUnix(candle.time) + incrementValue;
              return false;
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

  async moveToNearesNotification() {
    if (!notifications || !notifications.length) {
      return true;
    }

    const price = notifications[0];

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
    const isLong = price > lastCandle.data[0];
    const startFinishDatePointUnix = finishDatePointUnix;

    await (async () => {
      while (1) {
        if (lastCandleTimeUnix - startFinishDatePointUnix >= 259200) { // 3 days
          if (!confirm('>3 days, continue?')) {
            notifications = notifications.filter(n => n !== price);
            break;
          }
        }

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

          if ((isLong && preparedData.close > price)
            || (!isLong && preparedData.close < price)) {
            isSuccess = true;
            finishDatePointUnix = getUnix(candle.time) + incrementValue;
            notifications = notifications.filter(n => n !== price);
            return false;
          }

          return true;
        });

        if (isSuccess) {
          const activeTransaction = trading.getActiveTransaction(choosenInstrumentId);
          activeTransaction && drawTrades({ instrumentId: instrumentDoc._id, }, activeTransaction, choosenPeriods);
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
    } else {
      alert('>10 days');
    }
  },

  async moveToFinishTransaction(activeTransaction) {
    if (!activeTransaction || !activeTransaction.isActive) {
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
          const result = trading.nextTick(instrumentDoc, preparedData, false);

          if (result) {
            tradingList.updateTradesInTradeList(result.transaction, result.changes);

            if (result.action === EActions.get('transactionFinished')) {
              isSuccess = true;
              finishDatePointUnix = getUnix(candle.time) + incrementValue;
              return false;
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
      tradingList.setTransactions(trading.transactions);
      tradingList.updateCommonStatistics();

      if (!isActiveRobotTrading) {
        const difference = finishDatePointUnix - startFinishDatePointUnix;

        const days = parseInt(difference / 86400, 10);
        const hours = parseInt((difference % 86400) / 3600, 10);
        alert(`d: ${days}; h: ${hours}`);

        await reloadCharts(choosenInstrumentId);
        drawTrades({ instrumentId: instrumentDoc._id, }, activeTransaction, choosenPeriods);
        // finishDatePointUnix = startFinishDatePointUnix;
      }
    }
  },
};
