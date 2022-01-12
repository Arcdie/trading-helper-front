/* global
variables, constants,
functions,
objects, LightweightCharts */

class IndicatorCumulativeDeltaVolume {
  constructor($rootContainer) {
    this.containerName = 'chart-cumulative-delta-volume';
    this.appendChart($rootContainer);

    this.$containerDocument = $rootContainer.find(`.${this.containerName}`);
    this.containerWidth = this.$containerDocument[0].clientWidth;
    this.containerHeight = this.$containerDocument[0].clientHeight;

    this.addChart();
    this.addMainSeries({});

    this.extraSeries = [];
  }

  appendChart($rootContainer) {
    $rootContainer.append(`<div class="${this.containerName}"></div>`);
  }

  addChart() {
    this.chart = LightweightCharts.createChart(this.$containerDocument[0], {
      width: this.containerWidth,
      height: this.containerHeight,
    });

    this.chart.applyOptions({
      layout: {
        backgroundColor: 'white',
      },

      crosshair: {
        mode: 0,
      },

      timeScale: {
        secondsVisible: false,
      },

      rightPriceScale: {
        width: 60,
      },
    });
  }

  addMainSeries(optionalParams) {
    this.mainSeries = this.chart.addCandlestickSeries({
      upColor: 'rgb(0, 230, 118)',
      downColor: 'rgb(255, 82, 82)',
      wickColor: '#000000',

      priceFormat: {
        type: 'volume',
      },

      ...optionalParams,
    });
  }

  addExtraSeries(optionalParams) {
    const newExtraSeries = this.chart.addLineSeries({
      priceLineSource: false,
      priceLineVisible: false,
      lastValueVisible: true,
      lineWidth: 1,

      ...optionalParams,
      // lineType: LightweightCharts.LineType.Simple,
      // lineStyle: LightweightCharts.LineStyle.LargeDashed,
    });

    newExtraSeries.id = new Date().getTime();
    this.extraSeries.push(newExtraSeries);
    return newExtraSeries;
  }

  removeChart() {
    this.removeSeries(this.mainSeries);
    this.chart.remove();
  }

  removeSeries(series, isMainSeries) {
    this.chart.removeSeries(series);

    if (isMainSeries) {
      this.mainSeries = false;
    } else {
      this.extraSeries = this.extraSeries.filter(
        extraSeries => extraSeries.id !== series.id,
      );
    }
  }

  drawSeries(series, data) {
    if (Array.isArray(data)) {
      series.setData(data);
    } else {
      series.update(data);
    }
  }

  calculateData(inputData) {
    const workingData = JSON.parse(JSON.stringify(inputData));
    const lData = workingData.length;

    const rate = (cond, options) => {
      const v1 = (options.upperShadow + options.bottomShadow + (cond ? 2 * options.bodyCandle : 0));
      const v2 = (options.upperShadow + options.bottomShadow + options.bodyCandle);

      const ret = 0.5 * (v1 / v2);
      return ret || 0.5;
    };

    let sumDelta = 0;

    for (let i = 0; i < lData; i += 1) {
      const candle = workingData[i];
      const prevCandle = workingData[i - 1];

      const upperShadow = candle.high - Math.max(candle.open, candle.close);
      const bottomShadow = Math.min(candle.open, candle.close) - candle.low;
      const bodyCandle = Math.abs(candle.close - candle.open);

      const options = {
        upperShadow,
        bottomShadow,
        bodyCandle,
      };

      const deltaUp = candle.volume * rate(candle.open <= candle.close, options);
      const deltaDown = candle.volume * rate(candle.open > candle.close, options);

      const delta = candle.close >= candle.open ? deltaUp : -deltaDown;

      sumDelta += parseInt(delta, 10);

      candle.sumDelta = sumDelta;

      const prevCandleSumDelta = (prevCandle && prevCandle.sumDelta) || 0;

      const o = prevCandleSumDelta;
      const h = Math.max(candle.sumDelta, prevCandleSumDelta);
      const l = Math.min(candle.sumDelta, prevCandleSumDelta);
      const c = candle.sumDelta;

      const haClose = (o + h + l + c) / 4;
      const haOpen = !prevCandle ? ((o + c) / 2) : ((prevCandle.haOpen + prevCandle.haClose) / 2);
      const haHigh = Math.max(h, Math.max(haOpen, haClose));
      const haLow = Math.min(l, Math.min(haOpen, haClose));

      candle.haOpen = haOpen;
      candle.haClose = haClose;
      candle.haHigh = haHigh;
      candle.haLow = haLow;
    }

    return workingData;
  }

  calculateAndDraw(inputData) {
    const workingData = this.calculateData(inputData);

    const dataForDraw = workingData.map(data => ({
      open: data.haOpen,
      close: data.haClose,
      low: data.haLow,
      high: data.haHigh,

      time: data.originalTimeUnix,
    }));

    this.drawSeries(this.mainSeries, dataForDraw);

    return workingData;
  }
}
