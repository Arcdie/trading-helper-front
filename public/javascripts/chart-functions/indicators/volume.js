/* global
functions,
objects, LightweightCharts */

class IndicatorVolume {
  constructor($rootContainer) {
    this.containerName = 'chart-volume';
    this.appendChart($rootContainer);

    this.$containerDocument = $rootContainer.find(`.${this.containerName}`);
    this.containerWidth = this.$containerDocument[0].clientWidth;
    this.containerHeight = this.$containerDocument[0].clientHeight;

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

    this.series = this.chart.addHistogramSeries({
      color: 'rgba(12, 50, 153, .5)',

      priceFormat: {
        type: 'volume',
      },
    });
  }

  appendChart($rootContainer) {
    $rootContainer.append(`<div class="${this.containerName}"></div>`);
  }

  drawSeries(data) {
    if (Array.isArray(data)) {
      this.series.setData(data.map(candle => ({
        time: candle.time,
        value: candle.volume,
      })));
    } else {
      this.series.update({
        time: data.time,
        value: data.volume,
      });
    }
  }
}
