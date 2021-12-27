/* global
functions, getUnix,
objects, moment, LightweightCharts */

class ChartBaseline {
  constructor($rootContainer) {
    this.containerName = 'chart-baseline';
    this.appendChart($rootContainer);

    this.$containerDocument = $rootContainer.find(`.${this.containerName}`);
    this.containerWidth = this.$containerDocument[0].clientWidth;
    this.containerHeight = this.$containerDocument[0].clientHeight;

    this.addChart();

    this.addMainSeries({});
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
        rightOffset: 12,
        secondsVisible: false,
      },

      handleScale: {
        axisPressedMouseMove: {
          time: true,
          price: false,
        },
      },

      rightPriceScale: {
        width: 60,
      },
    });
  }

  addMainSeries(optionalParams) {
    this.mainSeries = this.chart.addAreaSeries({
      upColor: '#000FFF',
      downColor: 'rgba(0, 0, 0, 0)',
      borderDownColor: '#000FFF',
      wickColor: '#000000',

      ...optionalParams,
    });
  }

  drawSeries(series, data) {
    if (Array.isArray(data)) {
      series.setData(data);
    } else {
      series.update(data);
    }
  }

  removeChart() {
    this.removeSeries(this.mainSeries);
    this.chart.remove();
  }

  removeSeries(series, isMainSeries) {
    this.chart.removeSeries(series);

    if (isMainSeries) {
      this.mainSeries = false;
    }
  }
}
