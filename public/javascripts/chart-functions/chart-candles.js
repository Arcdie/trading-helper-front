/* global
functions, getUnix,
objects, moment, LightweightCharts */

class ChartCandles {
  constructor($rootContainer, period) {
    this.containerName = 'chart-candles';
    this.appendChart($rootContainer);

    this.$containerDocument = $rootContainer.find(`.${this.containerName}`);
    this.containerWidth = this.$containerDocument[0].clientWidth;
    this.containerHeight = this.$containerDocument[0].clientHeight;

    this.addChart();
    this.addMainSeries();

    this.period = period;

    this.maxTopPriceValue;
    this.maxBottomPriceValue;

    this.markers = [];
    this.extraSeries = [];

    this.originalData = [];
  }

  appendChart($rootContainer) {
    $rootContainer.append(`<div class="${this.containerName}"></div>`);
  }

  setOriginalData(instrumentData) {
    const preparedData = this.prepareNewData(instrumentData);
    this.originalData.unshift(...preparedData);
    return preparedData;
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
        rightOffset: 12,
        secondsVisible: false,
      },

      priceScale: {
        // autoScale: false,
      },

      handleScale: {
        axisPressedMouseMove: {
          time: true,
          price: false,
        },
      },
    });
  }

  addMainSeries() {
    this.mainSeries = this.chart.addCandlestickSeries({
      upColor: '#000FFF',
      downColor: 'rgba(0, 0, 0, 0)',
      borderDownColor: '#000FFF',
      wickColor: '#000000',

      autoscaleInfoProvider: original => {
        const res = original();

        if (res && res.priceRange) {
          let wereChanges = false;

          if (this.maxTopPriceValue !== res.priceRange.maxValue) {
            wereChanges = true;
            this.maxTopPriceValue = res.priceRange.maxValue;
          }

          if (this.maxBottomPriceValue !== res.priceRange.minValue) {
            wereChanges = true;
            this.maxBottomPriceValue = res.priceRange.minValue;
          }

          if (wereChanges) {
            this.changePriceRangeForExtraSeries(res.priceRange);
          }
        }

        return res;
      },
    });
  }

  addExtraSeries() {
    const newExtraSeries = this.chart.addLineSeries({
      priceLineSource: false,
      priceLineVisible: false,
      lastValueVisible: true,
      lineWidth: 1,
      priceScaleId: 'level',

      // lineType: LightweightCharts.LineType.Simple,
      // lineStyle: LightweightCharts.LineStyle.LargeDashed,
    });

    newExtraSeries.id = new Date().getTime();
    this.extraSeries.push(newExtraSeries);
    return newExtraSeries;
  }

  addMarker(data) {
    this.markers.push(data);
  }

  drawSeries(series, data) {
    if (Array.isArray(data)) {
      series.setData(data);
    } else {
      series.update(data);
    }
  }

  drawMarkers() {
    this.mainSeries.setMarkers(this.markers.map(marker => ({
      time: marker.time,
      color: marker.color,
      text: marker.text,
      position: 'aboveBar',
      shape: 'arrowDown',
    })));
  }

  removeChart() {
    this.removeSeries();
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

  changePriceRangeForExtraSeries({
    minValue,
    maxValue,
  }) {
    this.extraSeries.forEach(series => {
      series.applyOptions({
        autoscaleInfoProvider: () => ({
          priceRange: {
            minValue,
            maxValue,
          },
        }),
      });
    });
  }

  prepareNewData(instrumentData) {
    const isUnixTime = ['1m', '5m', '1h', '4h'].includes(this.period);
    const userTimezone = -(new Date().getTimezoneOffset());

    const validData = instrumentData
      .map(data => {
        const timeUnix = getUnix(data.time);

        return {
          originalTime: data.time,
          originalTimeUnix: timeUnix,
          time: isUnixTime ?
            timeUnix + (userTimezone * 60)
            : moment(data.time).add(userTimezone, 'minutes').format('YYYY-MM-DD'),

          open: data.data[0],
          close: data.data[1],
          low: data.data[2],
          high: data.data[3],
          volume: data.volume,
        };
      })
      .sort((a, b) => {
        if (a.originalTimeUnix < b.originalTimeUnix) {
          return -1;
        }

        return 1;
      });

    return validData;
  }
}
