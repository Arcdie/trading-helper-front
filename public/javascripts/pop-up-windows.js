const windows = {
  getTVChart(instrumentName, containerId = 'tradingview_532c8') {
    return `<div class="window tv-chart-window">
      <button class="close"></button>

      <div class="tradingview-widget-container">
        <div id="tradingview_532c8"></div>
        <script type="text/javascript">
          new TradingView.widget({
            "width": 980,
            "height": 610,
            "symbol": "${instrumentName}",
            "interval": "5",
            "timezone": "Etc/UTC",
            "theme": "light",
            "style": "1",
            "locale": "ru",
            "toolbar_bg": "#f1f3f6",
            "enable_publishing": false,
            "hide_legend": true,
            "hide_side_toolbar": false,
            "save_image": false,
            "container_id": "${containerId}"
          });
        </script>
      </div>
    </div>`;
  },

  // levels-monitoring
  getLevelsMonitoringSettings(settings) {
    return `<div class="window levels-monitroing-settings">
      <button class="close"></button>

      <div class="levels-monitroing-settings-container">
        <h2>Настройка уровней</h2>
        <div class="levels-settings">
          <ul>
            <li>
              <input type="checkbox" id="is_draw_levels_for_1h_candles" ${settings.is_draw_levels_for_1h_candles ? 'checked' : ''}>
              <label for="is_draw_levels_for_1h_candles">Рисовать уровни для часовых свеч</label>
            </li>

            <li>
              <input type="checkbox" id="is_draw_levels_for_4h_candles" ${settings.is_draw_levels_for_4h_candles ? 'checked' : ''}>
              <label for="is_draw_levels_for_4h_candles">Рисовать уровни для 4-х часовых свеч</label>
            </li>

            <li>
              <input type="checkbox" id="is_draw_levels_for_1d_candles" ${settings.is_draw_levels_for_1d_candles ? 'checked' : ''}>
              <label for="is_draw_levels_for_day_candles">Рисовать уровни для дневых свеч</label>
            </li>
          </ul>

          <div id="number_candles_for_calculate_1h_levels">
            <p>К-во свечей для расчета часовых уровней</p>
            <input type="text" value="${settings.number_candles_for_calculate_1h_levels || 10}">
          </div>

          <div id="number_candles_for_calculate_4h_levels">
            <p>К-во свечей для расчета 4х-часовых уровней</p>
            <input type="text" value="${settings.number_candles_for_calculate_4h_levels || 10}">
          </div>

          <div id="number_candles_for_calculate_1d_levels">
            <p>К-во свечей для расчета дневных уровней</p>
            <input type="text" value="${settings.number_candles_for_calculate_1d_levels || 10}">
          </div>

          <button id="save-settings">Сохранить</button>
        </div>
      </div>
    </div>`;
  },

  getLevelsLoadingPage(lInstruments) {
    return `<div class="window levels-loading-page">
      <div class="levels-loading-page-container">
        <h2>Загрузка уровней..</h2>
        <p><span id="amount-loaded-levels">0</span> / ${lInstruments}</p>
      </div>
    </div>`;
  },

  // volume-monitoring
  getVolumeMonitoringSettings(settings) {
    return `<div class="window volume-monitroing-settings">
      <button class="close"></button>

      <div class="volume-monitroing-settings-container">
        <h2>Настройка Spot</h2>
        <div class="spot-settings">
          <ul>
            <li>
              <input type="checkbox" id="do_spot_sort_by_distace_to_price" ${settings.do_spot_sort_by_distace_to_price ? 'checked' : ''}>
              <label for="do_spot_sort_by_distace_to_price">Сортировать по % от цены</label>
            <li/>

            <li>
              <input type="checkbox" id="do_spot_sort_by_lifetime" ${settings.do_spot_sort_by_lifetime ? 'checked' : ''}>
              <label for="do_spot_sort_by_lifetime">Сортировать по времени жизни</label>
            <li/>
          </ul>
        </div>

        <h2>Настройка Futures</h2>
        <div class="futures-settings">
          <ul>
            <li>
              <input type="checkbox" id="do_futures_sort_by_distace_to_price" ${settings.do_futures_sort_by_distace_to_price ? 'checked' : ''}>
              <label for="do_futures_sort_by_distace_to_price">Сортировать по % от цены</label>
            <li/>
            <li>
              <input type="checkbox" id="do_futures_sort_by_lifetime" ${settings.do_futures_sort_by_lifetime ? 'checked' : ''}>
              <label for="do_futures_sort_by_lifetime">Сортировать по времени жизни</label>
            <li/>
          </ul>
        </div>

        <button id="save-settings">Сохранить</button>
      </div>
    </div>`;
  },

  // <iframe src="https://google.com" width="700" height="200" align="left">
  //    Ваш браузер не поддерживает плавающие фреймы!
  // </iframe>
};
