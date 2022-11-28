class ListInstruments {
  constructor() {
    this.$instrumentsContainer = $('.instruments-container');
    this.$instrumentsList = this.$instrumentsContainer.find('.instruments-list .list');
  }

  init() {
    const windowHeight = window.innerHeight;

    if (!this.$instrumentsContainer.length) {
      alert(`No block for changing height (${ListInstruments.name})`);
      return;
    }

    this.$instrumentsContainer
      .css({ maxHeight: windowHeight });
  }

  renderListInstruments(instrumentsDocs = []) {
    let appendInstrumentsStr = '';

    instrumentsDocs
      .forEach(doc => {
        appendInstrumentsStr += `<div
          id="instrument-${doc._id}"
          class="instrument"
          data-instrumentid=${doc._id}>
          <span class="instrument-name">${doc.name}</span>
        </div>`;
      });

    this.$instrumentsList
      .empty()
      .append(appendInstrumentsStr);
  }
}
