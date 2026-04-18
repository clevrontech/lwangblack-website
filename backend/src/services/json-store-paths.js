const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

module.exports = {
  DATA_DIR,
  file: (name) => path.join(DATA_DIR, name),
};
